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
  visibility?: 'public' | 'circles';
  replyControl?: string;
  createdAt: string;
  mediaFiles?: {
    name: string;
    type: string;
    data: string; // base64 encoded
  }[];
}

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
    visibility?: 'public' | 'circles';
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
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Remove a post from the queue
 */
export function removeFromQueue(postId: string): void {
  const queue = getQueue().filter(p => p.id !== postId);
  saveQueue(queue);
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
  localStorage.setItem(SYNC_COOLDOWN_KEY, Date.now().toString());
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
 * Get the count of queued posts
 */
export function getQueueCount(): number {
  return getQueue().length;
}
