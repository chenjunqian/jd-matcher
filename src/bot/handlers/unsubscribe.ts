import type { BotContext } from "../bot.js";
import type { NotifyChannel } from "../../lib/db/user_info.js";
import { getUserInfoByTelegramId, setNotifyOptOut, clearEmailOptOut } from "../../lib/db/user_info.js";
import * as C from "../constants.js";

type Action = "on" | "off";

function settingsText(user: {
  email?: string;
  telegramId?: string;
  emailOptOut?: boolean;
  telegramOptOut?: boolean;
}): string {
  const emailState = !user.email
    ? "not set (use /email)"
    : user.emailOptOut
      ? `OFF — ${user.email}`
      : `ON — ${user.email}`;
  const tgState = user.telegramOptOut ? "OFF" : "ON";
  return `Current settings:\nEmail notifications: ${emailState}\nTelegram notifications: ${tgState}`;
}

export async function unsubscribeCommandHandler(ctx: BotContext) {
  try {
    const user = await getUserInfoByTelegramId(ctx.env.DB, String(ctx.from!.id));
    if (!user) return void (await ctx.reply(C.EMAIL_LOGIN_HINT));

    await ctx.reply(`${settingsText(user)}\n\n${C.UNSUB_CHOOSE_HINT}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔕 Stop email notifications", callback_data: "unsub:on:email" }],
          [{ text: "🔕 Stop Telegram notifications", callback_data: "unsub:on:telegram" }],
          [{ text: "🔕 Stop all notifications", callback_data: "unsub:on:all" }],
          [{ text: "🔔 Resume all notifications", callback_data: "unsub:off:all" }],
        ],
      },
    });
  } catch (err) {
    console.error("unsubscribe command:", err);
    await ctx.reply(C.COMMON_ERROR);
  }
}

export async function unsubscribeCallbackHandler(ctx: BotContext) {
  const data = ctx.callbackQuery?.data ?? "";
  const [, action, channel] = data.split(":") as [string, Action | undefined, NotifyChannel | undefined];
  if ((action !== "on" && action !== "off") || !channel) {
    return void (await ctx.answerCallbackQuery({ text: C.COMMON_ERROR }));
  }

  try {
    const user = await getUserInfoByTelegramId(ctx.env.DB, String(ctx.from!.id));
    if (!user) return void (await ctx.answerCallbackQuery({ text: C.EMAIL_LOGIN_HINT }));

    const optOut = action === "on";
    await setNotifyOptOut(ctx.env.DB, user.id, channel, optOut);
    // Resuming: the address is unchanged and was verified before, so the flag is
    // enough — no second verification round trip.
    if (!optOut) await clearEmailOptOut(ctx.env.DB, user.id);

    await ctx.answerCallbackQuery({ text: optOut ? "Unsubscribed" : "Resumed" });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});

    if (optOut) {
      const what = channel === "all" ? "any job notifications" : `${channel} job notifications`;
      await ctx.reply(C.UNSUB_DONE.replace("%s", what));
    } else {
      await ctx.reply(C.UNSUB_RESUMED);
    }
  } catch (err) {
    console.error("unsubscribe callback:", err);
    await ctx.answerCallbackQuery({ text: C.COMMON_ERROR }).catch(() => {});
  }
}
