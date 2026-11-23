import { del, get, list, put } from "@vercel/blob";

/**
 * comment storage: one small json file per comment in vercel blob (object
 * storage, not a database). paths are `comments/<post>/<ulid>.json`; ulids sort
 * by time, so listing a folder gives the conversation in order with no index.
 * every comment is its own file, so two people writing at once never collide.
 */

export interface StoredComment {
  v: 1;
  id: string;
  post: string;
  text: string;
  name: string | null;   // chosen display name, or null for anonymous
  tag: string | null;    // short fingerprint of the commenter's own signing key, if they chose one
  pub: JsonWebKey | null;
  sig: string | null;
  at: string;            // iso time, rounded down to the minute
  del: string;           // sha-256 of the private delete token (the token itself is never stored)
}

export interface PublicComment {
  id: string;
  text: string;
  name: string | null;
  tag: string | null;
  at: string;
}

export const toPublic = (c: StoredComment): PublicComment => ({ id: c.id, text: c.text, name: c.name, tag: c.tag, at: c.at });

export interface CommentStore {
  list(post: string, limit: number): Promise<StoredComment[]>;
  read(post: string, id: string): Promise<StoredComment | null>;
  add(c: StoredComment): Promise<void>;
  remove(post: string, id: string): Promise<void>;
}

const path = (post: string, id: string) => `comments/${post}/${id}.json`;

export function blobStore(token: string, access: "private" | "public"): CommentStore {
  const opts = { token };
  async function readPath(pathname: string): Promise<StoredComment | null> {
    const res = await get(pathname, { ...opts, access, useCache: false });
    if (!res || res.statusCode !== 200) return null;
    const text = await new Response(res.stream).text();
    try { return JSON.parse(text) as StoredComment; } catch { return null; }
  }
  return {
    async list(post, limit) {
      const out: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ ...opts, prefix: `comments/${post}/`, limit: 1000, ...(cursor ? { cursor } : {}) });
        for (const b of page.blobs) out.push(b.pathname);
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor && out.length < 5000);
      const newest = out.sort().slice(-limit);
      const rows = await Promise.all(newest.map(readPath));
      return rows.filter((r): r is StoredComment => r !== null);
    },
    read: (post, id) => readPath(path(post, id)),
    async add(c) {
      await put(path(c.post, c.id), JSON.stringify(c), {
        ...opts, access, contentType: "application/json", addRandomSuffix: false, allowOverwrite: false,
      });
    },
    async remove(post, id) {
      await del(path(post, id), opts);
    },
  };
}

/** in-memory store for local development and tests. */
export function memoryStore(): CommentStore {
  const m = new Map<string, StoredComment>();
  return {
    async list(post, limit) {
      return [...m.values()].filter((c) => c.post === post).sort((a, b) => a.id.localeCompare(b.id)).slice(-limit);
    },
    async read(post, id) { return m.get(path(post, id)) ?? null; },
    async add(c) { m.set(path(c.post, c.id), c); },
    async remove(post, id) { m.delete(path(post, id)); },
  };
}
