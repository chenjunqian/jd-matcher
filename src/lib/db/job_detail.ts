import type { JobDetail } from "../types.js";

export async function createJobDetailIfNotExist(
  db: D1Database,
  jobs: JobDetail[]
): Promise<void> {
  for (const job of jobs) {
    const existing = await db
      .prepare("SELECT id FROM job_detail WHERE link = ?")
      .bind(job.link)
      .first<{ id: string }>();
    if (existing) continue;

    await db
      .prepare(
        `INSERT INTO job_detail (id, title, job_desc, job_tags, link, source, location, salary, update_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        job.id,
        job.title,
        job.jobDesc,
        JSON.stringify(job.jobTags ?? []),
        job.link,
        job.source,
        job.location,
        job.salary,
        job.updateTime,
      )
      .run();
  }
}

export async function getJobDetailById(db: D1Database, id: string): Promise<JobDetail | null> {
  const row = await db.prepare("SELECT * FROM job_detail WHERE id = ?").bind(id).first<Record<string, unknown>>();
  return row ? mapRow(row) : null;
}

export async function getTotalJobCount(db: D1Database): Promise<number> {
  const r = await db.prepare("SELECT COUNT(*) as count FROM job_detail").first<{ count: number }>();
  return r?.count ?? 0;
}

export async function getLatestJobList(db: D1Database, offset: number, limit: number): Promise<JobDetail[]> {
  const rows = await db
    .prepare("SELECT * FROM job_detail ORDER BY update_time DESC LIMIT ? OFFSET ?")
    .bind(limit, offset)
    .all<Record<string, unknown>>();
  return (rows.results ?? []).map(mapRow);
}

export async function getUnembeddedJobCount(db: D1Database): Promise<number> {
  const r = await db
    .prepare("SELECT COUNT(*) as count FROM job_detail WHERE vectorize_id IS NULL")
    .first<{ count: number }>();
  return r?.count ?? 0;
}

export async function getUnembeddedJobList(db: D1Database, offset: number, limit: number): Promise<JobDetail[]> {
  const rows = await db
    .prepare("SELECT * FROM job_detail WHERE vectorize_id IS NULL ORDER BY update_time DESC LIMIT ? OFFSET ?")
    .bind(limit, offset)
    .all<Record<string, unknown>>();
  return (rows.results ?? []).map(mapRow);
}

export async function updateJobDetailVectorizeId(db: D1Database, id: string, vectorizeId: string): Promise<void> {
  await db.prepare("UPDATE job_detail SET vectorize_id = ? WHERE id = ?").bind(vectorizeId, id).run();
}

export async function getJobDetailsByIds(db: D1Database, ids: string[]): Promise<JobDetail[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = await db
    .prepare(`SELECT * FROM job_detail WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<Record<string, unknown>>();
  return (rows.results ?? []).map(mapRow);
}

function mapRow(row: Record<string, unknown>): JobDetail {
  return {
    id: row.id as string,
    title: (row.title as string) ?? "",
    jobDesc: (row.job_desc as string) ?? "",
    jobTags: JSON.parse((row.job_tags as string) ?? "[]"),
    link: (row.link as string) ?? "",
    source: (row.source as string) ?? "",
    location: (row.location as string) ?? "",
    salary: (row.salary as string) ?? "",
    updateTime: (row.update_time as string) ?? "",
    vectorizeId: (row.vectorize_id as string) ?? undefined,
  };
}
