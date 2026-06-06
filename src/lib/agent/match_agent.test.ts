import { describe, it, expect, vi, beforeEach } from "vitest";
import { runMatchAgent, buildSystemPrompt } from "./match_agent";
import type { UserMatchedJobPromptInput } from "../types";

const { mockGenerateText } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateText: mockGenerateText };
});

function makeJobs(count: number): UserMatchedJobPromptInput[] {
  return Array.from({ length: count }, (_, i) => ({
    jobId: `job-${i}`,
    jobTitle: `Job ${i}`,
    jobLink: `https://example.com/job/${i}`,
    jobDescription: `Description for job ${i}. Requires TypeScript, React, Node.js, ${5 + i} years experience.`,
    location: "Remote",
    salary: `$${100 + i * 10}k-$150k`,
  }));
}

function baseInput(jobs: UserMatchedJobPromptInput[]) {
  return {
    resume: "Experienced TypeScript developer with 5 years of experience in React and Node.js.",
    expectations: "Remote work only. Minimum salary $120k.",
    jobs,
    apiKey: "test-key",
    baseURL: "https://api.deepseek.com/v1",
    modelName: "deepseek-v4-flash",
    reasoningEffort: "high",
  };
}

describe("buildSystemPrompt", () => {
  it("includes resume and expectations when expectations are provided", () => {
    const prompt = buildSystemPrompt("My resume content", "Remote only, $120k minimum");

    expect(prompt).toContain("My resume content");
    expect(prompt).toContain("Remote only, $120k minimum");
    expect(prompt).toContain("EXPECTATIONS CHECK (MANDATORY)");
    expect(prompt).toContain("If ANY expectation is NOT met");
    expect(prompt).not.toContain("No specific expectations provided");
  });

  it("shows no-expectations message when expectations are empty", () => {
    const prompt = buildSystemPrompt("My resume", "");

    expect(prompt).toContain("No specific expectations provided");
    expect(prompt).toContain("No expectations to check. Proceed to scoring.");
    expect(prompt).not.toContain("If ANY expectation is NOT met");
  });

  it("shows no-expectations message when expectations are whitespace only", () => {
    const prompt = buildSystemPrompt("My resume", "   ");

    expect(prompt).toContain("No specific expectations provided");
  });

  it("includes scoring rubric", () => {
    const prompt = buildSystemPrompt("Resume", "Expectations");

    expect(prompt).toContain("9-10");
    expect(prompt).toContain("7-8");
    expect(prompt).toContain("Below threshold");
    expect(prompt).toContain("getPendingJobs");
    expect(prompt).toContain("submitEvaluation");
  });

  it("includes REVIEW step at end of workflow", () => {
    const prompt = buildSystemPrompt("Resume", "Expectations");

    expect(prompt).toContain("REVIEW");
    expect(prompt).toContain("score is < 6");
    expect(prompt).toContain("violates a candidate expectation");
    expect(prompt).toContain("you made a mistake");
  });
});

describe("runMatchAgent", () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it("calls tools for each job and returns all matches", async () => {
    const jobs = makeJobs(3);

    mockGenerateText.mockImplementation(async (params: any) => {
      const { tools } = params;
      let done = false;
      while (!done) {
        const batch: any = await tools.getPendingJobs.execute({ batchSize: 3 });
        if (batch.done) {
          done = true;
          break;
        }
        for (const job of batch.jobs) {
          await tools.submitEvaluation.execute({
            jobId: job.jobId,
            matchScore: "8",
            reason: `Good match for ${job.jobTitle}`,
          });
        }
      }
      return { text: "All jobs evaluated." };
    });

    const result = await runMatchAgent(baseInput(jobs));

    expect(result).toHaveLength(3);
    expect(result[0].jobId).toBe("job-0");
    expect(result[0].jobTitle).toBe("Job 0");
    expect(result[0].matchScore).toBe("8");
    expect(result[0].reason).toBe("Good match for Job 0");
    expect(result[2].jobId).toBe("job-2");
  });

  it("returns empty array when job list is empty", async () => {
    mockGenerateText.mockImplementation(async (params: any) => {
      const { tools } = params;
      const batch: any = await tools.getPendingJobs.execute({ batchSize: 3 });
      expect(batch.done).toBe(true);
      return { text: "No jobs to evaluate." };
    });

    const result = await runMatchAgent(baseInput([]));

    expect(result).toHaveLength(0);
  });

  it("processes jobs in multiple batches", async () => {
    const jobs = makeJobs(6);

    mockGenerateText.mockImplementation(async (params: any) => {
      const { tools } = params;
      let done = false;
      while (!done) {
        const batch: any = await tools.getPendingJobs.execute({ batchSize: 3 });
        if (batch.done) {
          done = true;
          break;
        }
        for (const job of batch.jobs) {
          await tools.submitEvaluation.execute({
            jobId: job.jobId,
            matchScore: "7",
            reason: "Match",
          });
        }
      }
      return { text: "All jobs evaluated." };
    });

    const result = await runMatchAgent(baseInput(jobs));

    expect(result).toHaveLength(6);
    expect(result.map((r) => r.jobId).sort()).toEqual(
      ["job-0", "job-1", "job-2", "job-3", "job-4", "job-5"]
    );
  });

  it("deduplicates multiple submitEvaluation calls for the same job", async () => {
    const jobs = makeJobs(1);

    mockGenerateText.mockImplementation(async (params: any) => {
      const { tools } = params;
      const batch: any = await tools.getPendingJobs.execute({ batchSize: 1 });
      expect(batch.done).toBe(false);

      await tools.submitEvaluation.execute({
        jobId: batch.jobs[0].jobId,
        matchScore: "8",
        reason: "First submit",
      });

      const dupResult: any = await tools.submitEvaluation.execute({
        jobId: batch.jobs[0].jobId,
        matchScore: "9",
        reason: "Duplicate submit",
      });

      expect(dupResult.error).toContain("already evaluated");

      const batch2: any = await tools.getPendingJobs.execute({ batchSize: 1 });
      expect(batch2.done).toBe(true);

      return { text: "All jobs evaluated." };
    });

    const result = await runMatchAgent(baseInput(jobs));

    expect(result).toHaveLength(1);
    expect(result[0].matchScore).toBe("8");
    expect(result[0].reason).toBe("First submit");
  });

  it("rejects evaluation for unknown jobId", async () => {
    const jobs = makeJobs(1);

    mockGenerateText.mockImplementation(async (params: any) => {
      const { tools } = params;
      const result: any = await tools.submitEvaluation.execute({
        jobId: "nonexistent-job",
        matchScore: "8",
        reason: "N/A",
      });
      expect(result.error).toContain("not in the job list");
      return { text: "Done." };
    });

    const result = await runMatchAgent(baseInput(jobs));

    expect(result).toHaveLength(0);
  });

  it("passes correct parameters to generateText", async () => {
    const jobs = makeJobs(1);

    mockGenerateText.mockImplementation(async () => {
      return { text: "Done." };
    });

    await runMatchAgent(baseInput(jobs));

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateText.mock.calls[0][0];

    expect(callArgs.model).toBeDefined();
    expect(callArgs.system).toContain("Experienced TypeScript developer");
    expect(callArgs.system).toContain("Remote work only");
    expect(callArgs.messages[0].content).toContain("1 jobs to evaluate");
    expect(callArgs.stopWhen).toBeDefined();
    expect(callArgs.tools.getPendingJobs).toBeDefined();
    expect(callArgs.tools.submitEvaluation).toBeDefined();
    expect(callArgs.providerOptions.openai.reasoningEffort).toBe("high");
  });

  it("rejects evaluation for score below 6", async () => {
    const jobs = makeJobs(1);

    mockGenerateText.mockImplementation(async (params: any) => {
      const { tools } = params;
      const batch: any = await tools.getPendingJobs.execute({ batchSize: 1 });
      expect(batch.done).toBe(false);

      const result: any = await tools.submitEvaluation.execute({
        jobId: batch.jobs[0].jobId,
        matchScore: "3",
        reason: "Not a good match",
      });
      expect(result.error).toContain("below threshold");
      return { text: "Done." };
    });

    const result = await runMatchAgent(baseInput(jobs));

    expect(result).toHaveLength(0);
  });

  it("rejects evaluation for non-numeric score", async () => {
    const jobs = makeJobs(1);

    mockGenerateText.mockImplementation(async (params: any) => {
      const { tools } = params;
      const batch: any = await tools.getPendingJobs.execute({ batchSize: 1 });

      const result: any = await tools.submitEvaluation.execute({
        jobId: batch.jobs[0].jobId,
        matchScore: "n/a",
        reason: "Bad score",
      });
      expect(result.error).toContain("below threshold");
      return { text: "Done." };
    });

    const result = await runMatchAgent(baseInput(jobs));

    expect(result).toHaveLength(0);
  });

  it("accepts evaluation for score exactly 6", async () => {
    const jobs = makeJobs(1);

    mockGenerateText.mockImplementation(async (params: any) => {
      const { tools } = params;
      const batch: any = await tools.getPendingJobs.execute({ batchSize: 1 });

      const result: any = await tools.submitEvaluation.execute({
        jobId: batch.jobs[0].jobId,
        matchScore: "6",
        reason: "Barely passes",
      });
      expect(result.ok).toBe(true);
      return { text: "Done." };
    });

    const result = await runMatchAgent(baseInput(jobs));

    expect(result).toHaveLength(1);
    expect(result[0].matchScore).toBe("6");
  });

  it("returns partial results when generateText throws mid-process", async () => {
    const jobs = makeJobs(3);

    mockGenerateText.mockImplementation(async (params: any) => {
      const { tools } = params;
      const batch: any = await tools.getPendingJobs.execute({ batchSize: 3 });
      // Submit only the first job, then throw
      await tools.submitEvaluation.execute({
        jobId: batch.jobs[0].jobId,
        matchScore: "9",
        reason: "Perfect match",
      });
      throw new Error("API error");
    });

    const result = await runMatchAgent(baseInput(jobs));

    expect(result).toHaveLength(1);
    expect(result[0].jobId).toBe("job-0");
    expect(result[0].matchScore).toBe("9");
  });
});
