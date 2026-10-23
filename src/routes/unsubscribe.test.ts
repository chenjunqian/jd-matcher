import { describe, it, expect, beforeEach } from "vitest";
import { unsubscribeRoutes } from "./unsubscribe";
import { signUnsubToken } from "../lib/unsubscribe/token";
import type { Env } from "../lib/types";

const SECRET = "test-unsub-secret";

const BASE_USER = {
  id: "user-1",
  name: "Test",
  email: "u@example.com",
  telegram_id: "chat-1",
  email_opt_out: 0,
  telegram_opt_out: 0,
  opt_out_time: null,
};

function makeDb(user: Record<string, unknown> | null) {
  const written: { sql: string; args: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => ({
          first: async () => (sql.startsWith("SELECT * FROM user_info") ? user : null),
          all: async () => ({ results: [] }),
          run: async () => {
            written.push({ sql, args });
            return { success: true };
          },
        }),
      };
    },
  };
  return { db: db as unknown as D1Database, written };
}

function makeEnv(db: D1Database): Env {
  return {
    DB: db,
    UNSUBSCRIBE_SECRET: SECRET,
    APP_URL: "https://jdmatcher.example.com",
  } as unknown as Env;
}

async function token(channel: "email" | "telegram" | "all" = "email") {
  return signUnsubToken(SECRET, "user-1", channel);
}

async function get(path: string, db: D1Database) {
  return unsubscribeRoutes.request(path, { method: "GET" }, makeEnv(db));
}

async function post(path: string, db: D1Database, body?: string) {
  return unsubscribeRoutes.request(
    path,
    {
      method: "POST",
      headers: body ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
      body,
    },
    makeEnv(db),
  );
}

describe("GET /unsubscribe", () => {
  it("returns 400 without a token", async () => {
    const { db } = makeDb(BASE_USER);
    expect((await get("/unsubscribe", db)).status).toBe(400);
  });

  it("returns 400 for an invalid token", async () => {
    const { db } = makeDb(BASE_USER);
    const resp = await get("/unsubscribe?token=garbage", db);
    expect(resp.status).toBe(400);
    expect(await resp.text()).toContain("not valid");
  });

  it("renders a confirmation form without touching the DB", async () => {
    const { db, written } = makeDb(BASE_USER);
    const resp = await get(`/unsubscribe?token=${encodeURIComponent(await token("email"))}`, db);

    expect(resp.status).toBe(200);
    const html = await resp.text();
    expect(html).toContain('method="POST"');
    expect(html).toContain("job notification emails");
    expect(written).toHaveLength(0);
  });

  it("labels the telegram channel", async () => {
    const { db } = makeDb(BASE_USER);
    const resp = await get(`/unsubscribe?token=${encodeURIComponent(await token("telegram"))}`, db);
    expect(await resp.text()).toContain("Telegram job notifications");
  });

  it("reports an already unsubscribed user", async () => {
    const { db } = makeDb({ ...BASE_USER, email_opt_out: 1 });
    const resp = await get(`/unsubscribe?token=${encodeURIComponent(await token("email"))}`, db);

    expect(resp.status).toBe(200);
    expect(await resp.text()).toContain("Already unsubscribed");
  });

  it("returns 404 when the account is gone", async () => {
    const { db } = makeDb(null);
    const resp = await get(`/unsubscribe?token=${encodeURIComponent(await token("email"))}`, db);
    expect(resp.status).toBe(404);
  });
});

describe("POST /unsubscribe", () => {
  it("sets the email opt-out flag once", async () => {
    const { db, written } = makeDb(BASE_USER);
    const resp = await post(`/unsubscribe?token=${encodeURIComponent(await token("email"))}`, db);

    expect(resp.status).toBe(200);
    expect(await resp.text()).toContain("Unsubscribed");
    expect(written).toHaveLength(1);
    expect(written[0].sql).toContain("email_opt_out = ?");
    expect(written[0].sql).not.toContain("telegram_opt_out");
    expect(written[0].args).toEqual([1, expect.any(String), "user-1"]);
  });

  it("sets both flags for the 'all' channel", async () => {
    const { db, written } = makeDb(BASE_USER);
    await post(`/unsubscribe?token=${encodeURIComponent(await token("all"))}`, db);

    expect(written[0].sql).toContain("email_opt_out = ?");
    expect(written[0].sql).toContain("telegram_opt_out = ?");
  });

  it("honours RFC 8058 one-click posts with a plain 200", async () => {
    const { db, written } = makeDb(BASE_USER);
    const resp = await post(
      `/unsubscribe?token=${encodeURIComponent(await token("email"))}`,
      db,
      "List-Unsubscribe=One-Click",
    );

    expect(resp.status).toBe(200);
    expect(await resp.text()).toBe("You have been unsubscribed.");
    expect(written).toHaveLength(1);
  });

  it("is idempotent", async () => {
    const { db, written } = makeDb(BASE_USER);
    const t = encodeURIComponent(await token("email"));
    expect((await post(`/unsubscribe?token=${t}`, db)).status).toBe(200);
    expect((await post(`/unsubscribe?token=${t}`, db)).status).toBe(200);
    expect(written).toHaveLength(2);
  });

  it("rejects missing / invalid tokens", async () => {
    const { db, written } = makeDb(BASE_USER);
    expect((await post("/unsubscribe", db)).status).toBe(400);
    expect((await post("/unsubscribe?token=nope", db)).status).toBe(400);
    expect(written).toHaveLength(0);
  });

  it("returns 404 for unknown users", async () => {
    const { db, written } = makeDb(null);
    const resp = await post(`/unsubscribe?token=${encodeURIComponent(await token("email"))}`, db);
    expect(resp.status).toBe(404);
    expect(written).toHaveLength(0);
  });
});
