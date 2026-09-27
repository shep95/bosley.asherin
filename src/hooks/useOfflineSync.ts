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
  getQueue,
  removeFromQueue,
  canSync,
  markSynced,
  base64ToFile,
  isOnline,
  QueuedPost,
  getQueueCount
} from '@/lib/offlineQueue';

export function useOfflineSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Update queue count
  const updateQueueCount = useCallback(() => {
    setQueueCount(getQueueCount());
  }, []);

  // Sync a single post
  const syncPost = async (post: QueuedPost): Promise<boolean> => {
    if (!user) return false;

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
          if (invalid) throw new Error(invalid);
          // Queued media was scrubbed at capture time; re-scrub defensively in
          // case the entry predates the sanitizer.
          const file = await stripMetadata(raw);
          // Extension comes from the allow-listed MIME type, never the filename.
          const fileExt = extensionForMime(file.type);
          if (!fileExt) throw new Error('Unsupported media type');
          const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('post-media')
            .upload(fileName, file);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('post-media')
            .getPublicUrl(fileName);

          mediaUrls.push(publicUrl);
        }
      }

      // Calculate expiry date
      let expiresAt = null;
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
        user_id: user.id,
        media_urls: mediaUrls,
        expires_at: expiresAt?.toISOString(),
        topic_id: post.topicId || null,
        // CRITICAL: preserve audience selection so a post queued to a private
        // circle never gets silently published to the public feed on sync.
        circle_ids: post.circleIds ?? [],
        visibility: post.visibility ?? 'public',
        reply_control: post.replyControl ?? 'everyone'
      });

      if (error) throw error;

      return true;
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to sync post:', error);
      return false;
    }
  };

  // Sync all queued posts
  const syncQueue = useCallback(async () => {
    if (!user || !canSync() || isSyncing) return;

    const queue = getQueue();
    if (queue.length === 0) return;

    setIsSyncing(true);
    markSynced();

    let successCount = 0;
    let failCount = 0;

    for (const post of queue) {
      const success = await syncPost(post);
      if (success) {
        removeFromQueue(post.id);
        successCount++;
      } else {
        failCount++;
      }
    }

    setIsSyncing(false);
    updateQueueCount();

    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast({
        title: `${successCount} post${successCount > 1 ? 's' : ''} synced`,
        description: 'Your offline posts have been published.'
      });
    }

    if (failCount > 0) {
      toast({
        title: 'Some posts failed to sync',
        description: `${failCount} post${failCount > 1 ? 's' : ''} will be retried later.`,
        variant: 'destructive'
      });
    }
  }, [user, isSyncing, queryClient, toast, updateQueueCount]);

  // The delayed online sync must call whichever syncQueue is current when the
  // timer fires, not the one captured when the listener was registered.
  const syncQueueRef = useRef(syncQueue);
  useEffect(() => {
    syncQueueRef.current = syncQueue;
  }, [syncQueue]);

  // Listen for online/offline events
  useEffect(() => {
    let onlineTimer: ReturnType<typeof setTimeout> | null = null;
    const handleOnline = () => {
      setIsOffline(false);
      // Delay sync slightly to ensure connection is stable
      if (onlineTimer) clearTimeout(onlineTimer);
      onlineTimer = setTimeout(() => { void syncQueueRef.current(); }, 2000);
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    updateQueueCount();
    if (isOnline() && user) {
      syncQueue();
    }

    return () => {
      if (onlineTimer) clearTimeout(onlineTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncQueue, updateQueueCount, user]);

  return {
    isSyncing,
    queueCount,
    isOffline,
    syncQueue,
    updateQueueCount
  };
}
