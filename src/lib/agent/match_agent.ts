import { generateText, stepCountIs, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import type { UserMatchedJobPromptInput, UserMatchedJobPromptOutput } from "../types.js";

interface RunMatchAgentInput {
  resume: string;
  expectations: string;
  jobs: UserMatchedJobPromptInput[];
  apiKey: string;
  baseURL: string;
  modelName: string;
  reasoningEffort: string;
}

export async function runMatchAgent(input: RunMatchAgentInput): Promise<UserMatchedJobPromptOutput[]> {
  const { resume, expectations, jobs, apiKey, baseURL, modelName, reasoningEffort } = input;

  const provider = createOpenAI({
    apiKey,
    baseURL,
  });

  const model = provider.chat(modelName);

  const results = new Map<string, { matchScore: string; reason: string }>();
  let pendingIndex = 0;

  const systemPrompt = buildSystemPrompt(resume, expectations);

  try {
    await generateText({
      model,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: `${jobs.length} jobs to evaluate. Start by calling getPendingJobs.`,
      }],
      stopWhen: stepCountIs(Math.min(jobs.length * 2 + 10, 80)),
      maxOutputTokens: 4096,
      providerOptions: {
        openai: { reasoningEffort },
      },
      tools: {
        getPendingJobs: tool({
          description: "Get the next batch of unevaluated jobs (1-5 per batch). Returns job details for evaluation.",
          inputSchema: z.object({
            batchSize: z.number().min(1).max(5).default(3).describe("How many jobs to retrieve (1-5)"),
          }),
          execute: async ({ batchSize }) => {
            const batch = jobs.slice(pendingIndex, pendingIndex + batchSize);
            pendingIndex += batch.length;
            if (batch.length === 0) {
              return { done: true, message: "All jobs have been evaluated. No more pending jobs." };
            }
            return {
              done: false,
              remaining: jobs.length - pendingIndex,
              jobs: batch.map((j) => ({
                jobId: j.jobId,
                jobTitle: j.jobTitle,
                jobLink: j.jobLink,
                location: j.location,
                salary: j.salary,
                jobDescription: j.jobDescription.slice(0, 1000),
              })),
            };
          },
        }),
        submitEvaluation: tool({
          description:
            "Submit match evaluation for a SINGLE job. Only call this for jobs that pass ALL expectation checks AND score >= 6.",
          inputSchema: z.object({
            jobId: z.string().describe("Job ID from getPendingJobs"),
            matchScore: z.string().describe("Score as string, e.g. '7' or '8.5', range 0-10"),
            reason: z.string().describe("One-sentence explanation of why this job matches"),
          }),
          execute: async ({ jobId, matchScore, reason }) => {
            if (!jobs.some((j) => j.jobId === jobId)) {
              return { error: `Job ${jobId} is not in the job list.` };
            }
            if (results.has(jobId)) {
              return { error: `Job ${jobId} was already evaluated.` };
            }
            const score = Number(matchScore);
            if (isNaN(score) || score < 6) {
              return { error: `Score ${matchScore} is below threshold 6. Do not submit.` };
            }
            results.set(jobId, { matchScore, reason });
            return { ok: true, totalEvaluated: results.size };
          },
        }),
      },
      onStepFinish: ({ finishReason, toolCalls, usage }) => {
        const names = toolCalls?.map((t) => t.toolName).join(",") || "none";
        console.log(
          `[match_agent] step finish: reason=${finishReason} tools=[${names}] tokens=${usage?.totalTokens ?? "?"}`
        );
      },
    });
  } catch (err) {
    console.error("[match_agent] agent error:", err);
  }

  console.log(`[match_agent] complete: ${results.size} / ${jobs.length} jobs matched`);

  return Array.from(results.entries()).map(([jobId, { matchScore, reason }]) => {
    const job = jobs.find((j) => j.jobId === jobId)!;
    return { jobId, jobTitle: job.jobTitle, jobLink: job.jobLink, matchScore, reason };
  });
}

export function buildSystemPrompt(resume: string, expectations: string): string {
  const hasExpectations = expectations && expectations.trim().length > 0;

  const expectationsHeader = hasExpectations
    ? `- Go through EACH expectation listed above.
      - If ANY expectation is NOT met by the job → SKIP it entirely. Do NOT call submitEvaluation.
      - Examples: location mismatch, salary too low, wrong job title, wrong work setup.`
    : `- No expectations to check. Proceed to scoring.`;

  return `You are an expert career advisor and AI-powered job matching agent. Evaluate each job against the candidate's resume and expectations using the provided tools.

## Candidate Resume

${resume}

## Candidate Expectations

${hasExpectations ? expectations : "No specific expectations provided. Match based solely on skills and experience fit."}

## Tools

1. **getPendingJobs(batchSize)** — Returns the next batch of unevaluated jobs (1-5 per call).
2. **submitEvaluation(jobId, matchScore, reason)** — Records a match. Only call for jobs that pass all checks and score >= 6.

## Workflow — Follow for EVERY batch

1. Call getPendingJobs (suggest batchSize=3).
2. For EACH job in the returned batch:

   a. **EXPECTATIONS CHECK (MANDATORY)**:
${expectationsHeader}

   b. **SCORING**: Score the job 0-10 against the resume:
      | 9-10 | Excellent — skills, experience, and any preferences all align perfectly |
      | 7-8  | Good — most requirements align, gaps are minor |
      | 6    | Acceptable — meets minimum criteria, notable gaps exist |
      | <6   | Below threshold — do NOT submit |

   c. **SUBMIT**: Only call submitEvaluation if score >= 6. Include a concise one-sentence reason.

3. Call getPendingJobs again. Repeat until all jobs are evaluated.
4. **REVIEW**: After all jobs are evaluated, review every submitted evaluation:
   - If any job's score is < 6, you made a mistake — that job should NOT have been submitted.
   - If any job violates a candidate expectation (e.g. wrong location, wrong job type), you made a mistake — it should NOT have been submitted.
   - If you find mistakes, admit them and stop; do NOT submit further.
5. When all done and verified, respond briefly.`;
}
