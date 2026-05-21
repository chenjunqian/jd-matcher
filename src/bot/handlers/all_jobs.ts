import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot.js";
import { getLatestJobList, getTotalJobCount } from "../../lib/db/job_detail.js";

const PREFIX = "all_jobs_callback_data_";
const PAGE = PREFIX + "current_page_";
const TOTAL = PREFIX + "total_page_";
const NEXT = PREFIX + "next_page";
const PREV = PREFIX + "pre_page";
const SIZE = 10;

function fmt(jobs: Array<{ title: string; link: string; location: string; salary: string; updateTime: string }>): string {
  return jobs.map((j) => `Title : ${j.title}\nLink : ${j.link}\nLocation : ${j.location}\nSalary : ${j.salary}\nDate : ${(j.updateTime ?? "").split("T")[0]}\n`).join("\n") || "No jobs available.";
}

function kb(page: number, total: number): InlineKeyboard {
  return new InlineKeyboard()
    .text(`Current Page ${page + 1}`, PAGE + String(page)).row()
    .text(`Total Page ${total}`, TOTAL + String(total)).row()
    .text("Pre Page", PREV).text("Next Page", NEXT);
}

export async function allJobsCommandHandler(ctx: BotContext) {
  const jobs = await getLatestJobList(ctx.env.DB, 0, SIZE);
  const total = Math.ceil((await getTotalJobCount(ctx.env.DB)) / SIZE) || 1;
  await ctx.reply(fmt(jobs), { reply_markup: kb(0, total) });
}

export async function allJobsCallbackHandler(ctx: BotContext) {
  const cb = ctx.callbackQuery!;
  let page = 0;
  if (cb.message && "reply_markup" in cb.message) {
    for (const row of cb.message.reply_markup!.inline_keyboard) {
      for (const btn of row) {
        const d = (btn as { callback_data?: string }).callback_data;
        if (d?.startsWith(PAGE)) { page = Number(d.slice(PAGE.length)); break; }
      }
    }
  }
  if (cb.data === PREV && page > 0) page--;
  else if (cb.data === NEXT) page++;
  else return void await ctx.answerCallbackQuery();

  const jobs = await getLatestJobList(ctx.env.DB, page * SIZE, SIZE);
  const total = Math.ceil((await getTotalJobCount(ctx.env.DB)) / SIZE) || 1;
  await ctx.editMessageText(fmt(jobs), { reply_markup: kb(page, total) });
}
