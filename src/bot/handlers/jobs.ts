import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot.js";
import { getUserInfoByTelegramId } from "../../lib/db/user_info.js";
import { getUserMatchedJobDetailList, getUserMatchedJobDetailListTotalCount } from "../../lib/db/user_matched_job.js";
import { LOGIN_HINT } from "../constants.js";

const PREFIX = "matched_jobs_callback_data_";
const PAGE = PREFIX + "current_page_";
const TOTAL = PREFIX + "total_page_";
const NEXT = PREFIX + "next_page";
const PREV = PREFIX + "pre_page";
const SIZE = 10;

function fmt(jobs: Array<{ title: string; link: string; location: string; salary: string; matchScore: string; updateTime: string }>): string {
  return jobs.map((j) =>
    `Title : ${j.title}\nLink : ${j.link}\nLocation : ${j.location}\nSalary : ${j.salary}\nMatch Score : ${j.matchScore}\nDate : ${(j.updateTime ?? "").split("T")[0]}\n`
  ).join("\n") || "No matched job found, please try again later.";
}

function kb(page: number, total: number): InlineKeyboard {
  return new InlineKeyboard()
    .text(`Current Page ${page + 1}`, PAGE + String(page)).row()
    .text(`Total Page ${total}`, TOTAL + String(total)).row()
    .text("Pre Page", PREV).text("Next Page", NEXT);
}

export async function jobsCommandHandler(ctx: BotContext) {
  const user = await getUserInfoByTelegramId(ctx.env.DB, String(ctx.from!.id));
  if (!user) return void await ctx.reply(LOGIN_HINT);
  const jobs = await getUserMatchedJobDetailList(ctx.env.DB, user.id, 0, SIZE);
  const total = Math.ceil((await getUserMatchedJobDetailListTotalCount(ctx.env.DB, user.id)) / SIZE) || 1;
  await ctx.reply(fmt(jobs), { reply_markup: kb(0, total) });
}

export async function jobsCallbackHandler(ctx: BotContext) {
  const cb = ctx.callbackQuery!;
  const user = await getUserInfoByTelegramId(ctx.env.DB, String(cb.from.id));
  if (!user) return void await ctx.answerCallbackQuery(LOGIN_HINT);

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

  const jobs = await getUserMatchedJobDetailList(ctx.env.DB, user.id, page * SIZE, SIZE);
  const total = Math.ceil((await getUserMatchedJobDetailListTotalCount(ctx.env.DB, user.id)) / SIZE) || 1;
  await ctx.editMessageText(fmt(jobs), { reply_markup: kb(page, total) });
}
