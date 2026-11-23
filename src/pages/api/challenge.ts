import type { APIRoute } from "astro";
import { issueChallenge } from "../../lib/server/challenge";
import { powSecret } from "../../lib/server/env";
import { fail, json } from "../../lib/server/http";
import { commentablePost } from "../../lib/server/posts";
import { SLUG } from "../../lib/validate";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const post = url.searchParams.get("post") ?? "";
  if (!SLUG.test(post) || !(await commentablePost(post))) return fail(404, "no such post.");
  const secret = powSecret();
  if (!secret) return fail(503, "comments are resting. try again later.");
  return json(issueChallenge(secret, post));
};
