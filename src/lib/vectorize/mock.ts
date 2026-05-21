function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class MockVectorizeIndex {
  private store = new Map<string, number[]>();

  async upsert(vectors: { id: string; values: number[] }[]): Promise<void> {
    for (const v of vectors) {
      this.store.set(v.id, v.values);
    }
  }

  async getByIds(ids: string[]): Promise<{ id: string; values: number[] }[]> {
    return ids
      .map((id) => ({ id, values: this.store.get(id) }))
      .filter((x): x is { id: string; values: number[] } => x.values !== undefined);
  }

  async deleteByIds(ids: string[]): Promise<void> {
    for (const id of ids) this.store.delete(id);
  }

  async query(
    vector: number[],
    options?: { topK?: number; returnValues?: boolean; returnMetadata?: boolean }
  ): Promise<{ matches: { id: string; score: number; values?: number[] }[] }> {
    const topK = options?.topK ?? 10;
    const scores = [...this.store.entries()]
      .map(([id, vec]) => ({ id, score: cosineSimilarity(vector, vec), values: vec }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    const matches = options?.returnValues
      ? scores
      : scores.map(({ id, score }) => ({ id, score }));

    return { matches };
  }
}
