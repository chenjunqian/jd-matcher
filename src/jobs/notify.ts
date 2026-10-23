import type { Env, UserMatchedDetailJob } from "../lib/types.js";
import { getAllUserInfoCount, getUserInfoList, setNotifyOptOut } from "../lib/db/user_info.js";
import {
  getUserNonNotifiedJobTotalCount,
  getUserNonNotifiedJobList,
  updateMatchJobsNotifiedByIds,
} from "../lib/db/user_matched_job.js";
import { filterAgencyJobs, jobDetailFields } from "../lib/crawler/agency_blocklist.js";
import { buildJobNotificationHtml, buildJobNotificationText } from "../lib/email/template.js";
import { buildUnsubscribeUrl } from "../lib/unsubscribe/token.js";

function buildMessage(jobs: UserMatchedDetailJob[]): string {
  let msg = "You have new matched jobs, please check.\n\n";
  for (const j of jobs) {
    msg += `Title : ${j.title}\nLink : ${j.link}\nLocation : ${j.location}\nSalary : ${j.salary}\nMatch Score : ${j.matchScore}\nMatch Reason : ${j.matchReason}\nDate : ${(j.updateTime ?? "").split("T")[0]}\n\n`;
  }
  msg += "You can use /jobs to get all available jobs for you.";
  return msg;
}

async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<{ ok: boolean; description?: string }> {
  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const body = await resp.json() as { ok: boolean; description?: string };
  return { ok: body.ok, description: body.description };
}

/** Telegram errors that mean "this user will never receive chat messages again". */
const TELEGRAM_OPT_OUT_HINTS = [
  "bot was blocked by the user",
  "user is deactivated",
  "chat not found",
  "bot was kicked",
];

function isOptOutError(description?: string): boolean {
  if (!description) return false;
  const d = description.toLowerCase();
  return TELEGRAM_OPT_OUT_HINTS.some((h) => d.includes(h));
}

export async function sendJobsInChunks(env: Env, telegramId: string, jobs: UserMatchedDetailJob[], userId: string): Promise<void> {
  let pendingJobs = jobs.slice();
  let batchSize = pendingJobs.length;

  while (pendingJobs.length > 0) {
    const batch = pendingJobs.slice(0, batchSize);
    const batchJobIds = batch.map((j) => j.id);
    const resp = await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramId, buildMessage(batch));

    if (resp.ok) {
      await updateMatchJobsNotifiedByIds(env.DB, userId, batchJobIds);
      pendingJobs = pendingJobs.slice(batchSize);
      batchSize = pendingJobs.length;
      continue;
    }

    // The user blocked the bot / deleted the chat: treat as a Telegram opt-out
    // instead of retrying forever through the queue.
    if (isOptOutError(resp.description)) {
      console.log(`[notify] user ${userId} blocked the bot (${resp.description}) → telegram opt-out`);
      await setNotifyOptOut(env.DB, userId, "telegram", true);
      return;
    }

    if (resp.description?.includes("message is too long")) {
      if (batch.length <= 1) {
        console.log(`[notify] skipping too-long job ${batch[0].id} for user ${userId}`);
        await updateMatchJobsNotifiedByIds(env.DB, userId, [batch[0].id]);
        pendingJobs = pendingJobs.slice(1);
        batchSize = pendingJobs.length;
        continue;
      }
      const newSize = Math.ceil(batch.length / 2);
      console.log(`[notify] splitting message for user ${userId}: ${batch.length} → ${newSize} jobs`);
      batchSize = newSize;
      continue;
    }

    throw new Error(`[notify] telegram error for user ${userId}: ${JSON.stringify(resp)}`);
  }
}

async function sendEmailNotification(
  env: Env,
  email: string,
  jobs: UserMatchedDetailJob[],
  userId: string,
): Promise<void> {
  const unsubUrl = await buildUnsubscribeUrl(env.APP_URL, env.UNSUBSCRIBE_SECRET, userId, "email");
  await env.EMAIL.send({
    to: email,
    from: { email: "jdmatcher@guoshaotech.com", name: "JD Matcher" },
    subject: "New Job Matches for You",
    html: buildJobNotificationHtml(jobs, unsubUrl),
    text: buildJobNotificationText(jobs, unsubUrl),
    // Gmail/Yahoo bulk-sender requirements (RFC 2369 + RFC 8058): without these
    // the built-in "Unsubscribe" button is missing and deliverability suffers.
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "Auto-Submitted": "auto-generated",
    },
  });
  await updateMatchJobsNotifiedByIds(env.DB, userId, jobs.map(j => j.id));
}

export async function handleNotify(env: Env): Promise<void> {
  const LOCK_KEY = "notify-last-run";
  const LOCK_TTL = 60;

  const existing = await env.SESSION_KV.get(LOCK_KEY);
  if (existing) {
    console.log("[notify] skipped — another notify run is in progress");
    return;
  }
  await env.SESSION_KV.put(LOCK_KEY, "1", { expirationTtl: LOCK_TTL });

  try {
    const total = await getAllUserInfoCount(env.DB);
    if (!total) { console.log("[notify] no users"); return; }

    const BATCH = 100;
    for (let off = 0; off < total; off += BATCH) {
      const users = await getUserInfoList(env.DB, off, BATCH);
      for (const u of users) {
        if (!u.telegramId && !u.email) continue;
        try {
          const cnt = await getUserNonNotifiedJobTotalCount(env.DB, u.id);
          if (!cnt) continue;
          const fetched = await getUserNonNotifiedJobList(env.DB, u.id, 0, 10);

          // Legacy talent-agency / marketplace matches may already be stored in
          // D1: never notify them and retire them so they are not re-checked.
          const { jobs, filtered: agencyJobs } = filterAgencyJobs(fetched, jobDetailFields);
          if (agencyJobs.length) {
            console.log(`[notify] 🚫 skipped ${agencyJobs.length} agency posting(s) for user ${u.id}`);
            await updateMatchJobsNotifiedByIds(env.DB, u.id, agencyJobs.map(({ job }) => job.id));
          }
          if (!jobs.length) continue;

          const canTelegram = !!u.telegramId && !u.telegramOptOut;
          const canEmail = !!u.email && !u.emailOptOut;

          // Fully opted out: retire the rows instead of re-scanning them every run.
          if (!canTelegram && !canEmail) {
            console.log(`[notify] user ${u.id} has opted out of all channels — skipped`);
            await updateMatchJobsNotifiedByIds(env.DB, u.id, jobs.map((j) => j.id));
            continue;
          }

          if (canTelegram) {
            await sendJobsInChunks(env, u.telegramId!, jobs, u.id);
          }
          if (canEmail) {
            await sendEmailNotification(env, u.email!, jobs, u.id);
          }
          console.log(
            `[notify] notified user ${u.id} (tg:${canTelegram ? u.telegramId : "off"} email:${canEmail ? u.email : "off"})`,
          );
        } catch (e) { console.error(`[notify] failed for user ${u.id}:`, e); }
      }
    }
    console.log("[notify] done");
  } finally {
    await env.SESSION_KV.delete(LOCK_KEY);
  }
}
