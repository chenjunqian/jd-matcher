import type { BotContext } from "../bot.js";
import { getUserInfoByTelegramId, updateUserJobExpectations } from "../../lib/db/user_info.js";
import { updateSession, clearSession } from "../session.js";
import * as C from "../constants.js";

export async function expectationCommandHandler(ctx: BotContext) {
  const { env } = ctx;
  const tid = String(ctx.from!.id);
  try {
    const user = await getUserInfoByTelegramId(env.DB, tid);
    if (!user) return void await ctx.reply(C.LOGIN_HINT);
    const msg = user.jobExpectations ? C.EXPECT_HINT_EXISTS.replace("%s", user.jobExpectations) : C.EXPECT_HINT_EMPTY;
    await updateSession(env.SESSION_KV, ctx.chat!.id, { awaitingUpload: false, lastBotMessage: msg });
    await ctx.reply(msg);
  } catch { await ctx.reply(C.COMMON_ERROR); }
}

export async function expectationTextHandler(ctx: BotContext) {
  const { env } = ctx;
  const text = ctx.message?.text;
  if (!text) return;
  try {
    await updateUserJobExpectations(env.DB, String(ctx.from!.id), text);
    await clearSession(env.SESSION_KV, ctx.chat!.id);
    await ctx.reply(C.EXPECT_SUCCESS);
  } catch { await ctx.reply(C.COMMON_ERROR); }
}
