import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { stripMetadata } from '@/lib/mediaSanitize';
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_FILE_SIZES,
  extensionForMime,
  validateUpload,
} from '@/lib/sanitize';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  getDueQueue,
  getPendingQueue,
  getFailedPosts,
  removeFromQueue,
  recordSyncFailure,
  retryFailedPost,
  discardFailedPosts,
  nextDueAt,
  canSync,
  markSynced,
  base64ToFile,
  isOnline,
  QueuedPost,
  getQueueCount
} from '@/lib/offlineQueue';

type SyncResult = { ok: boolean; permanent?: boolean; reason?: string };

/** Errors that will fail the same way on every retry. */
const isPermanent = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code ?? '';
  // RLS refusal, constraint / invalid-input classes.
  return code === '42501' || code.startsWith('22') || code.startsWith('23');
};

class UploadRejected extends Error {}

export function useOfflineSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [failedPosts, setFailedPosts] = useState<QueuedPost[]>([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // A ref, not state: the sync must not re-arm itself whenever isSyncing flips.
  const syncingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateQueueCount = useCallback(() => {
    setQueueCount(getQueueCount());
    setFailedPosts(getFailedPosts());
  }, []);

  // Sync a single post
  const syncPost = useCallback(async (post: QueuedPost, uid: string): Promise<SyncResult> => {
    try {
      const mediaUrls: string[] = [];

      // Upload media files if any
      if (post.mediaFiles && post.mediaFiles.length > 0) {
        for (const media of post.mediaFiles) {
          // Re-run the upload gate on the reconstituted file: localStorage is
          // writable by anything on the origin, so the queue is not trusted.
          const raw = base64ToFile(media.data, media.name, media.type);
          const isVideo = raw.type.startsWith('video/');
          const invalid = await validateUpload(
            raw,
            isVideo ? ALLOWED_VIDEO_TYPES : ALLOWED_IMAGE_TYPES,
            isVideo ? MAX_FILE_SIZES.video : MAX_FILE_SIZES.image,
          );
          if (invalid) throw new UploadRejected(invalid);
          // Queued media was scrubbed at capture time; re-scrub defensively in
          // case the entry predates the sanitizer.
          const file = await stripMetadata(raw);
          // Extension comes from the allow-listed MIME type, never the filename.
          const fileExt = extensionForMime(file.type);
          if (!fileExt) throw new UploadRejected('unsupported media type');
          const fileName = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 11)}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('post-media')
            .upload(fileName, file);

          if (uploadError) throw uploadError;

          // Buckets are private: store the object path; the feed signs it.
          mediaUrls.push(fileName);
        }
      }

      // Calculate expiry date
      let expiresAt: Date | null = null;
      if (post.expiresIn) {
        const now = new Date();
        switch (post.expiresIn) {
          case '7d': expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); break;
          case '30d': expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); break;
          case '90d': expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); break;
        }
      }

      // Create the post
      const { error } = await supabase.from('posts').insert({
        content: post.content,
        user_id: uid,
        media_urls: mediaUrls,
        expires_at: expiresAt?.toISOString(),
        topic_id: post.topicId || null,
        // CRITICAL: preserve audience selection so a post queued to a private
        // circle never gets silently published to the public feed on sync.
        circle_ids: post.circleIds ?? [],
        // Items queued before the fix may still say 'circles'.
        visibility: (post.visibility as string) === 'circles' ? 'circle' : (post.visibility ?? 'public'),
        reply_control: post.replyControl ?? 'everyone'
      });

      if (error) throw error;

      return { ok: true };
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to sync post:', error);
      const permanent = error instanceof UploadRejected || isPermanent(error);
      return { ok: false, permanent, reason: permanent ? 'rejected' : 'network' };
    }
  }, []);

  /**
   * Send whatever is due. `manual` (the "send now" button) ignores backoff
   * timing for pending posts, but never resurrects failed ones.
   */
  const runSync = useCallback(async (manual: boolean) => {
    // Offline: the 'online' listener picks it up. Busy: the running sync reschedules.
    if (!userId || syncingRef.current || !isOnline()) return;
    if (!manual && !canSync()) {
      scheduleNextRef.current();
      return;
    }

    const queue = manual ? getPendingQueue() : getDueQueue();
    if (queue.length === 0) {
      updateQueueCount();
      scheduleNextRef.current();
      return;
    }

    syncingRef.current = true;
    setIsSyncing(true);
    markSynced();

    let successCount = 0;
    let gaveUpCount = 0;

    try {
      for (const post of queue) {
        const result = await syncPost(post, userId);
        if (result.ok) {
          removeFromQueue(post.id);
          successCount++;
        } else if (recordSyncFailure(post.id, result.reason ?? 'network', !!result.permanent)) {
          gaveUpCount++;
        }
      }
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      updateQueueCount();
    }

    if (successCount > 0) {
      void queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast({
        title: `${successCount} queued post${successCount > 1 ? 's' : ''} sent.`,
      });
    }

    // Transient failures retry quietly with backoff; only giving up is worth a toast.
    if (gaveUpCount > 0) {
      toast({
        title: `${gaveUpCount === 1 ? 'a queued post' : `${gaveUpCount} queued posts`} could not be sent.`,
        description: 'we stopped retrying. you can discard it or try again.',
        variant: 'destructive'
      });
    }

    scheduleNextRef.current();
  }, [userId, syncPost, queryClient, toast, updateQueueCount]);

  // Wake up when the earliest backed-off post becomes due.
  const scheduleNext = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    const due = nextDueAt();
    if (due === null || !userId) return;
    retryTimerRef.current = setTimeout(() => { void runSyncRef.current(false); }, Math.max(10_000, due - Date.now()));
  }, [userId]);

  const runSyncRef = useRef(runSync);
  const scheduleNextRef = useRef(scheduleNext);
  useEffect(() => {
    runSyncRef.current = runSync;
    scheduleNextRef.current = scheduleNext;
  }, [runSync, scheduleNext]);

  /** Manual "send now". Safe to pass straight to onClick (ignores its argument). */
  const syncQueue = useCallback(() => runSyncRef.current(true), []);

  const retryFailed = useCallback((postId?: string) => {
    const ids = postId ? [postId] : getFailedPosts().map(p => p.id);
    ids.forEach(retryFailedPost);
    updateQueueCount();
    void runSyncRef.current(true);
  }, [updateQueueCount]);

  const discardFailed = useCallback((postId?: string) => {
    if (postId) removeFromQueue(postId);
    else discardFailedPosts();
    updateQueueCount();
  }, [updateQueueCount]);

  // Online/offline listeners and the initial sync: once per signed-in user,
  // not after every sync.
  useEffect(() => {
    let onlineTimer: ReturnType<typeof setTimeout> | null = null;
    const handleOnline = () => {
      setIsOffline(false);
      // Delay sync slightly to ensure connection is stable
      if (onlineTimer) clearTimeout(onlineTimer);
      onlineTimer = setTimeout(() => { void runSyncRef.current(false); }, 2000);
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    updateQueueCount();
    if (userId && isOnline()) void runSyncRef.current(false);
    scheduleNextRef.current();

    return () => {
      if (onlineTimer) clearTimeout(onlineTimer);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [userId, updateQueueCount]);

  return {
    isSyncing,
    queueCount,
    isOffline,
    syncQueue,
    updateQueueCount,
    /** Posts we stopped retrying; show them and offer discard / retry. */
    failedPosts,
    failedCount: failedPosts.length,
    retryFailed,
    discardFailed,
  };
}
