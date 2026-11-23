import { getCollection } from "astro:content";
import { postStore } from "./env";
import { idOf } from "./visitor-posts";
import { VISITOR_KEY } from "../validate";

/** the key the challenge for writing a new post is bound to. */
export const NEW_POST = "new-post";

/** a conversation exists for a published owner post with comments on, or for a visitor post that exists. */
export async function commentablePost(slug: string): Promise<boolean> {
  if (VISITOR_KEY.test(slug)) {
    const store = postStore();
    if (!store) return false;
    try { return (await store.read(idOf(slug))) !== null; } catch { return false; }
  }
  const posts = await getCollection("posts", (p) => p.id === slug && !p.data.draft && p.data.comments);
  return posts.length === 1;
}
