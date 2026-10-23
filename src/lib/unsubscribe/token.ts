/**
 * Stateless, HMAC-signed unsubscribe tokens.
 *
 * Token format: `<base64url(payload)>.<base64url(hmac-sha256(payload))>`
 * Payload:      `u=<userId>&c=<channel>&e=<expEpochSeconds>`
 *
 * Why a signature and not a DB row: links live inside old emails for years, so a
 * table would grow without bound and need cleanup. A signature makes the token
 * unforgeable (nobody can unsubscribe another account) and verification O(1).
 */

export type UnsubChannel = "email" | "telegram" | "all";

export interface UnsubPayload {
  userId: string;
  channel: UnsubChannel;
  /** expiry as unix seconds */
  exp: number;
}

const CHANNELS: UnsubChannel[] = ["email", "telegram", "all"];
/** 3 years — old emails stay actionable. */
export const DEFAULT_TTL_SECONDS = 3 * 365 * 24 * 60 * 60;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function sigInput(p: UnsubPayload): string {
  return `u=${p.userId}&c=${p.channel}&e=${p.exp}`;
}

export async function signUnsubToken(
  secret: string,
  userId: string,
  channel: UnsubChannel = "all",
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const payload: UnsubPayload = {
    userId,
    channel,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = sigInput(payload);
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${b64url(enc.encode(body))}.${b64url(new Uint8Array(sig))}`;
}

/**
 * Returns the payload for a valid, unexpired token, otherwise `null`.
 * Signature comparison happens inside WebCrypto and is constant-time.
 */
export async function verifyUnsubToken(secret: string, token: string): Promise<UnsubPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [bodyB64, sigB64] = parts;

  const bodyBytes = unb64url(bodyB64);
  const sigBytes = sigB64 ? unb64url(sigB64) : null;
  if (!bodyBytes || !sigBytes) return null;

  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), sigBytes, bodyBytes);
  if (!ok) return null;

  const params = new URLSearchParams(dec.decode(bodyBytes));
  const userId = params.get("u") ?? "";
  const channel = (params.get("c") ?? "all") as UnsubChannel;
  const exp = Number(params.get("e") ?? 0);

  if (!userId || !CHANNELS.includes(channel)) return null;
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;

  return { userId, channel, exp };
}

/** Build the absolute unsubscribe URL embedded in notification emails. */
export async function buildUnsubscribeUrl(
  appUrl: string,
  secret: string,
  userId: string,
  channel: UnsubChannel = "email",
): Promise<string> {
  const token = await signUnsubToken(secret, userId, channel);
  return `${appUrl.replace(/\/+$/, "")}/unsubscribe?token=${encodeURIComponent(token)}`;
}
