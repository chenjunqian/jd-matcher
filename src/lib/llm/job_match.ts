import type { PromptOutput, UserMatchedJobPromptOutput } from "../types.js";

export async function deepseekChat(
  apiKey: string,
  baseUrl: string,
  model: string,
  reasoningEffort: string,
  prompt: string
): Promise<string> {
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      reasoning_effort: reasoningEffort,
    }),
  });

  if (!resp.ok) throw new Error(`DeepSeek error ${resp.status}: ${await resp.text()}`);

  const json = (await resp.json()) as { choices: { message: { content: string } }[] };
  return json.choices[0]?.message?.content ?? "";
}

export function parseMatchResult(completion: string): UserMatchedJobPromptOutput[] {
  try {
    const parsed = JSON.parse(completion) as PromptOutput;
    if (parsed.matched_jobs) return parsed.matched_jobs;
    const arr = JSON.parse(completion) as UserMatchedJobPromptOutput[];
    if (Array.isArray(arr)) return arr;
  } catch { /* ignore */ }
  return [];
}
