import { del, get, list, put } from "@vercel/blob";

/**
 * visitor posts: one json file each in vercel blob at `posts/<ulid>.json`.
 * like comments, there is no database and no index. ulids sort by time, so
 * the newest posts are the last names in the folder.
 */
export interface StoredPost {
  v: 1;
  id: string;
  title: string;
  text: string;
  name: string | null;
  tag: string | null;
  pub: JsonWebKey | null;
  sig: string | null;
  at: string;
  del: string;
}
export interface PublicPost { id: string; key: string; title: string; text: string; name: string | null; tag: string | null; at: string }

export const keyOf = (id: string) => `v-${id.toLowerCase()}`;
export const idOf = (key: string) => key.slice(2).toUpperCase();
export const toPublicPost = (p: StoredPost): PublicPost => ({ id: p.id, key: keyOf(p.id), title: p.title, text: p.text, name: p.name, tag: p.tag, at: p.at });

export interface PostStore {
  latest(limit: number): Promise<StoredPost[]>;
  read(id: string): Promise<StoredPost | null>;
  add(p: StoredPost): Promise<void>;
  remove(id: string): Promise<void>;
}

const path = (id: string) => `posts/${id}.json`;

export function blobPostStore(token: string, access: "private" | "public"): PostStore {
  const opts = { token };
  async function readPath(pathname: string): Promise<StoredPost | null> {
    const res = await get(pathname, { ...opts, access, useCache: false });
    if (!res || res.statusCode !== 200) return null;
    try { return JSON.parse(await new Response(res.stream).text()) as StoredPost; } catch { return null; }
  }
  return {
    async latest(limit) {
      const names: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ ...opts, prefix: "posts/", limit: 1000, ...(cursor ? { cursor } : {}) });
        for (const b of page.blobs) names.push(b.pathname);
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor && names.length < 10_000);
      const newest = names.sort().slice(-limit).reverse();
      return (await Promise.all(newest.map(readPath))).filter((p): p is StoredPost => p !== null);
    },
    read: (id) => readPath(path(id)),
    async add(p) {
      await put(path(p.id), JSON.stringify(p), { ...opts, access, contentType: "application/json", addRandomSuffix: false, allowOverwrite: false });
    },
    async remove(id) { await del(path(id), opts); },
  };
}

export function memoryPostStore(): PostStore {
  const m = new Map<string, StoredPost>();
  return {
    async latest(limit) { return [...m.values()].sort((a, b) => b.id.localeCompare(a.id)).slice(0, limit); },
    async read(id) { return m.get(id) ?? null; },
    async add(p) { m.set(p.id, p); },
    async remove(id) { m.delete(id); },
  };
}
