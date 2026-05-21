import type { JobDetail } from "../types.js";
import { MockVectorizeIndex } from "./mock.js";

// ── Single shared mock instance for local dev ──

let mockIndex: MockVectorizeIndex | null = null;

function getMock(): MockVectorizeIndex {
  if (!mockIndex) mockIndex = new MockVectorizeIndex();
  return mockIndex;
}

// ── Helpers ──

function toNumberArray(values: VectorFloatArray | number[]): number[] {
  if (values instanceof Float32Array || values instanceof Float64Array) return Array.from(values);
  return values;
}

// ── Wrapped exports with local-dev fallback ──

export async function upsertVectors(index: any, vectors: { id: string; values: number[] }[]): Promise<void> {
  try {
    await index.upsert(vectors);
  } catch {
    await getMock().upsert(vectors);
  }
}

export async function getVectorById(index: any, id: string): Promise<number[] | null> {
  try {
    const r = await index.getByIds([id]);
    if (!r.length) return null;
    return toNumberArray(r[0].values);
  } catch {
    const r = await getMock().getByIds([id]);
    if (!r.length) return null;
    return r[0].values;
  }
}

export async function querySimilar(index: any, vector: number[], topK = 30): Promise<{ id: string; score: number }[]> {
  try {
    const r = await index.query(vector, { topK, returnValues: false, returnMetadata: false });
    return (r.matches ?? []).map((m: any) => ({ id: m.id, score: m.score }));
  } catch {
    const r = await getMock().query(vector, { topK, returnValues: false, returnMetadata: false });
    return r.matches.map((m) => ({ id: m.id, score: m.score }));
  }
}

export async function querySimilarExcludingMatched(
  jobIndex: any, db: D1Database, vector: number[], userId: string, beforeDate: string, topK = 30
): Promise<JobDetail[]> {
  const matches = await querySimilar(jobIndex, vector, topK);
  if (!matches.length) return [];
  const ids = matches.map((m) => m.id);
  const rows = await db
    .prepare(
      `SELECT jd.* FROM job_detail jd
       LEFT JOIN user_matched_job umj ON jd.id = umj.job_id AND umj.user_id = ?
       WHERE jd.id IN (${ids.map(() => "?").join(",")}) AND jd.update_time > ? AND umj.job_id IS NULL`
    )
    .bind(userId, ...ids, beforeDate)
    .all<Record<string, unknown>>();
  return (rows.results ?? []).map((row) => ({
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
  }));
}
