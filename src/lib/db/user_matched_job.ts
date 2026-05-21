import type { UserMatchedJob, UserMatchedDetailJob } from "../types.js";

export async function createMatchJobIfNotExist(db: D1Database, matches: UserMatchedJob[]): Promise<void> {
  for (const m of matches) {
    const existing = await db
      .prepare("SELECT job_id FROM user_matched_job WHERE user_id=? AND job_id=?")
      .bind(m.userId, m.jobId)
      .first<{ job_id: string }>();
    if (existing) continue;
    await db
      .prepare("INSERT INTO user_matched_job (user_id, job_id, update_time, notification, match_score, match_reason) VALUES (?,?,?,?,?,?)")
      .bind(m.userId, m.jobId, new Date().toISOString(), m.notification ? 1 : 0, m.matchScore, m.matchReason)
      .run();
  }
}

export async function getUserMatchedJobDetailList(db: D1Database, userId: string, offset: number, limit: number): Promise<UserMatchedDetailJob[]> {
  const rows = await db
    .prepare(`SELECT jd.*, umj.user_id, umj.match_score, umj.match_reason
       FROM user_matched_job umj INNER JOIN job_detail jd ON umj.job_id = jd.id
       WHERE umj.user_id=? ORDER BY umj.update_time DESC LIMIT ? OFFSET ?`)
    .bind(userId, limit, offset)
    .all<Record<string, unknown>>();
  return (rows.results ?? []).map(mapRow);
}

export async function getUserMatchedJobDetailListTotalCount(db: D1Database, userId: string): Promise<number> {
  const r = await db
    .prepare("SELECT COUNT(*) as count FROM user_matched_job umj INNER JOIN job_detail jd ON umj.job_id = jd.id WHERE umj.user_id=?")
    .bind(userId)
    .first<{ count: number }>();
  return r?.count ?? 0;
}

export async function getUserNonNotifiedJobList(db: D1Database, userId: string, offset: number, limit: number): Promise<UserMatchedDetailJob[]> {
  const rows = await db
    .prepare(`SELECT jd.*, umj.user_id, umj.match_score, umj.match_reason
       FROM user_matched_job umj INNER JOIN job_detail jd ON umj.job_id = jd.id
       WHERE umj.notification=0 AND umj.user_id=? ORDER BY umj.match_score DESC LIMIT ? OFFSET ?`)
    .bind(userId, limit, offset)
    .all<Record<string, unknown>>();
  return (rows.results ?? []).map(mapRow);
}

export async function getUserNonNotifiedJobTotalCount(db: D1Database, userId: string): Promise<number> {
  const r = await db
    .prepare("SELECT COUNT(*) as count FROM user_matched_job WHERE notification=0 AND user_id=?")
    .bind(userId)
    .first<{ count: number }>();
  return r?.count ?? 0;
}

export async function updateAllMatchJobNotified(db: D1Database, userId: string): Promise<void> {
  await db.prepare("UPDATE user_matched_job SET notification=1 WHERE user_id=? AND notification=0").bind(userId).run();
}

function mapRow(row: Record<string, unknown>): UserMatchedDetailJob {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: (row.title as string) ?? "",
    jobDesc: (row.job_desc as string) ?? "",
    jobTags: JSON.parse((row.job_tags as string) ?? "[]"),
    link: (row.link as string) ?? "",
    source: (row.source as string) ?? "",
    location: (row.location as string) ?? "",
    salary: (row.salary as string) ?? "",
    updateTime: (row.update_time as string) ?? "",
    matchScore: (row.match_score as string) ?? "",
    matchReason: (row.match_reason as string) ?? "",
  };
}
