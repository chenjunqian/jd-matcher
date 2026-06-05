import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { createServer } from "node:http";
import type { Server } from "node:http";

const mockRunMatchAgent = vi.fn();

vi.mock("../lib/agent/match_agent.js", () => ({
  runMatchAgent: mockRunMatchAgent,
  buildSystemPrompt: vi.fn((r: string, e: string) => `system: ${r} / ${e}`),
}));

// Dynamic import after mock is set up
const serverModule = await import("./server.js");
const { handleRequest } = serverModule;

let server: Server;
let port: number;

beforeAll(async () => {
  process.env.LLM_DEEPSEEK_APIKEY = process.env.LLM_DEEPSEEK_APIKEY || "test-key";
  server = createServer(handleRequest);
  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });
  port = (server.address() as { port: number }).port;
  console.log(`[test] container server on port ${port}`);
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  mockRunMatchAgent.mockReset();
});

function makeSampleJobs() {
  return [
    {
      jobId: "test-job-1",
      jobTitle: "Senior TypeScript Developer",
      jobLink: "https://example.com/job/1",
      jobDescription: "TypeScript, React, Node.js. 5+ years.",
      location: "Remote",
      salary: "$120k-$160k",
    },
    {
      jobId: "test-job-2",
      jobTitle: "Junior Python Developer",
      jobLink: "https://example.com/job/2",
      jobDescription: "Python, Django. Entry level.",
      location: "New York, NY",
      salary: "$50k-$70k",
    },
  ];
}

describe("Container server integration", () => {
  it("GET /health returns OK", async () => {
    const resp = await fetch(`http://localhost:${port}/health`);
    expect(resp.status).toBe(200);
    expect(await resp.text()).toBe("OK");
  });

  it("POST /match forwards correct data to runMatchAgent", async () => {
    const matchedJobs = [
      { jobId: "test-job-1", jobTitle: "Senior TypeScript Developer", jobLink: "https://example.com/job/1", matchScore: "9", reason: "Perfect match" },
    ];
    mockRunMatchAgent.mockResolvedValue(matchedJobs);

    const jobs = makeSampleJobs();
    const resp = await fetch(`http://localhost:${port}/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resume: "TypeScript dev, 8 years",
        expectations: "$120k+, Remote",
        jobs,
      }),
    });

    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data).toEqual(matchedJobs);

    // Verify runMatchAgent was called with correct params
    expect(mockRunMatchAgent).toHaveBeenCalledTimes(1);
    const callArgs = mockRunMatchAgent.mock.calls[0][0];
    expect(callArgs.resume).toBe("TypeScript dev, 8 years");
    expect(callArgs.expectations).toBe("$120k+, Remote");
    expect(callArgs.jobs).toEqual(jobs);
    expect(callArgs.apiKey).toBe("test-key");
    expect(callArgs.baseURL).toBe("https://api.deepseek.com/v1");
    expect(callArgs.modelName).toBe("deepseek-v4-flash");
    expect(callArgs.reasoningEffort).toBe("high");
  });

  it("POST /match uses custom env vars when set", async () => {
    const origBaseURL = process.env.LLM_DEEPSEEK_BASEURL;
    const origModel = process.env.LLM_DEEPSEEK_MODEL;
    const origEffort = process.env.LLM_DEEPSEEK_REASONINGEFFORT;
    process.env.LLM_DEEPSEEK_BASEURL = "https://custom.api/v1";
    process.env.LLM_DEEPSEEK_MODEL = "custom-model";
    process.env.LLM_DEEPSEEK_REASONINGEFFORT = "low";

    mockRunMatchAgent.mockResolvedValue([]);

    const resp = await fetch(`http://localhost:${port}/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume: "r", expectations: "", jobs: [] }),
    });

    expect(resp.status).toBe(200);

    const callArgs = mockRunMatchAgent.mock.calls[0][0];
    expect(callArgs.baseURL).toBe("https://custom.api/v1");
    expect(callArgs.modelName).toBe("custom-model");
    expect(callArgs.reasoningEffort).toBe("low");

    process.env.LLM_DEEPSEEK_BASEURL = origBaseURL;
    process.env.LLM_DEEPSEEK_MODEL = origModel;
    process.env.LLM_DEEPSEEK_REASONINGEFFORT = origEffort;
  });

  it("POST /match returns 500 on agent error", async () => {
    mockRunMatchAgent.mockRejectedValue(new Error("API timeout"));

    const resp = await fetch(`http://localhost:${port}/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume: "r", expectations: "", jobs: [] }),
    });

    expect(resp.status).toBe(500);
    const data = await resp.json();
    expect(data.error).toContain("API timeout");
  });

  it("returns 404 for unknown routes", async () => {
    const resp = await fetch(`http://localhost:${port}/unknown`);
    expect(resp.status).toBe(404);
  });
});
