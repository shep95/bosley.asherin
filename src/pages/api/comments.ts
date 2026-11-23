import type { APIRoute } from "astro";
import { createHash, randomBytes } from "node:crypto";
import { verifyChallenge } from "../../lib/server/challenge";
import { commentStore, isAdmin, powSecret } from "../../lib/server/env";
import { fail, json, readJson, sameOrigin } from "../../lib/server/http";
import { signedMessage, verifySignature } from "../../lib/server/identity";
import { commentablePost } from "../../lib/server/posts";
import { allow, visitorKey } from "../../lib/server/ratelimit";
import { toPublic, type StoredComment } from "../../lib/server/store";
import { ulid } from "../../lib/server/ulid";
import { cleanName, cleanText, COMMENT_ID, SLUG } from "../../lib/validate";

export const prerender = false;

const PAGE = 200;
const resting = () => fail(503, "comments are resting. try again later.");

/** the conversation under a post, oldest first. cached briefly at the edge. */
export const GET: APIRoute = async ({ url }) => {
  const post = url.searchParams.get("post") ?? "";
  if (!SLUG.test(post) || !(await commentablePost(post))) return fail(404, "no such post.");
  const store = commentStore();
  if (!store) return resting();
  try {
    const rows = await store.list(post, PAGE);
    return json({ comments: rows.map(toPublic) }, 200, {
      "cache-control": "no-store",
    });
  } catch {
    return resting();
  }
};

/** add a comment. needs solved proof-of-work; optionally signed by the visitor's own key. */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!sameOrigin(request)) return fail(403, "comments can only be posted from bosley.");
  const limit = allow(visitorKey(clientAddress), 5, 10 * 60 * 1000);
  if (!limit.ok) return fail(429, "that's a lot of words at once. take a breath and try again soon.", { "retry-after": String(limit.retryAfter) });

  let body: Record<string, unknown>;
  try { body = (await readJson(request)) as Record<string, unknown>; } catch { return fail(400, "that didn't arrive whole. try again."); }
  if (!body || typeof body !== "object") return fail(400, "that didn't arrive whole. try again.");

  const post = typeof body["post"] === "string" ? body["post"] : "";
  if (!SLUG.test(post) || !(await commentablePost(post))) return fail(404, "no such post.");

  const text = cleanText(body["text"]);
  if (!text.ok) return fail(422, text.error);
  const name = cleanName(body["name"]);
  if (!name.ok) return fail(422, name.error);

  const secret = powSecret();
  const store = commentStore();
  if (!secret || !store) return resting();

  const challenge = String(body["challenge"] ?? "");
  const proof = verifyChallenge(secret, challenge, String(body["nonce"] ?? ""), post);
  if (!proof.ok) return fail(proof.reason === "expired" ? 409 : 400, "the page went stale. send it again.");

  let tag: string | null = null;
  let pub: JsonWebKey | null = null;
  let sig: string | null = null;
  if (body["pub"] !== undefined && body["pub"] !== null) {
    tag = await verifySignature(body["pub"], body["sig"], signedMessage(post, text.text, name.name, challenge));
    if (!tag) return fail(400, "your signature didn't match. your key may be damaged.");
    const k = body["pub"] as Record<string, string>;
    pub = { kty: "EC", crv: "P-256", x: k["x"]!, y: k["y"]! };
    sig = String(body["sig"]);
  }

  const token = randomBytes(24).toString("base64url");
  const minute = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const c: StoredComment = {
    v: 1, id: ulid(), post, text: text.text, name: name.name, tag, pub, sig, at: minute,
    del: createHash("sha256").update(token).digest("hex"),
  };
  try { await store.add(c); } catch { return resting(); }
  return json({ comment: toPublic(c), deleteToken: token }, 201);
};

/** remove a comment: by its author (holding the delete token) or by the owner. */
export const DELETE: APIRoute = async ({ request }) => {
  if (!sameOrigin(request) && !request.headers.get("authorization")) return fail(403, "not from here.");
  let body: Record<string, unknown>;
  try { body = (await readJson(request)) as Record<string, unknown>; } catch { return fail(400, "malformed."); }
  const post = String(body?.["post"] ?? "");
  const id = String(body?.["id"] ?? "");
  if (!SLUG.test(post) || !COMMENT_ID.test(id)) return fail(400, "malformed.");
  const store = commentStore();
  if (!store) return resting();
  const c = await store.read(post, id);
  if (!c) return json({ ok: true });
  const token = typeof body["token"] === "string" ? body["token"] : "";
  const owner = createHash("sha256").update(token).digest("hex") === c.del && token.length > 0;
  if (!owner && !isAdmin(request.headers.get("authorization"))) return fail(403, "that isn't yours to remove.");
  await store.remove(post, id);
  return json({ ok: true });
};
