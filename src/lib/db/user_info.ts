import type { UserInfo } from "../types.js";

export async function createUserInfoIfNotExist(db: D1Database, user: UserInfo): Promise<void> {
  const existing = await db
    .prepare("SELECT id FROM user_info WHERE telegram_id = ?")
    .bind(user.telegramId)
    .first<{ id: string }>();
  if (existing) {
    await db
      .prepare("UPDATE user_info SET name=?, email=?, resume=?, job_expectations=? WHERE telegram_id=?")
      .bind(user.name ?? null, user.email ?? null, user.resume ?? null, user.jobExpectations ?? null, user.telegramId)
      .run();
    return;
  }
  await db
    .prepare("INSERT INTO user_info (id, name, email, telegram_id, resume, job_expectations) VALUES (?,?,?,?,?,?)")
    .bind(user.id, user.name ?? null, user.email ?? null, user.telegramId, user.resume ?? null, user.jobExpectations ?? null)
    .run();
}

export async function getUserInfoByTelegramId(db: D1Database, telegramId: string): Promise<UserInfo | null> {
  const row = await db.prepare("SELECT * FROM user_info WHERE telegram_id = ?").bind(telegramId).first<Record<string, unknown>>();
  return row ? mapRow(row) : null;
}

export async function isUserHasUploadResume(db: D1Database, telegramId: string): Promise<boolean> {
  const user = await getUserInfoByTelegramId(db, telegramId);
  return user !== null && (user.resume ?? "") !== "";
}

export async function updateUserResume(db: D1Database, telegramId: string, resume: string, vectorizeId?: string): Promise<void> {
  if (vectorizeId) {
    await db.prepare("UPDATE user_info SET resume=?, vectorize_id=? WHERE telegram_id=?").bind(resume, vectorizeId, telegramId).run();
  } else {
    await db.prepare("UPDATE user_info SET resume=? WHERE telegram_id=?").bind(resume, telegramId).run();
  }
}

export async function updateUserJobExpectations(db: D1Database, telegramId: string, expectations: string): Promise<void> {
  await db.prepare("UPDATE user_info SET job_expectations=? WHERE telegram_id=?").bind(expectations, telegramId).run();
}

export async function getAllUserInfoCount(db: D1Database): Promise<number> {
  const r = await db.prepare("SELECT COUNT(*) as count FROM user_info").first<{ count: number }>();
  return r?.count ?? 0;
}

export async function getUserInfoList(db: D1Database, offset: number, limit: number): Promise<UserInfo[]> {
  const rows = await db.prepare("SELECT * FROM user_info LIMIT ? OFFSET ?").bind(limit, offset).all<Record<string, unknown>>();
  return (rows.results ?? []).map(mapRow);
}

export async function getUsersWithResume(db: D1Database, offset: number, limit: number): Promise<UserInfo[]> {
  const rows = await db
    .prepare("SELECT * FROM user_info WHERE resume IS NOT NULL AND resume != '' AND vectorize_id IS NOT NULL LIMIT ? OFFSET ?")
    .bind(limit, offset)
    .all<Record<string, unknown>>();
  return (rows.results ?? []).map(mapRow);
}

export async function getUsersWithResumeCount(db: D1Database): Promise<number> {
  const r = await db
    .prepare("SELECT COUNT(*) as count FROM user_info WHERE resume IS NOT NULL AND resume != '' AND vectorize_id IS NOT NULL")
    .first<{ count: number }>();
  return r?.count ?? 0;
}

function mapRow(row: Record<string, unknown>): UserInfo {
  return {
    id: row.id as string,
    name: (row.name as string) ?? undefined,
    email: (row.email as string) ?? undefined,
    telegramId: (row.telegram_id as string) ?? undefined,
    resume: (row.resume as string) ?? undefined,
    jobExpectations: (row.job_expectations as string) ?? undefined,
    vectorizeId: (row.vectorize_id as string) ?? undefined,
  };
}
