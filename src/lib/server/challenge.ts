import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * stateless proof-of-work challenges. the server signs (salt, expiry, bits,
 * post) with a secret, so it needs no storage to recognise its own challenges.
 * a used salt is remembered in memory until it expires, which stops simple
 * replays on the same instance. the expiry bounds replays across instances.
 */

export const POW_BITS = 18;          // ≈ 262k hashes on average: ~0.3–1.5 s on a phone
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export interface ChallengePayload { s: string; e: number; b: number; p: string }

export function issueChallenge(secret: string, post: string, now = Date.now(), bits = POW_BITS) {
  const payload: ChallengePayload = { s: randomBytes(12).toString("base64url"), e: now + CHALLENGE_TTL_MS, b: bits, p: post };
  const body = b64url(JSON.stringify(payload));
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return { challenge: `${body}.${mac}`, bits, expires: payload.e };
}

const used = new Map<string, number>();
function remember(salt: string, exp: number, now: number) {
  if (used.size > 50_000) for (const [k, e] of used) if (e < now) used.delete(k);
  used.set(salt, exp);
}

export type ChallengeResult = { ok: true; payload: ChallengePayload } | { ok: false; reason: string };

export function verifyChallenge(secret: string, challenge: string, nonce: string, post: string, now = Date.now()): ChallengeResult {
  if (typeof challenge !== "string" || typeof nonce !== "string" || nonce.length > 16 || !/^[0-9a-z]+$/.test(nonce)) {
    return { ok: false, reason: "malformed" };
  }
  const [body, mac, extra] = challenge.split(".");
  if (!body || !mac || extra !== undefined) return { ok: false, reason: "malformed" };
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "signature" };

  let payload: ChallengePayload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return { ok: false, reason: "malformed" }; }
  if (payload.p !== post) return { ok: false, reason: "post" };
  if (payload.e < now) return { ok: false, reason: "expired" };
  if (used.has(payload.s)) return { ok: false, reason: "replay" };

  const digest = createHash("sha256").update(`${challenge}:${nonce}`).digest();
  if (leadingZeroBitsBuf(digest) < payload.b) return { ok: false, reason: "work" };
  remember(payload.s, payload.e, now);
  return { ok: true, payload };
}

export function leadingZeroBitsBuf(d: Uint8Array): number {
  let n = 0;
  for (const byte of d) {
    if (byte === 0) { n += 8; continue; }
    return n + Math.clz32(byte) - 24;
  }
  return n;
}
