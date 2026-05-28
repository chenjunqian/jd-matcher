import type { Env, UserMatchedDetailJob } from "../lib/types.js";
import { getAllUserInfoCount, getUserInfoList } from "../lib/db/user_info.js";
import {
  getUserNonNotifiedJobTotalCount,
  getUserNonNotifiedJobList,
  updateMatchJobsNotifiedByIds,
} from "../lib/db/user_matched_job.js";

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
        if (!u.telegramId) continue;
        try {
          const cnt = await getUserNonNotifiedJobTotalCount(env.DB, u.id);
          if (!cnt) continue;
          const jobs = await getUserNonNotifiedJobList(env.DB, u.id, 0, 10);
          if (!jobs.length) continue;

          await sendJobsInChunks(env, u.telegramId, jobs, u.id);
          console.log(`[notify] notified user ${u.id} (${u.telegramId})`);
        } catch (e) { console.error(`[notify] failed for user ${u.id}:`, e); }
      }
    }
    console.log("[notify] done");
  } finally {
    await env.SESSION_KV.delete(LOCK_KEY);
  }
}
