import type { APIRoute } from "astro";
import { createHash, randomBytes } from "node:crypto";
import { verifyChallenge } from "../../lib/server/challenge";
import { isAdmin, postStore, powSecret } from "../../lib/server/env";
import { fail, json, readJson, sameOrigin } from "../../lib/server/http";
import { signedMessage, verifySignature } from "../../lib/server/identity";
import { NEW_POST } from "../../lib/server/posts";
import { allow, visitorKey } from "../../lib/server/ratelimit";
import { ulid } from "../../lib/server/ulid";
import { toPublicPost, type StoredPost } from "../../lib/server/visitor-posts";
import { cleanName, cleanText, cleanTitle, COMMENT_ID, MAX_POST } from "../../lib/validate";

export const prerender = false;

const resting = () => fail(503, "writing is resting for a moment. try again soon.");

/** the newest visitor posts. cached briefly at the edge. */
export const GET: APIRoute = async () => {
  const store = postStore();
  if (!store) return resting();
  try {
    const posts = await store.latest(50);
    return json({ posts: posts.map(toPublicPost) }, 200, { "cache-control": "no-store" });
  } catch {
    return resting();
  }
};

/** publish a visitor post: proof-of-work required, optionally signed by the visitor's own key. */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!sameOrigin(request)) return fail(403, "posts can only be written on bosley.");
  const limit = allow(`post:${visitorKey(clientAddress)}`, 3, 30 * 60 * 1000);
  if (!limit.ok) return fail(429, "that's a lot of writing at once. come back in a little while.", { "retry-after": String(limit.retryAfter) });

  let body: Record<string, unknown>;
  try { body = (await readJson(request, 24 * 1024)) as Record<string, unknown>; } catch { return fail(400, "that didn't arrive whole. try again."); }
  const title = cleanTitle(body?.["title"]);
  if (!title.ok) return fail(422, title.error);
  const text = cleanText(body["text"], MAX_POST, 3);
  if (!text.ok) return fail(422, text.error);
  const name = cleanName(body["name"]);
  if (!name.ok) return fail(422, name.error);

  const secret = powSecret();
  const store = postStore();
  if (!secret || !store) return resting();

  const challenge = String(body["challenge"] ?? "");
  const proof = verifyChallenge(secret, challenge, String(body["nonce"] ?? ""), NEW_POST);
  if (!proof.ok) return fail(proof.reason === "expired" ? 409 : 400, "the page went stale. send it again.");

  let tag: string | null = null, pub: JsonWebKey | null = null, sig: string | null = null;
  if (body["pub"] !== undefined && body["pub"] !== null) {
    tag = await verifySignature(body["pub"], body["sig"], signedMessage(NEW_POST, `${title.title}\n${text.text}`, name.name, challenge));
    if (!tag) return fail(400, "your signature didn't match. your key may be damaged.");
    const k = body["pub"] as Record<string, string>;
    pub = { kty: "EC", crv: "P-256", x: k["x"]!, y: k["y"]! };
    sig = String(body["sig"]);
  }

  const token = randomBytes(24).toString("base64url");
  const p: StoredPost = {
    v: 1, id: ulid(), title: title.title, text: text.text, name: name.name, tag, pub, sig,
    at: new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString(),
    del: createHash("sha256").update(token).digest("hex"),
  };
  try { await store.add(p); } catch { return resting(); }
  return json({ post: toPublicPost(p), deleteToken: token }, 201);
};

/** remove a visitor post: by its author (delete token) or the owner. */
export const DELETE: APIRoute = async ({ request }) => {
  if (!sameOrigin(request) && !request.headers.get("authorization")) return fail(403, "not from here.");
  let body: Record<string, unknown>;
  try { body = (await readJson(request)) as Record<string, unknown>; } catch { return fail(400, "malformed."); }
  const id = String(body?.["id"] ?? "");
  if (!COMMENT_ID.test(id)) return fail(400, "malformed.");
  const store = postStore();
  if (!store) return resting();
  const p = await store.read(id);
  if (!p) return json({ ok: true });
  const token = typeof body["token"] === "string" ? body["token"] : "";
  const owner = token.length > 0 && createHash("sha256").update(token).digest("hex") === p.del;
  if (!owner && !isAdmin(request.headers.get("authorization"))) return fail(403, "that isn't yours to remove.");
  await store.remove(id);
  return json({ ok: true });
};
