import type { Env } from "./types.js";

export function getConfig(env: Env) {
  return {
    openrouter: {
      baseUrl: env.LLM_OPENROUTER_BASEURL || "https://openrouter.ai/api/v1",
      apiKey: env.LLM_OPENROUTER_APIKEY,
      model: env.LLM_OPENROUTER_MODEL || "deepseek/deepseek-v3.2",
      embeddingModel: env.LLM_OPENROUTER_EMBEDDINGMODEL || "qwen/qwen3-embedding-8b",
    },
    deepseek: {
      baseUrl: env.LLM_DEEPSEEK_BASEURL || "https://api.deepseek.com/v1",
      apiKey: env.LLM_DEEPSEEK_APIKEY,
      model: env.LLM_DEEPSEEK_MODEL || "deepseek-v4-flash",
      reasoningEffort: env.LLM_DEEPSEEK_REASONINGEFFORT || "high",
    },
    telegram: {
      botToken: env.TELEGRAM_BOT_TOKEN,
    },
  };
}
