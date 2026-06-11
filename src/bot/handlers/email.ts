import type { BotContext } from "../bot.js";
import { getUserInfoByTelegramId } from "../../lib/db/user_info.js";
import { createEmailVerification } from "../../lib/db/email_verification.js";
import { buildVerificationEmailHtml, buildVerificationEmailText } from "../../lib/email/template.js";
import { updateSession, clearSession } from "../session.js";
import * as C from "../constants.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function emailCommandHandler(ctx: BotContext) {
  const { env } = ctx;
  const tid = String(ctx.from!.id);

  try {
    const user = await getUserInfoByTelegramId(env.DB, tid);
    if (!user) {
      return void await ctx.reply(C.EMAIL_LOGIN_HINT);
    }

    const msg = user.email
      ? C.EMAIL_UPDATE_HINT.replace("%s", user.email).replace("%s", user.email)
      : C.EMAIL_PROMPT;
    await updateSession(env.SESSION_KV, ctx.chat!.id, { awaitingEmail: true, lastBotMessage: msg });
    await ctx.reply(msg);
  } catch (err) {
    console.error("email command:", err);
    await ctx.reply(C.COMMON_ERROR);
  }
}

export async function emailTextHandler(ctx: BotContext) {
  const { env } = ctx;
  const email = ctx.message?.text?.trim();
  if (!email) return;

  if (!EMAIL_RE.test(email)) {
    return void await ctx.reply(C.EMAIL_FORMAT_ERR);
  }

  try {
    const tid = String(ctx.from!.id);
    const user = await getUserInfoByTelegramId(env.DB, tid);
    if (!user) {
      return void await ctx.reply(C.EMAIL_LOGIN_HINT);
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await createEmailVerification(env.DB, crypto.randomUUID(), user.id, email, token, expiresAt);

    const link = `${env.APP_URL}/verify-email?token=${token}`;

    await env.EMAIL.send({
      to: email,
      from: { email: "jdmatcher@guoshaotech.com", name: "JD Matcher" },
      subject: "Verify your email for JD Matcher",
      html: buildVerificationEmailHtml(link),
      text: buildVerificationEmailText(link),
    });

    await clearSession(env.SESSION_KV, ctx.chat!.id);
    await ctx.reply(C.EMAIL_SENT.replace("%s", email));
  } catch (err) {
    console.error("email text:", err);
    await ctx.reply(C.COMMON_ERROR);
  }
}
