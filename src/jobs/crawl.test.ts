import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleCrawl } from "./crawl";
import type { Env, CommonJob } from "../lib/types";

const {
  mockGetRemoteOkJobs,
  mockGetAllWwrJobs,
  mockGetRemotiveJobs,
  mockGetJobspressoJobs,
  mockGetWorkingNomadsJobs,
  mockGetNoDeskJobs,
  mockCreateJobDetailIfNotExist,
} = vi.hoisted(() => ({
  mockGetRemoteOkJobs: vi.fn(),
  mockGetAllWwrJobs: vi.fn(),
  mockGetRemotiveJobs: vi.fn(),
  mockGetJobspressoJobs: vi.fn(),
  mockGetWorkingNomadsJobs: vi.fn(),
  mockGetNoDeskJobs: vi.fn(),
  mockCreateJobDetailIfNotExist: vi.fn(),
}));

vi.mock("../lib/crawler/index", () => ({
  getRemoteOkJobs: mockGetRemoteOkJobs,
  getAllWwrJobs: mockGetAllWwrJobs,
  getRemotiveJobs: mockGetRemotiveJobs,
  getJobspressoJobs: mockGetJobspressoJobs,
  getWorkingNomadsJobs: mockGetWorkingNomadsJobs,
  getNoDeskJobs: mockGetNoDeskJobs,
}));

vi.mock("../lib/db/job_detail", () => ({
  createJobDetailIfNotExist: mockCreateJobDetailIfNotExist,
}));

function makeJob(overrides: Partial<CommonJob> = {}): CommonJob {
  return {
    title: "Senior TypeScript Engineer",
    url: "https://example.com/jobs/1",
    description: "Direct employer posting.",
    tags: [],
    location: "Remote",
    salary: "",
    updateTime: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeEnv(): Env {
  return {
    TELEGRAM_BOT_TOKEN: "",
    DB: {} as D1Database,
    SESSION_KV: {} as KVNamespace,
    JOB_DESC_EMBEDDINGS: {} as VectorizeIndex,
    RESUME_EMBEDDINGS: {} as VectorizeIndex,
    JOBS_QUEUE: {} as Queue<{ type: string }>,
    MATCH_CONTAINER: {} as DurableObjectNamespace<import("@cloudflare/containers").Container>,
    LLM_OPENROUTER_BASEURL: "",
    LLM_OPENROUTER_APIKEY: "",
    LLM_OPENROUTER_MODEL: "",
    LLM_OPENROUTER_EMBEDDINGMODEL: "",
    LLM_DEEPSEEK_BASEURL: "",
    LLM_DEEPSEEK_APIKEY: "",
    LLM_DEEPSEEK_MODEL: "",
    LLM_DEEPSEEK_REASONINGEFFORT: "",
    EMAIL: { send: vi.fn() } as unknown as SendEmail,
    APP_URL: "http://localhost:8787",
    UNSUBSCRIBE_SECRET: "test-unsub-secret",
  };
}

/** All sources resolve to an empty list unless a test overrides them. */
function stubEmptySources() {
  mockGetRemoteOkJobs.mockResolvedValue([]);
  mockGetAllWwrJobs.mockResolvedValue([]);
  mockGetRemotiveJobs.mockResolvedValue([]);
  mockGetJobspressoJobs.mockResolvedValue([]);
  mockGetWorkingNomadsJobs.mockResolvedValue([]);
  mockGetNoDeskJobs.mockResolvedValue([]);
}

describe("handleCrawl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubEmptySources();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("drops talent-agency postings per source and keeps direct employers", async () => {
    const direct = makeJob();
    mockGetRemoteOkJobs.mockResolvedValue([
      direct,
      makeJob({ title: "Proxify: Senior Frontend Developer", url: "https://remoteok.com/jobs/1" }),
    ]);
    mockGetRemotiveJobs.mockResolvedValue([
      makeJob({ title: "Toptal: Backend Engineer", url: "https://remotive.com/jobs/2" }),
    ]);

    await handleCrawl(makeEnv());

    expect(mockCreateJobDetailIfNotExist).toHaveBeenCalledTimes(6);
    // call order matches crawlSource(): remoteok(0), weworkremotely(1), remotive(2)
    const [, remoteOkJobs] = mockCreateJobDetailIfNotExist.mock.calls[0];
    const [, remotiveJobs] = mockCreateJobDetailIfNotExist.mock.calls[2];
    expect(remoteOkJobs).toHaveLength(1);
    expect(remoteOkJobs[0].title).toBe("Senior TypeScript Engineer");
    expect(remoteOkJobs[0].source).toBe("remoteok");
    expect(remotiveJobs).toHaveLength(0);
  });

  it("still stores jobs when one source fails", async () => {
    mockGetRemoteOkJobs.mockRejectedValue(new Error("boom"));
    mockGetWorkingNomadsJobs.mockResolvedValue([makeJob()]);

    await handleCrawl(makeEnv());

    const stored = mockCreateJobDetailIfNotExist.mock.calls.flatMap(([, jobs]) => jobs);
    expect(stored).toHaveLength(1);
    expect(stored[0].source).toBe("workingnomads");
  });

  it("does not persist anything when every source fails", async () => {
    mockGetRemoteOkJobs.mockRejectedValue(new Error("boom"));
    mockGetAllWwrJobs.mockRejectedValue(new Error("boom"));
    mockGetRemotiveJobs.mockRejectedValue(new Error("boom"));
    mockGetJobspressoJobs.mockRejectedValue(new Error("boom"));
    mockGetWorkingNomadsJobs.mockRejectedValue(new Error("boom"));
    mockGetNoDeskJobs.mockRejectedValue(new Error("boom"));

    await handleCrawl(makeEnv());

    expect(mockCreateJobDetailIfNotExist).not.toHaveBeenCalled();
  });
});
