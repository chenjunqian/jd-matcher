export interface CommonJob {
  title: string;
  url: string;
  description: string;
  tags: string[];
  location: string;
  salary: string;
  updateTime: string;
}

export interface JobDetail {
  id: string;
  title: string;
  jobDesc: string;
  jobTags: string[];
  link: string;
  source: string;
  location: string;
  salary: string;
  updateTime: string;
  vectorizeId?: string;
}

export interface UserInfo {
  id: string;
  name?: string;
  email?: string;
  telegramId?: string;
  resume?: string;
  jobExpectations?: string;
  vectorizeId?: string;
}

export interface UserMatchedJob {
  userId: string;
  jobId: string;
  updateTime?: string;
  notification: boolean;
  matchScore?: string;
  matchReason?: string;
}

export interface UserMatchedJobPromptInput {
  jobId: string;
  jobTitle: string;
  jobLink: string;
  jobDescription: string;
  location: string;
  salary: string;
}

export interface UserMatchedJobPromptOutput {
  jobId: string;
  jobTitle: string;
  jobLink: string;
  matchScore: string;
  reason: string;
}

export interface PromptOutput {
  matched_jobs: UserMatchedJobPromptOutput[];
}

export interface UserMatchedDetailJob extends JobDetail {
  userId: string;
  matchScore: string;
  matchReason: string;
}

export interface Env {
  DB: D1Database;
  SESSION_KV: KVNamespace;
  JOB_DESC_EMBEDDINGS: VectorizeIndex;
  RESUME_EMBEDDINGS: VectorizeIndex;
  JOBS_QUEUE: Queue<JobMessage>;
  TELEGRAM_BOT_TOKEN: string;
  LLM_OPENROUTER_BASEURL: string;
  LLM_OPENROUTER_APIKEY: string;
  LLM_OPENROUTER_MODEL: string;
  LLM_OPENROUTER_EMBEDDINGMODEL: string;
  LLM_DEEPSEEK_BASEURL: string;
  LLM_DEEPSEEK_APIKEY: string;
  LLM_DEEPSEEK_MODEL: string;
  LLM_DEEPSEEK_REASONINGEFFORT: string;
}

export type JobType = "crawl" | "embed" | "match" | "notify";

export interface JobMessage {
  type: JobType;
  limit?: number;
  offset?: number;
}
