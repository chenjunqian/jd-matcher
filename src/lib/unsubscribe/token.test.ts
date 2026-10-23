import { describe, it, expect } from "vitest";
import { signUnsubToken, verifyUnsubToken, buildUnsubscribeUrl } from "./token";

const SECRET = "test-secret";
const OTHER_SECRET = "other-secret";

function tamperSignature(token: string): string {
  const [body, sig] = token.split(".");
  const chars = sig.split("");
  chars[0] = chars[0] === "A" ? "B" : "A";
  return `${body}.${chars.join("")}`;
}

describe("signUnsubToken / verifyUnsubToken", () => {
  it("round-trips user and channel", async () => {
    const token = await signUnsubToken(SECRET, "user-1", "email");
    const payload = await verifyUnsubToken(SECRET, token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe("user-1");
    expect(payload!.channel).toBe("email");
    expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("defaults to the 'all' channel", async () => {
    const token = await signUnsubToken(SECRET, "user-1");
    expect((await verifyUnsubToken(SECRET, token))!.channel).toBe("all");
  });

  it("rejects a tampered signature", async () => {
    const token = await signUnsubToken(SECRET, "user-1", "email");
    expect(await verifyUnsubToken(SECRET, tamperSignature(token))).toBeNull();
  });

  it("rejects a swapped payload (cannot unsubscribe another user)", async () => {
    const token = await signUnsubToken(SECRET, "user-1", "email");
    const [, sig] = token.split(".");
    const forgedBody = btoa("u=user-2&c=all&e=99999999999")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifyUnsubToken(SECRET, `${forgedBody}.${sig}`)).toBeNull();
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signUnsubToken(OTHER_SECRET, "user-1", "email");
    expect(await verifyUnsubToken(SECRET, token)).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const token = await signUnsubToken(SECRET, "user-1", "email", -10);
    expect(await verifyUnsubToken(SECRET, token)).toBeNull();
  });

  it("rejects malformed input", async () => {
    expect(await verifyUnsubToken(SECRET, "")).toBeNull();
    expect(await verifyUnsubToken(SECRET, "not-a-token")).toBeNull();
    expect(await verifyUnsubToken(SECRET, "a.b.c")).toBeNull();
    expect(await verifyUnsubToken(SECRET, "!!!.???")).toBeNull();
  });

  it("rejects a valid signature over an unknown channel", async () => {
    // Sign the raw body ourselves so only the channel check can reject it.
    const body = "u=user-1&c=sms&e=99999999999";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
    );
    const b64 = (bytes: Uint8Array) =>
      btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const token = `${b64(new TextEncoder().encode(body))}.${b64(sig)}`;

    expect(await verifyUnsubToken(SECRET, token)).toBeNull();
  });
});

describe("buildUnsubscribeUrl", () => {
  it("builds an absolute https URL with a verifiable token", async () => {
    const url = await buildUnsubscribeUrl("https://jdmatcher.example.com/", SECRET, "user-1", "email");
    expect(url.startsWith("https://jdmatcher.example.com/unsubscribe?token=")).toBe(true);

    const token = new URL(url).searchParams.get("token")!;
    const payload = await verifyUnsubToken(SECRET, token);
    expect(payload).toEqual({ userId: "user-1", channel: "email", exp: expect.any(Number) });
  });
});
