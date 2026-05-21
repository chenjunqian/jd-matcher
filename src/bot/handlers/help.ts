import type { BotContext } from "../bot.js";
import { HELP_REPLY } from "../constants.js";

export async function helpCommandHandler(ctx: BotContext) {
  await ctx.reply(HELP_REPLY);
}
