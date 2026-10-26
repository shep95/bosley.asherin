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
// Objects that could not be signed (deleted, or nobody signed in) are
// remembered briefly so a feed full of them does not re-ask on every remount.
const FAILED_MS = 60 * 1000;
const failedUntil = new Map<string, number>();
const inFlight = new Map<string, Promise<string | null>>();
const queues = new Map<StorageBucket, Map<string, Array<(url: string | null) => void>>>();
const scheduled = new Set<StorageBucket>();

const keyOf = (bucket: StorageBucket, path: string) => `${bucket}:${path}`;

// A sign-in (or account switch) changes what may be signed, so forget failures.
try {
  supabase.auth.onAuthStateChange(() => {
    failedUntil.clear();
  });
} catch {
  /* auth not available in this environment */
}

/** decodeURIComponent throws on a malformed escape such as "%E0%A4%A"; keep the raw text instead. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

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
  if (pIdx !== -1) return safeDecode(value.substring(pIdx + publicMarker.length));

  const signMarker = `/storage/v1/object/sign/${bucket}/`;
  const sIdx = value.indexOf(signMarker);
  if (sIdx !== -1) {
    const after = value.substring(sIdx + signMarker.length);
    const q = after.indexOf("?");
    return safeDecode(q === -1 ? after : after.substring(0, q));
  }

  // Not one of ours. Third-party image URLs are a classic de-anonymisation
  // trick (a "tracking pixel" avatar that logs every viewer's IP and time), so
  // anything outside our own storage host is dropped rather than rendered.
  return "";
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
      else failedUntil.set(keyOf(bucket, path), now + FAILED_MS);
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

  const failedAt = failedUntil.get(key);
  if (failedAt && failedAt > Date.now()) return Promise.resolve(null);
  if (failedAt) failedUntil.delete(key);

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

export type StorageUrlStatus = "empty" | "loading" | "ready" | "failed";

/**
 * Resolves a stored value (path, public URL or legacy signed URL) to something
 * renderable, and says whether it is still loading or has failed. Loading and
 * failed used to share `null`, so media that could never be signed (a deleted
 * object, or any signed-out visitor) pulsed forever.
 */
export function useStorageUrlState(
  bucket: StorageBucket,
  value: string | null | undefined,
): { url: string | null; status: StorageUrlStatus } {
  const objectPath = useMemo(
    () => (value ? extractStorageObjectPath(bucket, value) || null : null),
    [bucket, value],
  );
  const needsSigning = !!objectPath && !objectPath.startsWith("http");

  const initial = (): { url: string | null; status: StorageUrlStatus } => {
    if (!objectPath) return { url: null, status: "empty" };
    if (!needsSigning) return { url: objectPath, status: "ready" };
    const cached = peekSignedUrl(bucket, objectPath);
    return cached ? { url: cached, status: "ready" } : { url: null, status: "loading" };
  };

  const [state, setState] = useState(initial);

  useEffect(() => {
    if (!objectPath) {
      setState({ url: null, status: "empty" });
      return;
    }
    if (!needsSigning) {
      setState({ url: objectPath, status: "ready" });
      return;
    }

    const cached = peekSignedUrl(bucket, objectPath);
    if (cached) {
      setState({ url: cached, status: "ready" });
      return;
    }

    let cancelled = false;
    setState((prev) => (prev.status === "loading" ? prev : { url: null, status: "loading" }));
    getSignedUrl(bucket, objectPath).then((resolved) => {
      if (cancelled) return;
      setState(resolved ? { url: resolved, status: "ready" } : { url: null, status: "failed" });
    });
    return () => {
      cancelled = true;
    };
  }, [bucket, objectPath, needsSigning]);

  return state;
}

/** Back-compat: the resolved URL only (null while loading, when empty, or on failure). */
export function useStorageUrl(bucket: StorageBucket, value: string | null | undefined) {
  return useStorageUrlState(bucket, value).url;
}
