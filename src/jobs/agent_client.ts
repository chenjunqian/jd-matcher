import type { Env, UserMatchedJobPromptInput, UserMatchedJobPromptOutput } from "../lib/types.js";
import { getContainer } from "@cloudflare/containers";

export async function callAgent(
  env: Env,
  resume: string,
  expectations: string,
  jobs: UserMatchedJobPromptInput[],
): Promise<UserMatchedJobPromptOutput[]> {
  const container = getContainer(env.MATCH_CONTAINER, "agent");
  await container.startAndWaitForPorts({
    startOptions: {
      envVars: {
        LLM_DEEPSEEK_APIKEY: env.LLM_DEEPSEEK_APIKEY,
        LLM_DEEPSEEK_BASEURL: env.LLM_DEEPSEEK_BASEURL || "https://api.deepseek.com/v1",
        LLM_DEEPSEEK_MODEL: env.LLM_DEEPSEEK_MODEL || "deepseek-v4-flash",
        LLM_DEEPSEEK_REASONINGEFFORT: env.LLM_DEEPSEEK_REASONINGEFFORT || "high",
      },
    },
  });
  const resp = await container.fetch("http://container/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, expectations, jobs }),
  });
  if (!resp.ok) throw new Error(`Container agent error: ${resp.status} ${await resp.text()}`);
  return resp.json();
}
