import type { BotContext } from "../bot.js";
import { createUserInfoIfNotExist, getUserInfoByTelegramId } from "../../lib/db/user_info.js";
import { START_REPLY, START_ERROR } from "../constants.js";

export async function startCommandHandler(ctx: BotContext) {
  const env = ctx.env;
  const from = ctx.from!;
  const userId = String(from.id);
  const name = `${from.last_name ?? ""} ${from.first_name ?? ""}`.trim();
  try {
    if (!(await getUserInfoByTelegramId(env.DB, userId))) {
      await createUserInfoIfNotExist(env.DB, { id: crypto.randomUUID(), telegramId: userId, name });
    }
    await ctx.reply(START_REPLY.replace("%s", name));
  } catch (e) {
    console.error(`[start] error for user ${userId}:`, e);
    await ctx.reply(START_ERROR.replace("%s", name));
  }
}
