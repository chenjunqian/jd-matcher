import type { Env } from "../lib/types.js";
import { getAllUserInfoCount, getUserInfoList } from "../lib/db/user_info.js";
import { getUserNonNotifiedJobTotalCount, getUserNonNotifiedJobList, updateAllMatchJobNotified } from "../lib/db/user_matched_job.js";

export async function handleNotify(env: Env): Promise<void> {
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

        let msg = "You have new matched jobs, please check.\n\n";
        for (const j of jobs) {
          msg += `Title : ${j.title}\nLink : ${j.link}\nLocation : ${j.location}\nSalary : ${j.salary}\nMatch Score : ${j.matchScore}\nMatch Reason : ${j.matchReason}\nDate : ${(j.updateTime ?? "").split("T")[0]}\n\n`;
        }
        msg += "You can use /jobs to get all available jobs for you.";

        const resp = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: u.telegramId, text: msg }),
        });

        if (resp.ok) {
          await updateAllMatchJobNotified(env.DB, u.id);
          console.log(`[notify] notified user ${u.id} (${u.telegramId})`);
        } else {
          console.error(`[notify] telegram error for ${u.id}: ${await resp.text()}`);
        }
      } catch (e) { console.error(`[notify] failed for user ${u.id}:`, e); }
    }
  }
  console.log("[notify] done");
}
