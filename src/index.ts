import { Hono } from "hono";
import { webhookCallback } from "grammy";
import type { Env, JobMessage } from "./lib/types.js";
import { createBot } from "./bot/bot.js";
import { handleCrawl } from "./jobs/crawl.js";
import { handleEmbed } from "./jobs/embed.js";
import { handleMatch } from "./jobs/match.js";
import { handleNotify } from "./jobs/notify.js";
import { upsertVectors } from "./lib/vectorize/index.js";
import { getUsersWithResumeCount } from "./lib/db/user_info.js";

const app = new Hono<{ Bindings: Env }>();

// ─── Telegram webhook ──────────────────────────────────────────────────────
app.post("/webhook", (c) => {
  const bot = createBot(c.env.TELEGRAM_BOT_TOKEN, c.env);
  return webhookCallback(bot, "cloudflare-mod")(c.req.raw);
});

// ─── Health ────────────────────────────────────────────────────────────────
app.get("/health", (c) => c.text("OK"));

// ─── Dev: run job handlers directly (queue bypass for local dev) ──────────
app.post("/dev/run/:type", async (c) => {
  const type = c.req.param("type");
  const env = c.env;
  switch (type) {
    case "crawl":
      await handleCrawl(env);
      break;
    case "embed":
      await handleEmbed(env, 100);
      break;
    case "match": {
      const total = await getUsersWithResumeCount(env.DB);
      for (let i = 0; i < total; i++) await handleMatch(env, i);
      break;
    }
    case "notify":
      await handleNotify(env);
      break;
    default:
      return c.text(`unknown job type: ${type}`, 400);
  }
  return c.text(`done: ${type}`);
});

// ─── Dev: seed test data + run match pipeline ────────────────────────────────
app.post("/dev/test/match", async (c) => {
  const env = c.env;

  await env.DB.prepare("UPDATE job_detail SET vectorize_id = NULL").run();
  await handleEmbed(env, 100);

  const mockEmbedding = new Array(1024).fill(0.01);
  mockEmbedding[0] = 0.5;
  mockEmbedding[1] = -0.3;
  await upsertVectors(env.RESUME_EMBEDDINGS, [{ id: "test-user-1", values: mockEmbedding }]);

  await env.DB.prepare(
    `INSERT OR REPLACE INTO user_info (id, name, telegram_id, resume, job_expectations, vectorize_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    "test-user-1", "Test User", "12345",
    "Senior software engineer with 8 years experience in TypeScript, Node.js, Docker, and AWS. Looking for remote positions.",
    "Remote, Senior, TypeScript",
    "test-user-1"
  ).run();

  await handleMatch(env, 0);

  const matches = await env.DB.prepare(
    `SELECT jd.title, jd.link, umj.match_score, umj.match_reason
     FROM user_matched_job umj JOIN job_detail jd ON umj.job_id = jd.id
     WHERE umj.user_id = 'test-user-1'`
  ).all();

  return c.json({
    matches_found: matches.results?.length ?? 0,
    matches: matches.results ?? [],
  });
});

export default {
  fetch: app.fetch,

  async scheduled(_controller: ScheduledController, env: Env) {
    const totalUsers = await getUsersWithResumeCount(env.DB);

    await env.JOBS_QUEUE.send({ type: "crawl" });
    await env.JOBS_QUEUE.send({ type: "embed" });

    for (let i = 0; i < totalUsers; i++) {
      await env.JOBS_QUEUE.send({ type: "match", offset: i });
    }

    await env.JOBS_QUEUE.send({ type: "notify" });

    console.log(`[cron] enqueued crawl, embed, ${totalUsers} match, notify`);
  },

  async queue(batch: MessageBatch<JobMessage>, env: Env) {
    for (const msg of batch.messages) {
      const { type, limit, offset } = msg.body;
      console.log(`[queue] processing ${type}${offset != null ? ` offset=${offset}` : ""}`);
      try {
        switch (type) {
          case "crawl":
            await handleCrawl(env);
            break;
          case "embed":
            await handleEmbed(env, limit);
            break;
          case "match":
            await handleMatch(env, offset ?? 0);
            break;
          case "notify":
            await handleNotify(env);
            break;
        }
        msg.ack();
      } catch (err) {
        console.error(`[queue] ${type} failed:`, err);
        msg.retry({ delaySeconds: 60 });
      }
    }
  },
};
