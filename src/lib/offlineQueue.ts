// Offline posting queue - saves posts when offline and syncs when back online

import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_FILE_SIZES,
  extensionForMime,
  validateUpload,
} from '@/lib/sanitize';

const QUEUE_KEY = 'bosley_offline_post_queue';
const SYNC_COOLDOWN_KEY = 'bosley_last_sync';
const MIN_SYNC_INTERVAL = 10000; // 10 seconds between syncs to prevent spam
const MAX_QUEUE_BYTES = 5 * 1024 * 1024; // 5MB cap to prevent localStorage abuse
const MAX_QUEUE_ITEMS = 20;
const MAX_QUEUED_FILE_BYTES = 2 * 1024 * 1024; // per-file cap so localStorage never holds large blobs

export interface QueuedPost {
  id: string;
  content: string;
  topicId?: string;
  expiresIn?: string;
  circleIds?: string[];
  visibility?: 'public' | 'circle';
  replyControl?: string;
  createdAt: string;
  mediaFiles?: {
    name: string;
    type: string;
    data: string; // base64 encoded
  }[];
  /** Failed sync attempts so far. */
  attempts?: number;
  /** Epoch ms before which this post is not retried (exponential backoff). */
  nextAttemptAt?: number;
  /** Gave up: kept so the user can see it and discard it, never retried automatically. */
  failed?: boolean;
  /** Short, user-safe reason for the last failure. */
  lastError?: string;
}

export const MAX_SYNC_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 30_000; // 30s, 60s, 2m, 4m ...
const BACKOFF_MAX_MS = 30 * 60_000;

/**
 * Add a post to the offline queue
 */
export async function queuePostOffline(
  content: string, 
  options?: {
    topicId?: string;
    expiresIn?: string;
    mediaFiles?: File[];
    circleIds?: string[];
    visibility?: 'public' | 'circle';
    replyControl?: string;
  }
): Promise<string> {
  const queue = getQueue();

  if (queue.length >= MAX_QUEUE_ITEMS) {
    throw new Error('Offline queue is full. Reconnect to sync pending posts.');
  }
  
  // Convert files to base64 for storage
  const mediaData: QueuedPost['mediaFiles'] = [];
  if (options?.mediaFiles) {
    for (const file of options.mediaFiles) {
      // Same allow-list + magic-byte gate as an online upload, before anything
      // is serialized into storage.
      const isVideo = file.type.startsWith('video/');
      const invalid = await validateUpload(
        file,
        isVideo ? ALLOWED_VIDEO_TYPES : ALLOWED_IMAGE_TYPES,
        Math.min(isVideo ? MAX_FILE_SIZES.video : MAX_FILE_SIZES.image, MAX_QUEUED_FILE_BYTES),
      );
      if (invalid) {
        throw new Error(
          file.size > MAX_QUEUED_FILE_BYTES
            ? 'Media too large to queue offline (max 2MB per file).'
            : invalid,
        );
      }
      const base64 = await fileToBase64(file);
      // Store a name derived from the allow-listed MIME type, never the original filename.
      const ext = extensionForMime(file.type);
      mediaData.push({
        name: `queued-${Date.now()}.${ext ?? 'bin'}`,
        type: file.type,
        data: base64
      });
    }
  }
  
  const post: QueuedPost = {
    id: `queued_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    content,
    topicId: options?.topicId,
    expiresIn: options?.expiresIn,
    circleIds: options?.circleIds,
    visibility: options?.visibility,
    replyControl: options?.replyControl,
    createdAt: new Date().toISOString(),
    mediaFiles: mediaData.length > 0 ? mediaData : undefined
  };
  
  queue.push(post);
  const serialized = JSON.stringify(queue);
  if (serialized.length > MAX_QUEUE_BYTES) {
    throw new Error('Offline queue size limit reached.');
  }
  localStorage.setItem(QUEUE_KEY, serialized);
  
  return post.id;
}

/**
 * Get all queued posts
 */
export function getQueue(): QueuedPost[] {
  try {
    const stored = localStorage.getItem(QUEUE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save the queue to localStorage
 */
function saveQueue(queue: QueuedPost[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* storage full or blocked: nothing more we can do here */
  }
}

/**
 * Remove a post from the queue
 */
export function removeFromQueue(postId: string): void {
  const queue = getQueue().filter(p => p.id !== postId);
  saveQueue(queue);
}

/** Posts still waiting to be sent (not given up on). */
export function getPendingQueue(): QueuedPost[] {
  return getQueue().filter(p => !p.failed);
}

/** Pending posts whose backoff has elapsed. */
export function getDueQueue(now = Date.now()): QueuedPost[] {
  return getPendingQueue().filter(p => !p.nextAttemptAt || p.nextAttemptAt <= now);
}

/** Earliest time a pending post becomes due, or null when nothing is waiting. */
export function nextDueAt(): number | null {
  const times = getPendingQueue().map(p => p.nextAttemptAt ?? 0);
  return times.length ? Math.min(...times) : null;
}

/** Posts that exhausted their retries (or failed permanently). */
export function getFailedPosts(): QueuedPost[] {
  return getQueue().filter(p => p.failed);
}

/**
 * Record a failed attempt. Schedules the next try with exponential backoff, or
 * marks the post failed after MAX_SYNC_ATTEMPTS (immediately when `permanent`).
 * Returns true when the post has just moved to the failed state.
 */
export function recordSyncFailure(postId: string, reason: string, permanent = false): boolean {
  let gaveUp = false;
  const queue = getQueue().map(p => {
    if (p.id !== postId) return p;
    const attempts = (p.attempts ?? 0) + 1;
    const failed = permanent || attempts >= MAX_SYNC_ATTEMPTS;
    gaveUp = failed && !p.failed;
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (attempts - 1));
    return { ...p, attempts, failed, lastError: reason, nextAttemptAt: failed ? undefined : Date.now() + delay };
  });
  saveQueue(queue);
  return gaveUp;
}

/** Put a failed post back in line for a fresh set of attempts. */
export function retryFailedPost(postId: string): void {
  saveQueue(getQueue().map(p => (p.id === postId ? { ...p, failed: false, attempts: 0, nextAttemptAt: undefined } : p)));
}

/** Drop every failed post. */
export function discardFailedPosts(): void {
  saveQueue(getQueue().filter(p => !p.failed));
}

/**
 * Clear the entire queue
 */
export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

/**
 * Check if we can sync (prevent spam)
 */
export function canSync(): boolean {
  try {
    const lastSync = localStorage.getItem(SYNC_COOLDOWN_KEY);
    if (!lastSync) return true;
    
    const elapsed = Date.now() - parseInt(lastSync, 10);
    return elapsed >= MIN_SYNC_INTERVAL;
  } catch {
    return true;
  }
}

/**
 * Mark sync as completed
 */
export function markSynced(): void {
  try {
    localStorage.setItem(SYNC_COOLDOWN_KEY, Date.now().toString());
  } catch {
    /* noop */
  }
}

/**
 * Convert File to base64 string
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Convert base64 string back to File
 */
export function base64ToFile(base64: string, filename: string, mimeType: string): File {
  const byteString = atob(base64.split(',')[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  
  return new File([ab], filename, { type: mimeType });
}

/**
 * Check if the browser is currently online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Get the count of queued posts still waiting to be sent (failed ones excluded)
 */
export function getQueueCount(): number {
  return getPendingQueue().length;
}
