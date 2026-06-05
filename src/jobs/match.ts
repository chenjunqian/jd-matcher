import type { Env, UserMatchedJobPromptInput } from "../lib/types.js";
import { getUsersWithResume } from "../lib/db/user_info.js";
import { getJobDetailsByIds } from "../lib/db/job_detail.js";
import { createMatchJobIfNotExist, getExistingMatchedJobIds } from "../lib/db/user_matched_job.js";
import { getVectorById, querySimilar } from "../lib/vectorize/index.js";
import { callAgent } from "./agent_client.js";

function oneMonthAgo(): string {
  const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split("T")[0];
}

export async function handleMatch(env: Env, offset: number): Promise<void> {
  const users = await getUsersWithResume(env.DB, offset, 1);
  if (!users.length) {
    console.log(`[match] no user at offset ${offset}`);
    return;
  }

  const user = users[0];

  const vec = await getVectorById(env.RESUME_EMBEDDINGS, user.vectorizeId!);
  if (!vec) {
    console.log(`[match] no vector for user ${user.id}`);
    return;
  }

  const hits = await querySimilar(env.JOB_DESC_EMBEDDINGS, vec, 30);
  if (!hits.length) {
    console.log(`[match] no similar jobs for user ${user.id}`);
    return;
  }

  const jobs = (await getJobDetailsByIds(env.DB, hits.map((h) => h.id))).filter((j) => j.updateTime >= oneMonthAgo());
  if (!jobs.length) {
    console.log(`[match] no recent jobs for user ${user.id}`);
    return;
  }

  const existingIds = await getExistingMatchedJobIds(env.DB, user.id, jobs.map((j) => j.id));
  console.log(`[match] user ${user.id}: similar=${hits.length} recent=${jobs.length} already_matched=${existingIds.length}`);

  const newJobs = jobs.filter((j) => !existingIds.includes(j.id));
  if (!newJobs.length) {
    console.log(`[match] all ${jobs.length} jobs already matched for user ${user.id}, skipping`);
    return;
  }

  const input: UserMatchedJobPromptInput[] = newJobs.map((j) => ({
    jobId: j.id, jobTitle: j.title, jobLink: j.link, jobDescription: j.jobDesc, location: j.location, salary: j.salary,
  }));

  const parsed = await callAgent(
    env,
    user.resume ?? "",
    user.jobExpectations ?? "",
    input,
  );

  if (parsed.length) {
    await createMatchJobIfNotExist(env.DB, parsed.map((p) => ({ userId: user.id, jobId: p.jobId, notification: false, matchScore: p.matchScore, matchReason: p.reason })));
    console.log(`[match] stored ${parsed.length} matches for user ${user.id}`);
  }
}
