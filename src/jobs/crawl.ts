import type { Env, CommonJob } from "../lib/types.js";
import {
  getRemoteOkJobs,
  getAllWwrJobs,
  getRemotiveJobs,
  getJobspressoJobs,
  getWorkingNomadsJobs,
  getNoDeskJobs,
} from "../lib/crawler/index.js";
import { createJobDetailIfNotExist } from "../lib/db/job_detail.js";

function genId(): string {
  return crypto.randomUUID();
}

function parseDate(s: string): string {
  if (!s) return new Date().toISOString().split("T")[0];
  try {
    const d = new Date(s);
    return isNaN(d.getTime())
      ? new Date().toISOString().split("T")[0]
      : d.toISOString().split("T")[0];
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

function toEntity(job: CommonJob, source: string) {
  return {
    id: genId(),
    title: job.title,
    jobDesc: job.description,
    jobTags: job.tags,
    link: job.url,
    source,
    location: job.location,
    salary: job.salary,
    updateTime: parseDate(job.updateTime),
  };
}

export async function handleCrawl(env: Env): Promise<void> {
  console.log("[crawl] RemoteOK");
  try {
    const jobs = await getRemoteOkJobs(1);
    await createJobDetailIfNotExist(env.DB, jobs.map((j) => toEntity(j, "remoteok")));
    console.log(`[crawl] stored ${jobs.length} RemoteOK`);
  } catch (e) {
    console.error("[crawl] RemoteOK error:", e);
  }

  console.log("[crawl] WeWorkRemotely");
  try {
    const jobs = await getAllWwrJobs();
    await createJobDetailIfNotExist(env.DB, jobs.map((j) => toEntity(j, "weworkremotely")));
    console.log(`[crawl] stored ${jobs.length} WeWorkRemotely`);
  } catch (e) {
    console.error("[crawl] WeWorkRemotely error:", e);
  }

  console.log("[crawl] Remotive");
  try {
    const jobs = await getRemotiveJobs(100);
    await createJobDetailIfNotExist(env.DB, jobs.map((j) => toEntity(j, "remotive")));
    console.log(`[crawl] stored ${jobs.length} Remotive`);
  } catch (e) {
    console.error("[crawl] Remotive error:", e);
  }

  console.log("[crawl] Jobspresso");
  try {
    const jobs = await getJobspressoJobs();
    await createJobDetailIfNotExist(env.DB, jobs.map((j) => toEntity(j, "jobspresso")));
    console.log(`[crawl] stored ${jobs.length} Jobspresso`);
  } catch (e) {
    console.error("[crawl] Jobspresso error:", e);
  }

  console.log("[crawl] Working Nomads");
  try {
    const jobs = await getWorkingNomadsJobs(100);
    await createJobDetailIfNotExist(env.DB, jobs.map((j) => toEntity(j, "workingnomads")));
    console.log(`[crawl] stored ${jobs.length} Working Nomads`);
  } catch (e) {
    console.error("[crawl] Working Nomads error:", e);
  }

  console.log("[crawl] NoDesk");
  try {
    const jobs = await getNoDeskJobs();
    await createJobDetailIfNotExist(env.DB, jobs.map((j) => toEntity(j, "nodesk")));
    console.log(`[crawl] stored ${jobs.length} NoDesk`);
  } catch (e) {
    console.error("[crawl] NoDesk error:", e);
  }
}
