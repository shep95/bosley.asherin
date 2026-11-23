import { getCollection, type CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"posts">;

/** published posts, newest first. drafts show in `astro dev` only. */
export async function getPosts(): Promise<Post[]> {
  const all = await getCollection("posts", (p) => import.meta.env.DEV || !p.data.draft);
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** reading time at 230 words per minute, never less than one minute. */
export function readingMinutes(markdown: string | undefined): number {
  const words = (markdown ?? "").replace(/```[\s\S]*?```/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}

export function postUrl(p: Pick<Post, "id">): string {
  return `/p/${p.id}`;
}

export function allTags(posts: Post[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of posts) for (const t of p.data.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

const fmt = new Intl.DateTimeFormat("en", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
export const formatDate = (d: Date) => fmt.format(d).toLowerCase();
