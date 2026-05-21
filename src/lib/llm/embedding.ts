import type { Env } from "../types.js";

export async function embedText(env: Env, contents: string[]): Promise<number[][]> {
  const baseUrl = env.LLM_OPENROUTER_BASEURL || "https://openrouter.ai/api/v1";
  const model = env.LLM_OPENROUTER_EMBEDDINGMODEL || "qwen/qwen3-embedding-8b";

  const resp = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.LLM_OPENROUTER_APIKEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: contents }),
  });

  if (!resp.ok) throw new Error(`embedding error ${resp.status}: ${await resp.text()}`);

  const json = (await resp.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}
