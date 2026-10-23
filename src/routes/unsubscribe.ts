import { Hono } from "hono";
import type { Env, UserInfo } from "../lib/types.js";
import { verifyUnsubToken, type UnsubChannel } from "../lib/unsubscribe/token.js";
import { getUserInfoById, setNotifyOptOut } from "../lib/db/user_info.js";

const CHANNEL_LABEL: Record<UnsubChannel, string> = {
  email: "job notification emails",
  telegram: "Telegram job notifications",
  all: "job notifications (email + Telegram)",
};

function page(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — JD Matcher</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5">
<div style="max-width:520px;padding:32px;background:white;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);color:#222;line-height:1.55">
${body}
</div></body></html>`;
}

function errorPage(title: string, message: string): string {
  return page(title, `<h1 style="margin-top:0;font-size:22px">${title}</h1><p style="color:#444">${message}</p>`);
}

function isOptedOut(user: UserInfo, channel: UnsubChannel): boolean {
  if (channel === "email") return user.emailOptOut === true;
  if (channel === "telegram") return user.telegramOptOut === true;
  return user.emailOptOut === true && user.telegramOptOut === true;
}

export const unsubscribeRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET only renders a confirmation form and never mutates state: mail scanners
 * (Outlook Safe Links, security gateways, Gmail prefetch) follow links in the
 * message body and would otherwise silently unsubscribe every recipient.
 */
unsubscribeRoutes.get("/unsubscribe", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.text("Missing token", 400);

  const payload = await verifyUnsubToken(c.env.UNSUBSCRIBE_SECRET, token);
  if (!payload) {
    return c.html(
      errorPage(
        "Unsubscribe link not valid",
        "This link is invalid or has expired. You can manage notifications any time in Telegram with /unsubscribe.",
      ),
      400,
    );
  }

  const user = await getUserInfoById(c.env.DB, payload.userId);
  if (!user) {
    return c.html(
      errorPage("Account not found", "This account no longer exists, so there is nothing to unsubscribe from."),
      404,
    );
  }

  const label = CHANNEL_LABEL[payload.channel];
  if (isOptedOut(user, payload.channel)) {
    return c.html(
      page(
        "Already unsubscribed",
        `<h1 style="margin-top:0;font-size:22px">Already unsubscribed</h1>
<p style="color:#444">You are already unsubscribed from ${label}.</p>
<p style="color:#666;font-size:13px">Changed your mind? Send /unsubscribe to the bot in Telegram to resume notifications.</p>`,
      ),
    );
  }

  return c.html(
    page(
      "Unsubscribe",
      `<h1 style="margin-top:0;font-size:22px">Unsubscribe</h1>
<p style="color:#444">Stop ${label} for this account?</p>
<form method="POST" action="/unsubscribe?token=${encodeURIComponent(token)}" style="margin-top:20px">
<button type="submit" style="background:#dc2626;color:white;border:0;border-radius:8px;padding:12px 20px;font-size:15px;cursor:pointer">Yes, unsubscribe</button>
</form>
<p style="color:#666;font-size:13px;margin-top:24px">Your resume, saved matches and /jobs in Telegram remain available — this only stops notifications.</p>`,
    ),
  );
});

/**
 * POST performs the opt-out. It serves two callers:
 *  1. the confirmation form above;
 *  2. Gmail/Yahoo one-click unsubscribe (RFC 8058), which posts
 *     `List-Unsubscribe=One-Click` and expects a 2xx with no user interaction.
 */
unsubscribeRoutes.post("/unsubscribe", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.text("Missing token", 400);

  const payload = await verifyUnsubToken(c.env.UNSUBSCRIBE_SECRET, token);
  if (!payload) {
    return c.text(
      "Invalid or expired unsubscribe link. You can manage notifications in Telegram with /unsubscribe.",
      400,
    );
  }

  const user = await getUserInfoById(c.env.DB, payload.userId);
  if (!user) return c.text("User not found.", 404);

  const oneClick = (await c.req.text()).includes("List-Unsubscribe=One-Click");

  await setNotifyOptOut(c.env.DB, payload.userId, payload.channel, true);
  console.log(`[unsubscribe] user=${payload.userId} channel=${payload.channel} oneClick=${oneClick}`);

  if (oneClick) return c.text("You have been unsubscribed.", 200);

  return c.html(
    page(
      "Unsubscribed",
      `<h1 style="margin-top:0;font-size:22px;color:#16a34a">✓ Unsubscribed</h1>
<p style="color:#444">You will no longer receive ${CHANNEL_LABEL[payload.channel]}.</p>
<p style="color:#666;font-size:13px">Your resume and saved matches are untouched, and /jobs in Telegram still works.
Send /unsubscribe to the bot if you want to resume notifications.</p>`,
    ),
  );
});
