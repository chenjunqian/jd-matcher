import type { Env, UserMatchedJobPromptInput } from "../lib/types.js";
import { getUsersWithResume } from "../lib/db/user_info.js";
import { getJobDetailsByIds } from "../lib/db/job_detail.js";
import { createMatchJobIfNotExist } from "../lib/db/user_matched_job.js";
import { getVectorById, querySimilar } from "../lib/vectorize/index.js";
import { runMatchAgent } from "../lib/agent/index.js";

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

  const input: UserMatchedJobPromptInput[] = jobs.map((j) => ({
    jobId: j.id, jobTitle: j.title, jobLink: j.link, jobDescription: j.jobDesc, location: j.location, salary: j.salary,
  }));

  const parsed = await runMatchAgent({
    resume: user.resume ?? "",
    expectations: user.jobExpectations ?? "",
    jobs: input,
    apiKey: env.LLM_DEEPSEEK_APIKEY,
    baseURL: env.LLM_DEEPSEEK_BASEURL || "https://api.deepseek.com/v1",
    modelName: env.LLM_DEEPSEEK_MODEL || "deepseek-v4-flash",
    reasoningEffort: env.LLM_DEEPSEEK_REASONINGEFFORT || "high",
  });

  if (parsed.length) {
    await createMatchJobIfNotExist(env.DB, parsed.map((p) => ({ userId: user.id, jobId: p.jobId, notification: false, matchScore: p.matchScore, matchReason: p.reason })));
    console.log(`[match] stored ${parsed.length} matches for user ${user.id}`);
  }
}
