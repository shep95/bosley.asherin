import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { blobStore, memoryStore, type CommentStore } from "./store";
import { blobPostStore, memoryPostStore, type PostStore } from "./visitor-posts";

/**
 * runtime configuration. three variables, all set in vercel project settings:
 *   POW_SECRET              random 32+ chars; signs proof-of-work challenges
 *   BLOB_READ_WRITE_TOKEN   added automatically when a blob store is connected
 *   BOSLEY_ADMIN_KEY        optional; lets the owner remove any comment
 * BLOB_ACCESS selects "private" (default) or "public" to match the store.
 */
const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

const isProd = () => env("VERCEL_ENV") === "production" || env("VERCEL_ENV") === "preview";

let devSecret: string | undefined;
export function powSecret(): string | null {
  const s = env("POW_SECRET");
  if (s && s.length >= 32) return s;
  if (isProd()) return null;
  return (devSecret ??= randomBytes(32).toString("hex"));
}

let mem: CommentStore | undefined;
export function commentStore(): CommentStore | null {
  const token = env("BLOB_READ_WRITE_TOKEN");
  if (token) return blobStore(token, env("BLOB_ACCESS") === "public" ? "public" : "private");
  if (isProd()) return null;
  return (mem ??= memoryStore());
}

let memPosts: PostStore | undefined;
export function postStore(): PostStore | null {
  const token = env("BLOB_READ_WRITE_TOKEN");
  if (token) return blobPostStore(token, env("BLOB_ACCESS") === "public" ? "public" : "private");
  if (isProd()) return null;
  return (memPosts ??= memoryPostStore());
}

export function isAdmin(header: string | null): boolean {
  const key = env("BOSLEY_ADMIN_KEY");
  if (!key || key.length < 32 || !header?.startsWith("Bearer ")) return false;
  const a = createHash("sha256").update(header.slice(7)).digest();
  const b = createHash("sha256").update(key).digest();
  return timingSafeEqual(a, b);
}
