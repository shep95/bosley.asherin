import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Batched, cached signed-URL resolver for private storage buckets.
 *
 * Before this existed, every <UserAvatar> and every <StorageMedia> ran its own
 * `createSignedUrl` call inside its own effect. A 20-post feed with avatars and
 * images therefore opened ~40 independent HTTPS requests to the storage signing
 * endpoint on mount, all competing with the post query itself, and re-ran the
 * whole set on every remount because nothing was cached. That is the classic
 * N+1, moved from the database to the network.
 *
 * Here each request is queued for one animation-frame tick, coalesced per
 * bucket, and issued as a single `createSignedUrls` (plural) call. Results are
 * memoised in-process until shortly before expiry, so re-renders, remounts and
 * repeat appearances of the same avatar cost zero network.
 */

export type StorageBucket = "avatars" | "post-media" | "backgrounds" | "files";

const TTL_SECONDS = 60 * 60;
// Refresh a little before the real expiry so a URL handed out at the edge of
// the window cannot 403 mid-render.
const CACHE_MS = (TTL_SECONDS - 300) * 1000;
const BATCH_LIMIT = 100;

type CacheEntry = { url: string; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();
const queues = new Map<StorageBucket, Map<string, Array<(url: string | null) => void>>>();
const scheduled = new Set<StorageBucket>();

const keyOf = (bucket: StorageBucket, path: string) => `${bucket}:${path}`;

/**
 * Storage values are historically inconsistent: some rows hold a bare object
 * path, older rows hold a full public URL, a few hold a stale signed URL.
 * Normalise all three to an object path so the cache key is stable and the same
 * asset referenced two different ways is only signed once.
 */
export function extractStorageObjectPath(bucket: StorageBucket, value: string): string {
  if (!value.startsWith("http")) return value;

  const publicMarker = `/storage/v1/object/public/${bucket}/`;
  const pIdx = value.indexOf(publicMarker);
  if (pIdx !== -1) return decodeURIComponent(value.substring(pIdx + publicMarker.length));

  const signMarker = `/storage/v1/object/sign/${bucket}/`;
  const sIdx = value.indexOf(signMarker);
  if (sIdx !== -1) {
    const after = value.substring(sIdx + signMarker.length);
    const q = after.indexOf("?");
    return decodeURIComponent(q === -1 ? after : after.substring(0, q));
  }

  // Not one of ours — an external URL. Leave it untouched.
  return value;
}

function flush(bucket: StorageBucket) {
  scheduled.delete(bucket);
  const queue = queues.get(bucket);
  if (!queue || queue.size === 0) return;

  const paths = Array.from(queue.keys()).slice(0, BATCH_LIMIT);
  const batch = new Map<string, Array<(url: string | null) => void>>();
  for (const p of paths) {
    batch.set(p, queue.get(p)!);
    queue.delete(p);
  }
  // Anything over the batch limit stays queued for the next tick.
  if (queue.size > 0) schedule(bucket);

  void (async () => {
    let signed: Record<string, string | null> = {};
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, TTL_SECONDS);
      if (!error && data) {
        for (const row of data) {
          // `path` echoes the requested key; guard because it is typed nullable.
          if (row.path) signed[row.path] = row.signedUrl ?? null;
        }
      }
    } catch {
      signed = {};
    }

    const now = Date.now();
    for (const [path, resolvers] of batch) {
      const url = signed[path] ?? null;
      if (url) cache.set(keyOf(bucket, path), { url, expiresAt: now + CACHE_MS });
      inFlight.delete(keyOf(bucket, path));
      for (const resolve of resolvers) resolve(url);
    }
  })();
}

function schedule(bucket: StorageBucket) {
  if (scheduled.has(bucket)) return;
  scheduled.add(bucket);
  // One frame is enough for an entire feed page to mount and enqueue.
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => flush(bucket));
  else setTimeout(() => flush(bucket), 16);
}

export function getSignedUrl(bucket: StorageBucket, path: string): Promise<string | null> {
  const key = keyOf(bucket, path);

  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.url);
  if (hit) cache.delete(key);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = new Promise<string | null>((resolve) => {
    let queue = queues.get(bucket);
    if (!queue) {
      queue = new Map();
      queues.set(bucket, queue);
    }
    const resolvers = queue.get(path);
    if (resolvers) resolvers.push(resolve);
    else queue.set(path, [resolve]);
    schedule(bucket);
  });

  inFlight.set(key, promise);
  return promise;
}

/** Synchronous cache peek, so a cached avatar paints on first render with no flash. */
export function peekSignedUrl(bucket: StorageBucket, path: string): string | null {
  const hit = cache.get(keyOf(bucket, path));
  if (hit && hit.expiresAt > Date.now()) return hit.url;
  return null;
}

/**
 * Resolves a stored value (path, public URL or legacy signed URL) to something
 * renderable. Values that are already absolute non-storage URLs pass straight
 * through without touching the network.
 */
export function useStorageUrl(bucket: StorageBucket, value: string | null | undefined) {
  const objectPath = useMemo(
    () => (value ? extractStorageObjectPath(bucket, value) : null),
    [bucket, value],
  );
  const needsSigning = !!objectPath && !objectPath.startsWith("http");

  const [url, setUrl] = useState<string | null>(() => {
    if (!objectPath) return null;
    if (!needsSigning) return objectPath;
    return peekSignedUrl(bucket, objectPath);
  });

  useEffect(() => {
    if (!objectPath) {
      setUrl(null);
      return;
    }
    if (!needsSigning) {
      setUrl(objectPath);
      return;
    }

    const cached = peekSignedUrl(bucket, objectPath);
    if (cached) {
      setUrl(cached);
      return;
    }

    let cancelled = false;
    getSignedUrl(bucket, objectPath).then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [bucket, objectPath, needsSigning]);

  return url;
}
