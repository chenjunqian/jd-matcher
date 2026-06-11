export interface EmailVerification {
  id: string;
  userId: string;
  email: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  verified: boolean;
}

export async function createEmailVerification(
  db: D1Database,
  id: string,
  userId: string,
  email: string,
  token: string,
  expiresAt: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO email_verification (id, user_id, email, token, created_at, expires_at) VALUES (?,?,?,?,?,?)",
    )
    .bind(id, userId, email, token, now, expiresAt)
    .run();
}

export async function getEmailVerificationByToken(
  db: D1Database,
  token: string,
): Promise<EmailVerification | null> {
  const row = await db
    .prepare("SELECT * FROM email_verification WHERE token = ?")
    .bind(token)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return {
    id: row.id as string,
    userId: row.user_id as string,
    email: row.email as string,
    token: row.token as string,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    verified: (row.verified as number) === 1,
  };
}

export async function markEmailVerified(db: D1Database, token: string): Promise<void> {
  await db
    .prepare("UPDATE email_verification SET verified = 1 WHERE token = ?")
    .bind(token)
    .run();
}

export async function deleteEmailVerification(db: D1Database, token: string): Promise<void> {
  await db.prepare("DELETE FROM email_verification WHERE token = ?").bind(token).run();
}
