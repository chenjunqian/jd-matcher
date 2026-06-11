import { describe, it, expect, vi, beforeEach } from "vitest";
import { callAgent } from "./agent_client.js";
import type { Env, UserMatchedJobPromptInput } from "../lib/types.js";

const mockFetch = vi.fn();
const mockStartAndWaitForPorts = vi.fn();

const { mockGetContainer } = vi.hoisted(() => ({
  mockGetContainer: vi.fn(),
}));

vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: mockGetContainer,
}));

function makeEnv(overrides: Partial<Env> = {}): Env {
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
    EMAIL: { send: vi.fn() } as unknown as SendEmail,
    APP_URL: "http://localhost:8787",
    LLM_DEEPSEEK_APIKEY: "test-api-key",
    LLM_DEEPSEEK_MODEL: "test-model",
    LLM_DEEPSEEK_REASONINGEFFORT: "test-effort",
    ...overrides,
  };
}

describe("callAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartAndWaitForPorts.mockResolvedValue(undefined);
    mockFetch.mockReset();
    mockGetContainer.mockReturnValue({
      startAndWaitForPorts: mockStartAndWaitForPorts,
      fetch: mockFetch,
    });
  });

  it("starts container with correct env vars", async () => {
    const env = makeEnv({
      LLM_DEEPSEEK_APIKEY: "sk-test",
      LLM_DEEPSEEK_BASEURL: "https://custom.deepseek.com/v1",
      LLM_DEEPSEEK_MODEL: "custom-model",
      LLM_DEEPSEEK_REASONINGEFFORT: "low",
    });

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );

    await callAgent(env, "resume", "expectations", []);

    expect(mockGetContainer).toHaveBeenCalledWith(env.MATCH_CONTAINER, "agent");
    expect(mockStartAndWaitForPorts).toHaveBeenCalledWith({
      startOptions: {
        envVars: {
          LLM_DEEPSEEK_APIKEY: "sk-test",
          LLM_DEEPSEEK_BASEURL: "https://custom.deepseek.com/v1",
          LLM_DEEPSEEK_MODEL: "custom-model",
          LLM_DEEPSEEK_REASONINGEFFORT: "low",
        },
      },
    });
  });

  it("uses defaults for optional env vars", async () => {
    const env = makeEnv({
      LLM_DEEPSEEK_APIKEY: "sk-test",
      LLM_DEEPSEEK_BASEURL: "",
      LLM_DEEPSEEK_MODEL: "",
      LLM_DEEPSEEK_REASONINGEFFORT: "",
    });

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );

    await callAgent(env, "resume", "", []);

    expect(mockStartAndWaitForPorts).toHaveBeenCalledWith({
      startOptions: {
        envVars: {
          LLM_DEEPSEEK_APIKEY: "sk-test",
          LLM_DEEPSEEK_BASEURL: "https://api.deepseek.com/v1",
          LLM_DEEPSEEK_MODEL: "deepseek-v4-flash",
          LLM_DEEPSEEK_REASONINGEFFORT: "high",
        },
      },
    });
  });

  it("sends correct HTTP request to container", async () => {
    const jobs: UserMatchedJobPromptInput[] = [
      { jobId: "j1", jobTitle: "Job 1", jobLink: "https://x.com/1", jobDescription: "desc1", location: "Remote", salary: "$100k" },
    ];

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );

    await callAgent(makeEnv(), "my resume", "$120k+", jobs);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("http://container/match");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(opts.body);
    expect(body.resume).toBe("my resume");
    expect(body.expectations).toBe("$120k+");
    expect(body.jobs).toEqual(jobs);
  });

  it("parses response and returns matches", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          { jobId: "j1", jobTitle: "Job 1", jobLink: "https://x.com/1", matchScore: "8", reason: "Good fit" },
          { jobId: "j2", jobTitle: "Job 2", jobLink: "https://x.com/2", matchScore: "7", reason: "OK fit" },
        ]),
        { status: 200 }
      )
    );

    const result = await callAgent(makeEnv(), "r", "e", []);
    expect(result).toHaveLength(2);
    expect(result[0].jobId).toBe("j1");
    expect(result[0].matchScore).toBe("8");
    expect(result[1].reason).toBe("OK fit");
  });

  it("throws on non-200 response", async () => {
    mockFetch.mockResolvedValue(
      new Response("Internal Error", { status: 500 })
    );

    await expect(callAgent(makeEnv(), "r", "e", [])).rejects.toThrow(
      "Container agent error: 500"
    );
  });
});
