import type { BotContext } from "../bot.js";
import { isUserHasUploadResume, updateUserResume, getUserInfoByTelegramId, createUserInfoIfNotExist } from "../../lib/db/user_info.js";
import { embedText } from "../../lib/llm/embedding.js";
import { upsertVectors } from "../../lib/vectorize/index.js";
import { updateSession, clearSession } from "../session.js";
import * as C from "../constants.js";

export async function uploadResumeCommandHandler(ctx: BotContext) {
  const { env } = ctx;
  const tid = String(ctx.from!.id);
  try {
    if (await isUserHasUploadResume(env.DB, tid)) {
      await updateSession(env.SESSION_KV, ctx.chat!.id, { awaitingUpload: true, lastBotMessage: C.RESUME_EXIST });
      await ctx.reply(C.RESUME_EXIST);
    } else {
      await updateSession(env.SESSION_KV, ctx.chat!.id, { awaitingUpload: true, lastBotMessage: C.RESUME_HINT });
      await ctx.reply(C.RESUME_HINT);
    }
  } catch { await ctx.reply(C.COMMON_ERROR); }
}

export async function uploadResumeFileHandler(ctx: BotContext) {
  const { env } = ctx;
  const chatId = ctx.chat!.id;
  const tid = String(ctx.from!.id);
  const doc = ctx.message?.document;
  if (!doc) return;

  if (!doc.mime_type?.startsWith("text/")) return void await ctx.reply(C.RESUME_TYPE_ERR);

  try {
    const file = await ctx.getFile();
    if (!file.file_path) return void await ctx.reply(C.COMMON_ERROR);

    const resp = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
    if (!resp.ok) return void await ctx.reply(C.COMMON_ERROR);
    const text = await resp.text();
    if (!text) return void await ctx.reply(C.COMMON_ERROR);

    const [vector] = await embedText(env, [text]);
    if (!vector) return void await ctx.reply(C.COMMON_ERROR);

    let user = await getUserInfoByTelegramId(env.DB, tid);
    const uid = user?.id ?? crypto.randomUUID();

    if (!user) {
      const name = `${ctx.from!.last_name ?? ""} ${ctx.from!.first_name ?? ""}`.trim();
      await createUserInfoIfNotExist(env.DB, { id: uid, telegramId: tid, name, resume: text });
    }

    await upsertVectors(env.RESUME_EMBEDDINGS, [{ id: uid, values: vector }]);
    await updateUserResume(env.DB, tid, text, uid);
    await clearSession(env.SESSION_KV, chatId);
    await ctx.reply(C.RESUME_SUCCESS);
  } catch (err) {
    console.error("upload_resume:", err);
    await ctx.reply(C.COMMON_ERROR);
  }
}
