import { createHash, randomBytes } from "node:crypto";

/**
 * per-visitor rate limit held in memory only. the visitor key is a hash of the
 * network address with a random salt that exists only in this process, so the
 * address itself is never kept and the key cannot be reversed or linked across
 * restarts. nothing here is written anywhere.
 */
const SALT = randomBytes(32);
const hits = new Map<string, number[]>();

export function visitorKey(address: string | null | undefined): string {
  return createHash("sha256").update(SALT).update(address ?? "unknown").digest("base64url").slice(0, 22);
}

export function allow(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfter: number } {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - recent[0]!)) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 20_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return { ok: true, retryAfter: 0 };
}
