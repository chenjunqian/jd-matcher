import type { Env } from "../lib/types.js";
import { getUnembeddedJobCount, getUnembeddedJobList, updateJobDetailVectorizeId } from "../lib/db/job_detail.js";
import { embedText } from "../lib/llm/embedding.js";
import { upsertVectors } from "../lib/vectorize/index.js";

const EMBED_BATCH = 5;

export async function handleEmbed(env: Env, limit = EMBED_BATCH): Promise<void> {
  const total = await getUnembeddedJobCount(env.DB);
  if (!total) { console.log("[embed] no unembedded jobs"); return; }

  const jobs = await getUnembeddedJobList(env.DB, 0, limit);
  let done = 0;

  for (const job of jobs) {
    try {
      if (!job.jobDesc) {
        await updateJobDetailVectorizeId(env.DB, job.id, "__no_desc__");
        done++;
        continue;
      }
      const [v] = await embedText(env, [job.jobDesc]);
      if (v) {
        await upsertVectors(env.JOB_DESC_EMBEDDINGS, [{ id: job.id, values: v }]);
        await updateJobDetailVectorizeId(env.DB, job.id, job.id);
        done++;
      }
    } catch (e) {
      console.error(`[embed] job ${job.id} failed:`, e);
    }
  }

  console.log(`[embed] processed ${done}/${limit}`);

  if (done > 0) {
    const remaining = await getUnembeddedJobCount(env.DB);
    if (remaining > 0) {
      await env.JOBS_QUEUE.send({ type: "embed", limit });
      console.log(`[embed] re-enqueued, ${remaining} remaining`);
    }
  }
}
