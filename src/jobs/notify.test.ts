import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendJobsInChunks, handleNotify } from "./notify";
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
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
        }),
      }),
    } as unknown as D1Database,
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

describe("sendJobsInChunks — blocked bot", () => {
  let fetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function makeRecordingEnv(updates: { sql: string; args: unknown[] }[]) {
    const env = makeEnv();
    (env.DB as unknown as { prepare: unknown }).prepare = vi.fn((sql: string) => ({
      bind: (...args: unknown[]) => ({
        run: async () => {
          updates.push({ sql, args });
          return {};
        },
      }),
    }));
    return env;
  }

  function expectTelegramOptOut(updates: { sql: string; args: unknown[] }[]) {
    const optOut = updates.find((u) => u.sql.includes("telegram_opt_out = ?"));
    expect(optOut).toBeDefined();
    expect(optOut!.args[0]).toBe(1);
    // the job must NOT be marked as notified through the normal path
    expect(updates.some((u) => u.sql.includes("user_matched_job"))).toBe(false);
  }

  it("marks telegram opt-out instead of throwing when the bot was blocked", async () => {
    const updates: { sql: string; args: unknown[] }[] = [];
    const env = makeRecordingEnv(updates);
    fetchFn.mockResolvedValue(mockFetchError("Forbidden: bot was blocked by the user"));

    await expect(sendJobsInChunks(env, "chat-123", [makeJob()], "user-1")).resolves.toBeUndefined();

    expectTelegramOptOut(updates);
  });

  it("treats a deactivated account as opt-out", async () => {
    const updates: { sql: string; args: unknown[] }[] = [];
    const env = makeRecordingEnv(updates);
    fetchFn.mockResolvedValue(mockFetchError("Forbidden: user is deactivated"));

    await expect(sendJobsInChunks(env, "chat-123", [makeJob()], "user-1")).resolves.toBeUndefined();
    expectTelegramOptOut(updates);
  });
});

// ─── handleNotify: per-channel opt-out gating ─────────────────────────────────

type NotifyDbOptions = {
  user: Record<string, unknown>;
  jobs: Record<string, unknown>[];
};

function makeNotifyDb(opts: NotifyDbOptions) {
  const written: { sql: string; args: unknown[] }[] = [];

  // D1 statements expose bind()/first()/all()/run() on the statement itself; the
  // COUNT queries call prepare(...).first() without bind().
  function stmt(sql: string, args: unknown[] = []) {
    return {
      bind: (...bound: unknown[]) => stmt(sql, bound),
      first: async () => {
        if (/COUNT\(\*\) as count FROM user_info/.test(sql)) return { count: 1 };
        if (/COUNT\(\*\) as count FROM user_matched_job WHERE notification=0/.test(sql))
          return { count: opts.jobs.length };
        return null;
      },
      all: async () => {
        if (/FROM user_info LIMIT/.test(sql)) return { results: [opts.user] };
        if (/FROM user_matched_job umj INNER JOIN/.test(sql)) return { results: opts.jobs };
        return { results: [] };
      },
      run: async () => {
        written.push({ sql, args });
        return {};
      },
    };
  }

  const db = { prepare: (sql: string) => stmt(sql) };
  return { db: db as unknown as D1Database, written };
}

function notifyJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    user_id: "user-1",
    title: "Software Engineer",
    job_desc: "desc",
    job_tags: "[]",
    link: "https://example.com/job/1",
    source: "remoteok",
    location: "Remote",
    salary: "$100k",
    update_time: "2026-01-01T00:00:00Z",
    match_score: "95",
    match_reason: "Good fit",
    ...overrides,
  };
}

function makeNotifyEnv(db: D1Database): Env {
  const kv = new Map<string, string>();
  return {
    ...makeEnv(),
    DB: db,
    SESSION_KV: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string) => void kv.set(k, v),
      delete: async (k: string) => void kv.delete(k),
    } as unknown as KVNamespace,
  };
}

describe("handleNotify — opt-out gating", () => {
  let fetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchFn = vi.fn().mockResolvedValue(mockFetchSuccess());
    vi.stubGlobal("fetch", fetchFn);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("skips email and retires the rows when email is opted out", async () => {
    const { db, written } = makeNotifyDb({
      user: {
        id: "user-1",
        email: "u@example.com",
        telegram_id: null,
        email_opt_out: 1,
        telegram_opt_out: 0,
      },
      jobs: [notifyJobRow()],
    });
    const env = makeNotifyEnv(db);

    await handleNotify(env);

    expect(env.EMAIL.send).not.toHaveBeenCalled();
    expect(written.some((w) => w.sql.includes("SET notification=1"))).toBe(true);
  });

  it("skips telegram when telegram is opted out but still emails", async () => {
    const { db } = makeNotifyDb({
      user: {
        id: "user-1",
        email: "u@example.com",
        telegram_id: "chat-123",
        email_opt_out: 0,
        telegram_opt_out: 1,
      },
      jobs: [notifyJobRow()],
    });
    const env = makeNotifyEnv(db);
    const send = env.EMAIL.send as unknown as ReturnType<typeof vi.fn>;

    await handleNotify(env);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][0];
    expect(payload.headers["List-Unsubscribe"]).toMatch(/^<https?:\/\/.+\/unsubscribe\?token=.+>$/);
    expect(payload.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(payload.html).toContain("Unsubscribe from these emails");
  });

  it("sends nothing and retires rows when both channels are opted out", async () => {
    const { db, written } = makeNotifyDb({
      user: {
        id: "user-1",
        email: "u@example.com",
        telegram_id: "chat-123",
        email_opt_out: 1,
        telegram_opt_out: 1,
      },
      jobs: [notifyJobRow()],
    });
    const env = makeNotifyEnv(db);

    await handleNotify(env);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(env.EMAIL.send).not.toHaveBeenCalled();
    expect(written.some((w) => w.sql.includes("SET notification=1"))).toBe(true);
  });

  it("notifies both channels when nothing is opted out", async () => {
    const { db } = makeNotifyDb({
      user: {
        id: "user-1",
        email: "u@example.com",
        telegram_id: "chat-123",
        email_opt_out: 0,
        telegram_opt_out: 0,
      },
      jobs: [notifyJobRow()],
    });
    const env = makeNotifyEnv(db);

    await handleNotify(env);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(env.EMAIL.send).toHaveBeenCalledTimes(1);
  });
});
