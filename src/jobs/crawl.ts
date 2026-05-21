import type { Env, CommonJob } from "../lib/types.js";
import { getRemoteOkJobs, getAllFullStackJobs } from "../lib/crawler/index.js";
import { createJobDetailIfNotExist } from "../lib/db/job_detail.js";

function genId(): string { return crypto.randomUUID(); }

function parseDate(s: string): string {
  if (!s) return new Date().toISOString().split("T")[0];
  try { const d = new Date(s); return isNaN(d.getTime()) ? new Date().toISOString().split("T")[0] : d.toISOString().split("T")[0]; }
  catch { return new Date().toISOString().split("T")[0]; }
}

function toEntity(job: CommonJob, source: string) {
  return { id: genId(), title: job.title, jobDesc: job.description, jobTags: job.tags, link: job.url, source, location: job.location, salary: job.salary, updateTime: parseDate(job.updateTime) };
}

export async function handleCrawl(env: Env): Promise<void> {
  console.log("[crawl] RemoteOK");
  try {
    const jobs = await getRemoteOkJobs(1);
    await createJobDetailIfNotExist(env.DB, jobs.map((j) => toEntity(j, "remoteok")));
    console.log(`[crawl] stored ${jobs.length} RemoteOK`);
  } catch (e) { console.error("[crawl] RemoteOK error:", e); }

  console.log("[crawl] WeWorkRemotely");
  try {
    const jobs = await getAllFullStackJobs();
    await createJobDetailIfNotExist(env.DB, jobs.map((j) => toEntity(j, "weworkremotely")));
    console.log(`[crawl] stored ${jobs.length} WeWorkRemotely`);
  } catch (e) { console.error("[crawl] WeWorkRemotely error:", e); }
}
