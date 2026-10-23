# 退订（Unsubscribe）实现方案

> **状态：已实现**（`migrations/004_notification_opt_out.sql`、`src/routes/unsubscribe.ts`、
> `src/lib/unsubscribe/token.ts`、`src/bot/handlers/unsubscribe.ts`）。
> 落地时的一处差异：路由抽成了独立的 `src/routes/unsubscribe.ts`（而不是塞进 `index.ts`），
> 以便用 `app.request()` 直接做单元测试；`index.ts` 里通过 `app.route("/", unsubscribeRoutes)` 挂载。

目标：让用户可以「按渠道」停止接收通知（邮件 / Telegram），并且随时可以恢复；
同时满足 Gmail / Yahoo 对群发邮件的 **RFC 8058 一键退订** 要求。

设计原则：

1. **不删数据**：退订只翻转偏好位，`user_info` / `user_matched_job` 全部保留，`/jobs` 依然可用。
2. **匹配照旧**：退订是「不发通知」，不是「不找工作」。只要用户还在用 bot，`match` 继续跑。
3. **两个渠道分开控制**：`email` 与 `telegram` 各一个开关，互不影响。
4. **无状态 token**：退订链接用 HMAC 签名，不新增 token 表、不写 KV，链接永远幂等。
5. **GET 不产生副作用**：邮件安全扫描器会预取正文里的链接，所以 GET 只渲染确认页，真正执行必须 POST。

---

## 1. 数据模型（`migrations/004_notification_opt_out.sql`）

```sql
ALTER TABLE user_info ADD COLUMN email_opt_out INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_info ADD COLUMN telegram_opt_out INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_info ADD COLUMN opt_out_time TEXT;   -- 最近一次退订时间（审计）
```

> 为什么不用单独表：偏好是 1:1 的用户属性，放在 `user_info` 上可以让
> `getUserInfoList()` 一次查询就拿到，`notify.ts` 无需额外 round-trip。
> 只有将来要做「退订历史 / 多地址 suppression list」时才升级成独立表。

`UserInfo` 类型同步加字段（`src/lib/types.ts`），`mapRow()` 里补映射：

```ts
emailOptOut: (row.email_opt_out as number) === 1,
telegramOptOut: (row.telegram_opt_out as number) === 1,
```

`src/lib/db/user_info.ts` 新增：

```ts
export type NotifyChannel = "email" | "telegram" | "all";

export async function setNotifyOptOut(
  db: D1Database, userId: string, channel: NotifyChannel, optOut: boolean,
): Promise<void> {
  const now = new Date().toISOString();
  const setEmail    = channel === "email" || channel === "all";
  const setTelegram = channel === "telegram" || channel === "all";
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (setEmail)    { sets.push("email_opt_out = ?");    binds.push(optOut ? 1 : 0); }
  if (setTelegram) { sets.push("telegram_opt_out = ?"); binds.push(optOut ? 1 : 0); }
  if (optOut)      { sets.push("opt_out_time = ?");     binds.push(now); }
  await db.prepare(`UPDATE user_info SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds, userId).run();
}

/** 重新验证邮箱 = 用户重新给出明确同意，清掉 email 退订标记 */
export async function clearEmailOptOut(db: D1Database, userId: string): Promise<void> {
  await db.prepare("UPDATE user_info SET email_opt_out = 0 WHERE id = ?").bind(userId).run();
}
```

---

## 2. 签名 token（`src/lib/unsubscribe/token.ts`，新文件）

选 HMAC 而不是数据库 token 的理由：邮件里的链接要活好几年，存表要占行 + 要清理；
HMAC 只依赖一个 secret，验签 O(1)，且天然防篡改（无法拿 token 退订别人的账号）。

```ts
const enc = new TextEncoder();

export type UnsubChannel = "email" | "telegram" | "all";
export interface UnsubPayload { userId: string; channel: UnsubChannel; exp: number }

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function sigInput(p: UnsubPayload): string {
  return `u=${p.userId}&c=${p.channel}&e=${p.exp}`;
}

/** 默认 3 年，覆盖老邮件里的链接 */
export async function signUnsubToken(
  secret: string, userId: string, channel: UnsubChannel = "all", ttlSeconds = 3 * 365 * 86400,
): Promise<string> {
  const p: UnsubPayload = { userId, channel, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(sigInput(p)));
  return `${b64url(enc.encode(sigInput(p)))}.${b64url(new Uint8Array(sig))}`;
}

export async function verifyUnsubToken(secret: string, token: string): Promise<UnsubPayload | null> {
  const [bodyB64, sigB64] = token.split(".");
  if (!bodyB64 || !sigB64) return null;
  let body: string;
  try {
    body = new TextDecoder().decode(
      Uint8Array.from(atob(bodyB64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
    );
  } catch { return null; }

  const params = new URLSearchParams(body);
  const p: UnsubPayload = {
    userId: params.get("u") ?? "",
    channel: (params.get("c") ?? "all") as UnsubChannel,
    exp: Number(params.get("e") ?? 0),
  };
  if (!p.userId || !["email", "telegram", "all"].includes(p.channel)) return null;

  const ok = await crypto.subtle.verify(   // 常量时间比较
    "HMAC", await key(secret), Uint8Array.from(
      atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0),
    ), enc.encode(body),
  );
  if (!ok) return null;
  if (p.exp < Math.floor(Date.now() / 1000)) return null;
  return p;
}
```

Secret：`npx wrangler secret put UNSUBSCRIBE_SECRET`（`Env` 加 `UNSUBSCRIBE_SECRET: string`）。
不要复用 `TELEGRAM_BOT_TOKEN`（telegram token 泄露会连带伪造退订链接）。
secret 轮换策略：`UNSUBSCRIBE_SECRET`（当前）+ `UNSUBSCRIBE_SECRET_OLD`（可选，验签时兜底），
轮换后老邮件里的链接仍能退订。

---

## 3. HTTP 路由（`src/index.ts`）

```ts
import { signUnsubToken, verifyUnsubToken } from "./lib/unsubscribe/token.js";
import { setNotifyOptOut } from "./lib/db/user_info.js";

const CHANNEL_LABEL: Record<string, string> = {
  email: "job-notification emails",
  telegram: "Telegram job notifications",
  all: "all job notifications (email + Telegram)",
};

// GET：只渲染确认页，不做修改（防邮件扫描器 / 防误点）
app.get("/unsubscribe", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.text("Missing token", 400);

  const payload = await verifyUnsubToken(c.env.UNSUBSCRIBE_SECRET, token);
  if (!payload) return c.html(errorPage("Invalid or expired unsubscribe link."), 400);

  const user = await getUserInfoById(c.env.DB, payload.userId);
  if (!user) return c.text("User not found.", 404);

  const already =
    payload.channel === "all"    ? user.emailOptOut && user.telegramOptOut :
    payload.channel === "email"  ? user.emailOptOut : user.telegramOptOut;

  if (already) return c.html(infoPage("You are already unsubscribed from " + CHANNEL_LABEL[payload.channel] + "."));

  return c.html(`
    <form method="POST" action="/unsubscribe?token=${encodeURIComponent(token)}">
      <h1>Unsubscribe</h1>
      <p>Stop ${CHANNEL_LABEL[payload.channel]} for this account?</p>
      <p style="color:#666;font-size:13px">Your resume, matches and /jobs in Telegram remain available.</p>
      <button type="submit">Yes, unsubscribe</button>
    </form>`);
});

// POST：真正执行。同时服务两种调用者：
//  a) 确认页表单提交   b) Gmail/Yahoo 的 RFC 8058 一键退订（body = List-Unsubscribe=One-Click）
app.post("/unsubscribe", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.text("Missing token", 400);

  const payload = await verifyUnsubToken(c.env.UNSUBSCRIBE_SECRET, token);
  if (!payload) return c.text("Invalid or expired unsubscribe link.", 400);

  const user = await getUserInfoById(c.env.DB, payload.userId);
  if (!user) return c.text("User not found.", 404);

  await setNotifyOptOut(c.env.DB, payload.userId, payload.channel, true);
  console.log(`[unsubscribe] user=${payload.userId} channel=${payload.channel}`);
  // RFC 8058 要求返回 2xx，body 会被丢弃
  return c.text("You have been unsubscribed.", 200);
});
```

要点：

| 点 | 说明 |
| --- | --- |
| GET 幂等且无副作用 | Gmail 的 "Report spam"、Outlook Safe Links、安全网关都会 GET 邮件正文链接；若 GET 直接退订会造成误退订 |
| POST 无鉴权 | RFC 8058 明确要求一键退订不能要求登录；安全性由签名 token 保证 |
| 幂等 | 重复 POST 结果一致；已退订再点无副作用 |
| 到期处理 | token 过期 → 提示「请在 Telegram 里用 /unsubscribe」 |

---

## 4. 邮件侧（`src/lib/email/template.ts` + `src/jobs/notify.ts`）

### 4.1 页脚链接

`buildJobNotificationHtml/Text(jobs, unsubUrl)` 扩一个参数，页脚变成：

```html
<hr style="margin-top:24px">
<p style="color:#999;font-size:11px">
  This is an automated message from JD Matcher. Please do not reply to this email.<br>
  <a href="{unsubUrl}" style="color:#999">Unsubscribe from these emails</a>
</p>
```

（验证邮件 `buildVerificationEmailHtml` 属于**事务性邮件**，不加退订链接。）

### 4.2 邮件头（Cloudflare Email Service 白名单已确认支持）

```ts
const unsubUrl = `${env.APP_URL}/unsubscribe?token=${await signUnsubToken(env.UNSUBSCRIBE_SECRET, userId, "email")}`;

await env.EMAIL.send({
  to: email,
  from: { email: "jdmatcher@guoshaotech.com", name: "JD Matcher" },
  subject: "New Job Matches for You",
  html: buildJobNotificationHtml(jobs, unsubUrl),
  text: buildJobNotificationText(jobs, unsubUrl),
  headers: {
    "List-Unsubscribe": `<${unsubUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    "Auto-Submitted": "auto-generated",
  },
});
```

- `List-Unsubscribe` 必须是 `<https://…>` 形式，`http://` 会被 Cloudflare 拒绝（`E_HEADER_VALUE_INVALID`）。
- `List-Unsubscribe-Post` 必须是字面量 `List-Unsubscribe=One-Click`（大小写敏感）。
- 有了这两个头，Gmail 客户端会显示原生「取消订阅」按钮，且不会被判为垃圾邮件降权。

### 4.3 发送前过滤

`handleNotify()` 里改为：

```ts
const canTelegram = !!u.telegramId  && !u.telegramOptOut;
const canEmail    = !!u.email       && !u.emailOptOut;

if (!canTelegram && !canEmail) {
  // 全渠道退订：直接把待发记录标记为已处理，避免每 3 小时重复查库
  await updateMatchJobsNotifiedByIds(env.DB, u.id, fetched.map((j) => j.id));
  continue;
}
if (canTelegram) await sendJobsInChunks(env, u.telegramId!, jobs, u.id);
if (canEmail)    await sendEmailNotification(env, u.email!, jobs, u.id, unsubUrl);
```

### 4.4 顺手处理 Telegram 拉黑

用户在 Telegram 里「Block bot」也是退订。现在 `sendJobsInChunks` 遇到非 "message is too long" 的错误直接 throw → 队列重试 3 次后丢弃，每轮都白跑。

```ts
if (resp.description?.includes("bot was blocked by the user") ||
    resp.description?.includes("user is deactivated") ||
    resp.description?.includes("chat not found")) {
  await setNotifyOptOut(env.DB, userId, "telegram", true);
  console.log(`[notify] user ${userId} blocked the bot → telegram opt-out`);
  return;                      // 不再抛错重试
}
```

---

## 5. Telegram 侧（`/unsubscribe`）

新文件 `src/bot/handlers/unsubscribe.ts`，注册到 `handlers/index.ts` + `bot.ts`：

```ts
export async function unsubscribeCommandHandler(ctx: BotContext) {
  const user = await getUserInfoByTelegramId(ctx.env.DB, String(ctx.from!.id));
  if (!user) return void await ctx.reply(C.EMAIL_LOGIN_HINT);

  const state = [
    `Email notifications: ${user.emailOptOut ? "OFF" : user.email ? "ON" : "no email set"}`,
    `Telegram notifications: ${user.telegramOptOut ? "OFF" : "ON"}`,
  ].join("\n");

  await ctx.reply(`Current settings:\n${state}\n\nChoose what to change:`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Stop email notifications", callback_data: "unsub:on:email" }],
        [{ text: "Stop Telegram notifications", callback_data: "unsub:on:telegram" }],
        [{ text: "Stop all notifications", callback_data: "unsub:on:all" }],
        [{ text: "Resume all notifications", callback_data: "unsub:off:all" }],
      ],
    },
  });
}

export async function unsubscribeCallbackHandler(ctx: BotContext) {
  const [, action, channel] = (ctx.callbackQuery?.data ?? "").split(":") as [string, "on" | "off", NotifyChannel];
  const user = await getUserInfoByTelegramId(ctx.env.DB, String(ctx.from!.id));
  if (!user) return void await ctx.answerCallbackQuery({ text: "Please /start first" });

  await setNotifyOptOut(ctx.env.DB, user.id, channel, action === "on");
  await ctx.answerCallbackQuery({ text: "Updated" });
  await ctx.editMessageReplyMarkup({ reply_markup: undefined });

  // 恢复邮件通知时，若被标为退订则清标记（地址仍然有效、仍然 verified）
  if (action === "off") await clearEmailOptOut(ctx.env.DB, user.id);

  await ctx.reply(action === "on"
    ? `Done. You will no longer receive ${channel === "all" ? "any job notifications" : channel + " notifications"}.\nYou can still use /jobs to browse matches, and /unsubscribe to resume.`
    : "Done. Notifications resumed.");
}
```

`src/bot/constants.ts` 增加 `UNSUB_*` 文案；`bot.ts` 增加：

```ts
bot.command("unsubscribe", unsubscribeCommandHandler);
bot.callbackQuery(/^unsub:/, unsubscribeCallbackHandler);
```

要点：

- **恢复邮件**走「清标记」而不是重新验证：地址没变、当初已 verify，不需要再来一遍；
  若用户走 `/email` 换地址，则在 `/verify-email` 成功后调 `clearEmailOptOut()`（重新验证=重新同意）。
- `/help` 文案补一行 `/unsubscribe — 管理通知`。
- `:text` 全局 handler 无需改动（纯按钮交互）。

---

## 6. 改动清单

| 文件 | 改动 |
| --- | --- |
| `migrations/004_notification_opt_out.sql` | 新增 3 个列 |
| `src/lib/types.ts` | `UserInfo` 加 `emailOptOut` / `telegramOptOut` / `optOutTime`；`Env` 加 `UNSUBSCRIBE_SECRET` |
| `src/lib/db/user_info.ts` | `mapRow` 映射新列；新增 `NotifyChannel` / `setNotifyOptOut` / `clearEmailOptOut` |
| `src/lib/unsubscribe/token.ts` | **新**：HMAC 签发/验签 + `buildUnsubscribeUrl` |
| `src/routes/unsubscribe.ts` | **新**：`GET/POST /unsubscribe`（确认页 + 一键退订） |
| `src/index.ts` | 挂载 `unsubscribeRoutes`；`/verify-email` 成功后 `clearEmailOptOut` |
| `src/lib/email/template.ts` | 通知模板加退订页脚参数 |
| `src/jobs/notify.ts` | 渠道过滤、`List-Unsubscribe` 头、全渠道退订快进、Telegram 拉黑自动退订 |
| `src/bot/handlers/unsubscribe.ts` | **新**：命令 + 回调 |
| `src/bot/handlers/index.ts`, `src/bot/bot.ts`, `src/bot/constants.ts`, `src/bot/handlers/email.ts` | 注册、文案、`/email` 退订提示 |
| `AGENTS.md` | 目录结构 / 流程 / 命令 / 部署步骤 |
| `docs/unsubscribe-plan.md` | 本文件 |

---

## 7. 测试计划

`src/lib/unsubscribe/token.test.ts`
- 正常签发 → 验签通过，字段一致
- 篡改 userId / channel / exp → null
- 改签名一字节 → null（常量时间比较路径）
- 过期 → null
- 换 secret 验签 → null

`src/index.test.ts`（新增，用 `app.request`）
- `GET /unsubscribe?token=` 合法 → 200 且回显表单，DB 未变
- `POST` 先 GET 无副作用 → opt_out=1
- `POST` 带 body `List-Unsubscribe=One-Click` → 200（RFC 8058 语义）
- token 非法 / 过期 / 缺参 → 400
- 重复 POST → 仍 200，幂等
- 用户不存在 → 404

`src/jobs/notify.test.ts` 补充
- `emailOptOut=1` → `env.EMAIL.send` 未被调用，但 job 被标记 notified
- `telegramOptOut=1` → sendMessage 未被调用
- 两渠道都退订 → 不发，且标记 notified（防死循环）
- 邮件 payload 含 `List-Unsubscribe` / `List-Unsubscribe-Post` 头

`src/bot/...` 可选：命令输出内容包含当前开关状态

---

## 8. 上线步骤

```bash
# 1. 本地迁移 + 类型检查 + 测试
npx wrangler d1 execute jd-matcher-db --local --file migrations/004_notification_opt_out.sql
npm run typecheck && npx vitest run

# 2. 生产迁移（先迁移再发代码，代码对新列容错）
npx wrangler d1 execute jd-matcher-db --remote --file migrations/004_notification_opt_out.sql

# 3. 设置 secret
npx wrangler secret put UNSUBSCRIBE_SECRET

# 4. 部署
npx wrangler deploy
```

验证：

1. `/unsubscribe` 在 Telegram 里出现按钮，点「Stop all」后手动触发一次 notify，确认不再收到通知；
2. 收一封通知邮件 → Gmail「显示原始邮件」看到 `List-Unsubscribe` + `List-Unsubscribe-Post`；
3. 页脚链接 GET 只出确认页；点击确认后 → 200；再次打开链接 → "already unsubscribed"；
4. 模拟 Gmail 一键退订：
   ```bash
   curl -i -X POST "https://jdmatcher.guoshaotech.com/unsubscribe?token=<token>" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     --data "List-Unsubscribe=One-Click"
   ```
   期望 `200`，D1 里 `email_opt_out=1`；
5. 检查 Cloudflare 邮件发送返回 `E_HEADER_*` 错误（应为 0 次）。

---

## 9. 可选的后续增强

- **退订原因**（选填单选：太多邮件 / 不相关 / 已找到工作）：确认页加 radio，落库到 `unsubscribe_reason`，用于改善匹配质量。
- **临时暂停**：`snooze_until` 字段，`/unsubscribe` 里给「暂停 30 天」选项。
- **独立 suppression list**：如果以后接入其它发送通道（短信 / 第三方 ESP），把退订地址写入 `email_suppression(email PRIMARY KEY, reason, created_at)`，发送前统一查一次。
- **最后活跃时间**：`last_active_at`，对「全渠道退订且 90 天没交互」的用户跳过 `match`，省 LLM 成本（当前是所有人都跑 agent）。
- **合规留痕**：`opt_out_time` 已记；如需审计历史，再加 `notification_event(user_id, channel, action, at, ip_country)` 表。
