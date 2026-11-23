import { getCollection } from "astro:content";

/** a post accepts comments only if it exists, is published, and has comments on. */
export async function commentablePost(slug: string): Promise<boolean> {
  const posts = await getCollection("posts", (p) => p.id === slug && !p.data.draft && p.data.comments);
  return posts.length === 1;
}
