import { Bot, Context } from "grammy";
import type { Env } from "../lib/types.js";
import { getSession } from "./session.js";
import { startCommandHandler, helpCommandHandler, allJobsCommandHandler, allJobsCallbackHandler, jobsCommandHandler, jobsCallbackHandler, uploadResumeCommandHandler, uploadResumeFileHandler, expectationCommandHandler, expectationTextHandler } from "./handlers/index.js";

export interface BotContext extends Context {
  env: Env;
}

export function createBot(token: string, env: Env): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);
  bot.use(async (ctx, next) => { ctx.env = env; await next(); });

  bot.command("start", startCommandHandler);
  bot.command("help", helpCommandHandler);
  bot.command("all_jobs", allJobsCommandHandler);
  bot.command("jobs", jobsCommandHandler);
  bot.command("upload_resume", uploadResumeCommandHandler);
  bot.command("expectation", expectationCommandHandler);

  bot.callbackQuery(/^all_jobs_callback_data_/, allJobsCallbackHandler);
  bot.callbackQuery(/^matched_jobs_callback_data_/, jobsCallbackHandler);
  bot.on(":document", uploadResumeFileHandler);

  bot.on(":text", async (ctx) => {
    const s = await getSession(env.SESSION_KV, ctx.chat.id);
    if (s.awaitingUpload) return void await ctx.reply("Please upload your resume as a text file.");
    const last = s.lastBotMessage;
    if (last && (last.startsWith("Your current expectations:") || last.startsWith("Please enter your job expectations")))
      return void await expectationTextHandler(ctx);
  });

  return bot;
}
