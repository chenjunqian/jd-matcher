import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleMatch } from "./match";
import type { Env } from "../lib/types";

const {
  mockGetUsersWithResume,
  mockGetJobDetailsByIds,
  mockCreateMatchJobIfNotExist,
  mockGetExistingMatchedJobIds,
  mockGetVectorById,
  mockQuerySimilar,
  mockCallAgent,
} = vi.hoisted(() => ({
  mockGetUsersWithResume: vi.fn(),
  mockGetJobDetailsByIds: vi.fn(),
  mockCreateMatchJobIfNotExist: vi.fn(),
  mockGetExistingMatchedJobIds: vi.fn(),
  mockGetVectorById: vi.fn(),
  mockQuerySimilar: vi.fn(),
  mockCallAgent: vi.fn(),
}));

vi.mock("../lib/db/user_info", () => ({
  getUsersWithResume: mockGetUsersWithResume,
}));

vi.mock("../lib/db/job_detail", () => ({
  getJobDetailsByIds: mockGetJobDetailsByIds,
}));

vi.mock("../lib/db/user_matched_job", () => ({
  createMatchJobIfNotExist: mockCreateMatchJobIfNotExist,
  getExistingMatchedJobIds: mockGetExistingMatchedJobIds,
}));

vi.mock("../lib/vectorize/index", () => ({
  getVectorById: mockGetVectorById,
  querySimilar: mockQuerySimilar,
}));

vi.mock("./agent_client", () => ({
  callAgent: mockCallAgent,
}));

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

const recentJob = {
  id: "job-1",
  title: "Senior TypeScript Dev",
  jobDesc: "Looking for a senior developer with TS experience.",
  jobTags: [] as string[],
  link: "https://example.com/job/1",
  source: "remoteok",
  location: "Remote",
  salary: "$120k-$160k",
  updateTime: new Date().toISOString(),
  vectorizeId: "vec-job-1",
};

const userWithResume = {
  id: "user-1",
  telegramId: "12345",
  resume: "TypeScript developer resume content",
  jobExpectations: "Remote only, $120k minimum",
  vectorizeId: "vec-user-1",
};

describe("handleMatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs and returns when no users found", async () => {
    mockGetUsersWithResume.mockResolvedValue([]);

    await handleMatch(makeEnv(), 0);

    expect(mockGetUsersWithResume).toHaveBeenCalledTimes(1);
    expect(mockGetVectorById).not.toHaveBeenCalled();
    expect(mockCallAgent).not.toHaveBeenCalled();
  });

  it("logs and returns when no vector found for user", async () => {
    mockGetUsersWithResume.mockResolvedValue([userWithResume]);
    mockGetVectorById.mockResolvedValue(null);

    await handleMatch(makeEnv(), 0);

    expect(mockGetVectorById).toHaveBeenCalledWith({}, "vec-user-1");
    expect(mockQuerySimilar).not.toHaveBeenCalled();
    expect(mockCallAgent).not.toHaveBeenCalled();
  });

  it("logs and returns when no similar jobs found", async () => {
    mockGetUsersWithResume.mockResolvedValue([userWithResume]);
    mockGetVectorById.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQuerySimilar.mockResolvedValue([]);

    await handleMatch(makeEnv(), 0);

    expect(mockQuerySimilar).toHaveBeenCalledWith({}, [0.1, 0.2, 0.3], 30);
    expect(mockGetJobDetailsByIds).not.toHaveBeenCalled();
    expect(mockCallAgent).not.toHaveBeenCalled();
  });

  it("logs and returns when no recent jobs (all older than 1 month)", async () => {
    const oldJob = { ...recentJob, updateTime: "2020-01-01T00:00:00Z" };

    mockGetUsersWithResume.mockResolvedValue([userWithResume]);
    mockGetVectorById.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQuerySimilar.mockResolvedValue([{ id: "job-1", score: 0.95 }]);
    mockGetJobDetailsByIds.mockResolvedValue([oldJob]);

    await handleMatch(makeEnv(), 0);

    expect(mockGetJobDetailsByIds).toHaveBeenCalledWith({}, ["job-1"]);
    expect(mockCallAgent).not.toHaveBeenCalled();
  });

  it("calls runMatchAgent with correct inputs for matching jobs", async () => {
    mockGetUsersWithResume.mockResolvedValue([userWithResume]);
    mockGetVectorById.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQuerySimilar.mockResolvedValue([{ id: "job-1", score: 0.95 }]);
    mockGetJobDetailsByIds.mockResolvedValue([recentJob]);
    mockGetExistingMatchedJobIds.mockResolvedValue([]);
    mockCallAgent.mockResolvedValue([
      {
        jobId: "job-1",
        jobTitle: "Senior TypeScript Dev",
        jobLink: "https://example.com/job/1",
        matchScore: "9",
        reason: "Great match for TS experience",
      },
    ]);

    await handleMatch(makeEnv(), 0);

    expect(mockCallAgent).toHaveBeenCalledTimes(1);
    const callArgs = mockCallAgent.mock.calls[0];
    expect(callArgs[1]).toBe("TypeScript developer resume content");
    expect(callArgs[2]).toBe("Remote only, $120k minimum");
    expect(callArgs[3]).toHaveLength(1);
    expect(callArgs[3][0].jobId).toBe("job-1");
    expect(callArgs[3][0].jobTitle).toBe("Senior TypeScript Dev");
    expect(callArgs[3][0].jobLink).toBe("https://example.com/job/1");
    expect(callArgs[3][0].location).toBe("Remote");
    expect(callArgs[3][0].salary).toBe("$120k-$160k");
    expect(callArgs[3][0].jobDescription).toBe("Looking for a senior developer with TS experience.");
  });

  it("stores matched jobs via createMatchJobIfNotExist", async () => {
    mockGetUsersWithResume.mockResolvedValue([userWithResume]);
    mockGetVectorById.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQuerySimilar.mockResolvedValue([{ id: "job-1", score: 0.95 }]);
    mockGetJobDetailsByIds.mockResolvedValue([recentJob]);
    mockGetExistingMatchedJobIds.mockResolvedValue([]);
    mockCallAgent.mockResolvedValue([
      {
        jobId: "job-1",
        jobTitle: "Senior TypeScript Dev",
        jobLink: "https://example.com/job/1",
        matchScore: "9",
        reason: "Great match",
      },
    ]);

    await handleMatch(makeEnv(), 0);

    expect(mockCreateMatchJobIfNotExist).toHaveBeenCalledTimes(1);
    const storedMatches = mockCreateMatchJobIfNotExist.mock.calls[0][1];
    expect(storedMatches).toHaveLength(1);
    expect(storedMatches[0].userId).toBe("user-1");
    expect(storedMatches[0].jobId).toBe("job-1");
    expect(storedMatches[0].notification).toBe(false);
    expect(storedMatches[0].matchScore).toBe("9");
    expect(storedMatches[0].matchReason).toBe("Great match");
  });

  it("does not store when runMatchAgent returns empty results", async () => {
    mockGetUsersWithResume.mockResolvedValue([userWithResume]);
    mockGetVectorById.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQuerySimilar.mockResolvedValue([{ id: "job-1", score: 0.95 }]);
    mockGetJobDetailsByIds.mockResolvedValue([recentJob]);
    mockGetExistingMatchedJobIds.mockResolvedValue([]);
    mockCallAgent.mockResolvedValue([]);

    await handleMatch(makeEnv(), 0);

    expect(mockCreateMatchJobIfNotExist).not.toHaveBeenCalled();
  });

  it("skips runMatchAgent when all jobs are already matched", async () => {
    mockGetUsersWithResume.mockResolvedValue([userWithResume]);
    mockGetVectorById.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQuerySimilar.mockResolvedValue([{ id: "job-1", score: 0.95 }, { id: "job-2", score: 0.85 }]);
    mockGetJobDetailsByIds.mockResolvedValue([
      { ...recentJob, id: "job-1" },
      { ...recentJob, id: "job-2", title: "Job 2" },
    ]);
    mockGetExistingMatchedJobIds.mockResolvedValue(["job-1", "job-2"]);

    await handleMatch(makeEnv(), 0);

    expect(mockCallAgent).not.toHaveBeenCalled();
    expect(mockCreateMatchJobIfNotExist).not.toHaveBeenCalled();
  });

  it("filters out agent results with score below 6", async () => {
    mockGetUsersWithResume.mockResolvedValue([userWithResume]);
    mockGetVectorById.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQuerySimilar.mockResolvedValue([{ id: "job-1", score: 0.95 }, { id: "job-2", score: 0.85 }]);
    mockGetJobDetailsByIds.mockResolvedValue([
      { ...recentJob, id: "job-1" },
      { ...recentJob, id: "job-2", title: "Job 2" },
    ]);
    mockGetExistingMatchedJobIds.mockResolvedValue([]);
    mockCallAgent.mockResolvedValue([
      { jobId: "job-1", jobTitle: "Job 1", jobLink: "https://example.com/job/1", matchScore: "3", reason: "Low" },
      { jobId: "job-2", jobTitle: "Job 2", jobLink: "https://example.com/job/1", matchScore: "8", reason: "Good" },
    ]);

    await handleMatch(makeEnv(), 0);

    expect(mockCreateMatchJobIfNotExist).toHaveBeenCalledTimes(1);
    const storedMatches = mockCreateMatchJobIfNotExist.mock.calls[0][1];
    expect(storedMatches).toHaveLength(1);
    expect(storedMatches[0].jobId).toBe("job-2");
    expect(storedMatches[0].matchScore).toBe("8");
  });

  it("filters out already-matched jobs and only sends new ones to agent", async () => {
    mockGetUsersWithResume.mockResolvedValue([userWithResume]);
    mockGetVectorById.mockResolvedValue([0.1, 0.2, 0.3]);
    mockQuerySimilar.mockResolvedValue([
      { id: "job-1", score: 0.95 },
      { id: "job-2", score: 0.85 },
      { id: "job-3", score: 0.80 },
    ]);
    mockGetJobDetailsByIds.mockResolvedValue([
      { ...recentJob, id: "job-1" },
      { ...recentJob, id: "job-2", title: "Job 2" },
      { ...recentJob, id: "job-3", title: "Job 3" },
    ]);
    mockGetExistingMatchedJobIds.mockResolvedValue(["job-1", "job-3"]);
    mockCallAgent.mockResolvedValue([
      {
        jobId: "job-2",
        jobTitle: "Job 2",
        jobLink: "https://example.com/job/1",
        matchScore: "8",
        reason: "Good match for job 2",
      },
    ]);

    await handleMatch(makeEnv(), 0);

    expect(mockGetExistingMatchedJobIds).toHaveBeenCalledWith({}, "user-1", ["job-1", "job-2", "job-3"]);
    expect(mockCallAgent).toHaveBeenCalledTimes(1);
    const callArgs = mockCallAgent.mock.calls[0];
    expect(callArgs[3]).toHaveLength(1);
    expect(callArgs[3][0].jobId).toBe("job-2");
    expect(mockCreateMatchJobIfNotExist).toHaveBeenCalledTimes(1);
  });
});
