import type { Env, CommonJob } from "../lib/types.js";
import {
  getRemoteOkJobs,
  getAllWwrJobs,
  getRemotiveJobs,
  getJobspressoJobs,
  getWorkingNomadsJobs,
  getNoDeskJobs,
} from "../lib/crawler/index.js";
import { commonJobFields, filterAgencyJobs } from "../lib/crawler/agency_blocklist.js";
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

/**
 * Fetch jobs from one source, drop talent-agency / freelance-marketplace
 * postings, then persist the direct-employer jobs.
 */
async function crawlSource(
  env: Env,
  source: string,
  label: string,
  fetcher: () => Promise<CommonJob[]>,
): Promise<void> {
  console.log(`[crawl] ${label}`);
  try {
    const jobs = await fetcher();
    const { jobs: direct, filtered } = filterAgencyJobs(jobs, commonJobFields);
    for (const { job, match } of filtered) {
      console.log(
        `[crawl] 🚫 skipped agency posting: ${job.title} [${match.platform.name}] (${match.reason})`,
      );
    }
    await createJobDetailIfNotExist(env.DB, direct.map((j) => toEntity(j, source)));
    console.log(
      `[crawl] stored ${direct.length} ${label}` +
        (filtered.length ? ` (${filtered.length} agency filtered)` : ""),
    );
  } catch (e) {
    console.error(`[crawl] ${label} error:`, e);
  }
}

export async function handleCrawl(env: Env): Promise<void> {
  await crawlSource(env, "remoteok", "RemoteOK", () => getRemoteOkJobs(1));
  await crawlSource(env, "weworkremotely", "WeWorkRemotely", () => getAllWwrJobs());
  await crawlSource(env, "remotive", "Remotive", () => getRemotiveJobs(100));
  await crawlSource(env, "jobspresso", "Jobspresso", () => getJobspressoJobs());
  await crawlSource(env, "workingnomads", "Working Nomads", () => getWorkingNomadsJobs(100));
  await crawlSource(env, "nodesk", "NoDesk", () => getNoDeskJobs());
}
