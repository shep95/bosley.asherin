import { createHash, webcrypto } from "node:crypto";

/**
 * optional pseudonymous identity. a visitor who wants a stable name makes a
 * signing key in their own browser (it never leaves their device). they sign
 * each comment with it, and everyone sees the same short tag on all of their
 * comments, which proves they wrote them, with no email, password or account.
 */

export function signedMessage(post: string, text: string, name: string | null, challenge: string): string {
  return `bosley-comment-v1\n${post}\n${name ?? ""}\n${challenge}\n${text}`;
}

export function keyTag(jwk: JsonWebKey): string {
  return createHash("sha256").update(`${jwk.x}.${jwk.y}`).digest("hex").slice(0, 8);
}

export async function verifySignature(jwk: unknown, sigB64: unknown, message: string): Promise<string | null> {
  if (!jwk || typeof jwk !== "object" || typeof sigB64 !== "string" || sigB64.length > 200) return null;
  const k = jwk as Record<string, unknown>;
  if (k["kty"] !== "EC" || k["crv"] !== "P-256" || typeof k["x"] !== "string" || typeof k["y"] !== "string" || "d" in k) return null;
  const clean: JsonWebKey = { kty: "EC", crv: "P-256", x: k["x"], y: k["y"], ext: true };
  try {
    const key = await webcrypto.subtle.importKey("jwk", clean, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await webcrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, key, Buffer.from(sigB64, "base64url"), new TextEncoder().encode(message),
    );
    return ok ? keyTag(clean) : null;
  } catch {
    return null;
  }
}
