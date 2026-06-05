import { Hono } from "hono";
import { webhookCallback } from "grammy";
import { Container } from "@cloudflare/containers";
import type { Env, JobMessage } from "./lib/types.js";
import { createBot } from "./bot/bot.js";
import { handleCrawl } from "./jobs/crawl.js";
import { handleEmbed } from "./jobs/embed.js";
import { handleMatch } from "./jobs/match.js";
import { handleNotify } from "./jobs/notify.js";
import { getUsersWithResumeCount } from "./lib/db/user_info.js";

export class MatchContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "20s";
}

const app = new Hono<{ Bindings: Env }>();

// ─── Telegram webhook ──────────────────────────────────────────────────────
app.post("/telegram/webhook", (c) => {
  const bot = createBot(c.env.TELEGRAM_BOT_TOKEN, c.env);
  return webhookCallback(bot, "cloudflare-mod")(c.req.raw);
});

// ─── Health ────────────────────────────────────────────────────────────────
app.get("/health", (c) => c.text("OK"));



export default {
  fetch: app.fetch,

  async scheduled(_controller: ScheduledController, env: Env) {
    const hour = new Date().getUTCHours();

    const jobs: { type: JobMessage["type"]; offset?: number }[] = [];

    if (hour % 2 === 0) {
      jobs.push({ type: "crawl" });
    }

    jobs.push({ type: "embed" });

    if (hour % 3 === 0) {
      const totalUsers = await getUsersWithResumeCount(env.DB);
      for (let i = 0; i < totalUsers; i++) {
        jobs.push({ type: "match", offset: i });
      }
      jobs.push({ type: "notify" });
    }

    for (const j of jobs) {
      await env.JOBS_QUEUE.send(j);
    }

    console.log(`[cron] enqueued ${jobs.map(j => j.type).join(", ")}`);
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
        console.error(`[queue] ${type} failed:`, err, msg.body);
        msg.retry({ delaySeconds: 60 });
      }
    }
  },
};
