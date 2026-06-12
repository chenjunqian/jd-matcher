import { Hono } from "hono";
import { webhookCallback } from "grammy";
import { Container } from "@cloudflare/containers";
import type { Env, JobMessage } from "./lib/types.js";
import landingHtml from "./landing.html";
import { createBot } from "./bot/bot.js";
import { handleCrawl } from "./jobs/crawl.js";
import { handleEmbed } from "./jobs/embed.js";
import { handleMatch } from "./jobs/match.js";
import { handleNotify } from "./jobs/notify.js";
import { getUsersWithResumeCount } from "./lib/db/user_info.js";
import { getEmailVerificationByToken, markEmailVerified, deleteEmailVerification } from "./lib/db/email_verification.js";
import { getUserInfoById, updateUserEmail } from "./lib/db/user_info.js";

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

// ─── Landing page ──────────────────────────────────────────────────────────
app.get("/", (c) => c.html(landingHtml));

// ─── Health ────────────────────────────────────────────────────────────────
app.get("/health", (c) => c.text("OK"));

// ─── Email verification ────────────────────────────────────────────────────
app.get("/verify-email", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.text("Missing token", 400);

  try {
    const record = await getEmailVerificationByToken(c.env.DB, token);
    if (!record) return c.text("Invalid verification link.", 400);

    if (record.verified) return c.text("This verification link has already been used.", 400);

    if (new Date(record.expiresAt) < new Date()) return c.text("This verification link has expired. Please use /email again.", 400);

    const user = await getUserInfoById(c.env.DB, record.userId);
    if (!user) return c.text("User not found.", 400);

    await markEmailVerified(c.env.DB, token);
    await updateUserEmail(c.env.DB, record.userId, record.email);
    await deleteEmailVerification(c.env.DB, token);

    if (user.telegramId) {
      const telegramUrl = `https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
      const msg = `Your email ${record.email} has been verified successfully!`;
      await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: user.telegramId, text: msg }),
      });
    }

    return c.html(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Email Verified</title></head>
<body style="font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5">
<div style="text-align:center;padding:40px;background:white;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.1)">
<h1 style="color:#22c55e">✓ Email Verified</h1><p style="color:#333;font-size:18px">${record.email} has been verified successfully.</p>
<p style="color:#666">You can now close this page.</p></div></body></html>`);
  } catch (err) {
    console.error("verify-email:", err);
    return c.text("Something went wrong. Please try again.", 500);
  }
});



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
