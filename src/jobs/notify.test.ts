import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendJobsInChunks } from "./notify";
import type { Env, UserMatchedDetailJob } from "../lib/types";

function makeJob(overrides: Partial<UserMatchedDetailJob> = {}): UserMatchedDetailJob {
  return {
    id: "job-1",
    userId: "user-1",
    title: "Software Engineer",
    jobDesc: "A long job description here.",
    jobTags: [],
    link: "https://example.com/job/1",
    source: "remoteok",
    location: "Remote",
    salary: "$100k-$150k",
    updateTime: "2026-01-01T00:00:00Z",
    matchScore: "95",
    matchReason: "Great match because of overlapping skills and experience.",
    ...overrides,
  };
}

function makeEnv(): Env {
  return {
    TELEGRAM_BOT_TOKEN: "test-bot-token",
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
  };
}

function mockFetchSuccess() {
  return { json: () => Promise.resolve({ ok: true } satisfies { ok: boolean }) };
}

function mockFetchTooLong() {
  return {
    json: () =>
      Promise.resolve({
        ok: false,
        description: "Bad Request: message is too long",
      } satisfies { ok: boolean; description: string }),
  };
}

function mockFetchError(description = "Forbidden") {
  return {
    json: () =>
      Promise.resolve({
        ok: false,
        description,
      } satisfies { ok: boolean; description: string }),
  };
}

describe("sendJobsInChunks", () => {
  let fetchFn: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends all jobs in a single message when it fits", async () => {
    const jobs = Array.from({ length: 10 }, (_, i) =>
      makeJob({ id: `job-${i}`, title: `Job ${i}` })
    );
    fetchFn.mockResolvedValue(mockFetchSuccess());

    await sendJobsInChunks(makeEnv(), "chat-123", jobs, "user-1");

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.text).toContain("Job 0");
    expect(body.text).toContain("Job 9");
    expect(body.text).toContain("You can use /jobs");
  });

  it("splits in half and retries when message is too long", async () => {
    const jobs = Array.from({ length: 10 }, (_, i) =>
      makeJob({ id: `job-${i}`, title: `Job ${i}` })
    );
    fetchFn
      .mockResolvedValueOnce(mockFetchTooLong()) // 10 → split to 5
      .mockResolvedValueOnce(mockFetchSuccess()) // first 5 OK
      .mockResolvedValueOnce(mockFetchSuccess()); // next 5 OK

    await sendJobsInChunks(makeEnv(), "chat-123", jobs, "user-1");

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[notify] splitting message for user user-1: 10 → 5 jobs")
    );
  });

  it("splits twice then remaining fit in one chunk", async () => {
    const jobs = Array.from({ length: 8 }, (_, i) =>
      makeJob({ id: `job-${i}`, title: `Job ${i}` })
    );
    fetchFn
      .mockResolvedValueOnce(mockFetchTooLong()) // 8 → 4
      .mockResolvedValueOnce(mockFetchTooLong()) // 4 → 2
      .mockResolvedValueOnce(mockFetchSuccess()) // first 2 OK, remaining 6 reset batchSize → 6
      .mockResolvedValueOnce(mockFetchSuccess()); // remaining 6 OK

    await sendJobsInChunks(makeEnv(), "chat-123", jobs, "user-1");

    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[notify] splitting message for user user-1: 8 → 4 jobs")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[notify] splitting message for user user-1: 4 → 2 jobs")
    );
  });

  it("skips a single job that is still too long and continues with remaining", async () => {
    const jobs = [
      makeJob({ id: "too-long-job", title: "A" }),
      makeJob({ id: "job-b", title: "B" }),
      makeJob({ id: "job-c", title: "C" }),
    ];
    fetchFn
      .mockResolvedValueOnce(mockFetchTooLong()) // 3 → 2
      .mockResolvedValueOnce(mockFetchTooLong()) // 2 → 1
      .mockResolvedValueOnce(mockFetchTooLong()) // 1 → skip
      .mockResolvedValueOnce(mockFetchSuccess()); // remaining 2 OK

    await sendJobsInChunks(makeEnv(), "chat-123", jobs, "user-1");

    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[notify] skipping too-long job too-long-job for user user-1")
    );

    const successCallBody = JSON.parse(fetchFn.mock.calls[3][1].body);
    expect(successCallBody.text).toContain("B");
    expect(successCallBody.text).toContain("C");
    expect(successCallBody.text).not.toContain("A");
  });

  it("skips all jobs when every single one is too long", async () => {
    const jobs = [
      makeJob({ id: "a" }),
      makeJob({ id: "b" }),
      makeJob({ id: "c" }),
    ];
    fetchFn
      .mockResolvedValueOnce(mockFetchTooLong()) // 3 → 2
      .mockResolvedValueOnce(mockFetchTooLong()) // 2 → 1
      .mockResolvedValueOnce(mockFetchTooLong()) // [a] skip
      .mockResolvedValueOnce(mockFetchTooLong()) // 2 → 1
      .mockResolvedValueOnce(mockFetchTooLong()) // [b] skip
      .mockResolvedValueOnce(mockFetchTooLong()); // [c] skip

    await sendJobsInChunks(makeEnv(), "chat-123", jobs, "user-1");

    expect(fetchFn).toHaveBeenCalledTimes(6);
    expect(logSpy).toHaveBeenCalledTimes(6);
    expect(logSpy.mock.calls.filter((c: unknown[]) => String(c[0]).includes("splitting")).length).toBe(3);
    expect(logSpy.mock.calls.filter((c: unknown[]) => String(c[0]).includes("skipping")).length).toBe(3);
  });

  it("throws on non-length telegram errors", async () => {
    const jobs = [makeJob({ id: "job-0" })];
    fetchFn.mockResolvedValue(mockFetchError("Forbidden"));

    await expect(
      sendJobsInChunks(makeEnv(), "chat-123", jobs, "user-1")
    ).rejects.toThrow("[notify] telegram error for user user-1");
  });

  it("throws on non-length error mid-split", async () => {
    const jobs = [
      makeJob({ id: "job-a", title: "A" }),
      makeJob({ id: "job-b", title: "B" }),
      makeJob({ id: "job-c", title: "C" }),
    ];
    fetchFn
      .mockResolvedValueOnce(mockFetchTooLong()) // 3 → 2
      .mockResolvedValueOnce(mockFetchError("Forbidden")); // throws on 2

    await expect(
      sendJobsInChunks(makeEnv(), "chat-123", jobs, "user-1")
    ).rejects.toThrow("[notify] telegram error for user user-1");
  });
});
