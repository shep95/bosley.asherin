/**
 * "for you", computed in the browser from the reader's own history. the server
 * never learns what anyone likes.
 *
 * score = interest in the post's tags + a gentle freshness term, so older posts
 * a reader loves can rise while new writing still gets seen. posts already read
 * sink, so the feed stays about what's next.
 */
export interface Rankable { slug: string; tags: string[]; date: number }

export function forYou<T extends Rankable>(items: T[], affinity: Record<string, number>, read: Set<string>, now = Date.now()): T[] {
  const max = Math.max(1, ...Object.values(affinity));
  const score = (p: T) => {
    const interest = p.tags.reduce((s, t) => s + (affinity[t] ?? 0) / max, 0) / Math.max(1, Math.sqrt(p.tags.length));
    const days = Math.max(0, (now - p.date) / 86_400_000);
    const fresh = 1 / Math.pow(days + 2, 0.6);
    const seen = read.has(p.slug) ? -1 : 0;
    return interest * 1.5 + fresh + seen;
  };
  return [...items].map((p, i) => ({ p, s: score(p), i })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.p);
}

/** short reason shown on a card, so ranking is never a mystery. */
export function why(tags: string[], affinity: Record<string, number>): string | null {
  const best = tags.map((t) => [t, affinity[t] ?? 0] as const).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0.5 ? `because you read #${best[0]}` : null;
}
