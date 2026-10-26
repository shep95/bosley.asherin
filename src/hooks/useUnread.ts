import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * One source of truth for every badge.
 *
 * Counts come from `rpc get_unread_counts` and live in the React Query cache
 * under ['unread', userId], so every component that calls `useUnread()` shares
 * one request and one number. The realtime channel and the browser
 * notifications live only in `UnreadProvider`, which must be mounted once,
 * high in the tree (inside AuthProvider, around the routes), so that the page
 * and the sidebar never open their own channels or fire duplicate OS alerts.
 */

export interface UnreadCounts {
  /** Unread direct messages, excluding message requests. */
  messages: number;
  /** Partners with an unread message request. */
  requests: number;
  /** Unread notifications. */
  notifications: number;
}

const ZERO: UnreadCounts = { messages: 0, requests: 0, notifications: 0 };

export const unreadQueryKey = (userId: string | null | undefined) => ['unread', userId] as const;

const fetchUnreadCounts = async (): Promise<UnreadCounts> => {
  const { data, error } = await supabase.rpc('get_unread_counts');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    messages: Number(row?.messages ?? 0) || 0,
    requests: Number(row?.requests ?? 0) || 0,
    notifications: Number(row?.notifications ?? 0) || 0,
  };
};

const ProviderMounted = createContext(false);
let warnedMissingProvider = false;

const useUnreadQuery = (userId: string | undefined, poll: boolean) =>
  useQuery({
    queryKey: unreadQueryKey(userId),
    queryFn: fetchUnreadCounts,
    enabled: !!userId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    // Without the provider there is no realtime channel; a slow poll keeps the
    // badges from going stale forever.
    refetchInterval: poll ? 60_000 : false,
  });

export const useUnread = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const hasProvider = useContext(ProviderMounted);
  if (import.meta.env.DEV && !hasProvider && !warnedMissingProvider) {
    warnedMissingProvider = true;
    console.warn('useUnread: <UnreadProvider> is not mounted; badges will not update in realtime.');
  }
  const query = useUnreadQuery(userId, !hasProvider);
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: unreadQueryKey(userId) }),
    [queryClient, userId]
  );
  const counts = query.data ?? ZERO;
  return { counts, ...counts, refresh, isLoading: query.isLoading };
};

// ---------------------------------------------------------------------------
// Browser notifications
// ---------------------------------------------------------------------------

const SOUND_SRC =
  'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleVAYG3OS1+mYbEYvVILL38yOY0E5Y4i+2cGGXkRDZoq608V/WkhMa4W+z7h5VExTb4e+zLR0UlFYdIO8yLBxVFVceIq7xq1uVllgfIy5xKpqWF1kgI63wqZoXGFngo23wKRkX2RqhIy1vqJiYWdth4uyvJ9gZGlxiYmwupxeZ2xziIivuJldaW50iYatuJdbbHF3ioWruJRabnN6i4SptpFZcHV8i4OntI5YcnZ+jIKls4xXc3l/jYGjsYtWdHqAjoChsIlVdXuBjoCfsIdUdnyDj3+dr4VTd32Dj36cr4NSeH6Ej32ar4JSeH+FkHyZroFReX+GkHuYrn9QeoGHkXqXrX5PeoGIkXmWrH1PeoGIkXmVq3xOe4GJknmUqntOe4GJknmTqXpNe4GJkniSqHlNe4GKkniRp3lMfIGKk3eQpnhMfIGKk3ePpXdLfIKKk3aNpHZLfIKLlHaMo3VKfIKLlHWLonRKfYKLlHWKoXNJfYKMlXSJoHJJfYKMlXOIn3FIfYKNlnOHnnBIfYKNlnKGnW9HfYKNlnGFnG5HfoONl3GEnG1GfoOOl3CDm2xGfoOOmG+Cm2tGf4OOmG+Bmmo=';
let sound: HTMLAudioElement | null = null;

export const playNotificationSound = () => {
  try {
    sound ??= new Audio(SOUND_SRC);
    sound.currentTime = 0;
    sound.volume = 0.5;
    void sound.play().catch(() => {});
  } catch {
    /* no audio */
  }
};

const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

/**
 * Show one OS notification, only when the tab is in the background and the
 * user has already granted permission. Never prompts. The tag makes the OS
 * collapse duplicates if several tabs receive the same event.
 */
export const showBrowserNotification = (title: string, body: string, tag?: string) => {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  if (typeof document !== 'undefined' && !document.hidden) return;
  try {
    new Notification(title, { body, icon: '/favicon.png', badge: '/favicon.png', tag });
    playNotificationSound();
  } catch {
    /* some mobile browsers only allow notifications from a service worker */
  }
};

// Permission is shared state: one small store, so the Notifications header and
// Settings agree the moment either asks.
const permissionListeners = new Set<() => void>();
const readPermission = (): NotificationPermission | 'unsupported' =>
  notificationsSupported() ? Notification.permission : 'unsupported';
const subscribePermission = (cb: () => void) => {
  permissionListeners.add(cb);
  let status: PermissionStatus | null = null;
  const onChange = () => cb();
  if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
    navigator.permissions
      .query({ name: 'notifications' as PermissionName })
      .then((s) => {
        status = s;
        s.addEventListener('change', onChange);
      })
      .catch(() => {});
  }
  return () => {
    permissionListeners.delete(cb);
    status?.removeEventListener('change', onChange);
  };
};

/** Read and request notification permission. Only call `requestPermission` from a user gesture. */
export const useNotificationPermission = () => {
  const permission = useSyncExternalStore(subscribePermission, readPermission, () => 'unsupported' as const);
  const requestPermission = useCallback(async () => {
    if (!notificationsSupported()) return false;
    const result = await Notification.requestPermission();
    permissionListeners.forEach((l) => l());
    return result === 'granted';
  }, []);
  return { permission, requestPermission };
};

const VERB: Record<string, string> = {
  like: 'liked your post',
  comment: 'replied to your post',
  reply: 'replied to your comment',
  follow: 'followed you',
  mention: 'mentioned you',
  repost: 'reposted your post',
};

const profileName = async (userId: string | undefined) => {
  if (!userId) return 'someone';
  const { data } = await supabase
    .from('profiles')
    .select('username, display_name')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.display_name || data?.username || 'someone';
};

const canNotifyNow = () =>
  notificationsSupported() && Notification.permission === 'granted' && typeof document !== 'undefined' && document.hidden;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/** Set to true by `UnreadProvider`; consumers use it to know realtime is live. */
export const UnreadProviderContext = ProviderMounted;

/**
 * The single realtime subscription behind every badge. Call it from
 * `UnreadProvider` only (src/hooks/UnreadProvider.tsx).
 */
export const useUnreadRealtime = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();

  // Keep the counts warm for the whole session, not only while a badge is on screen.
  useUnreadQuery(userId, false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Marking a thread read fires one UPDATE per row; coalesce them.
    const refreshCounts = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: unreadQueryKey(userId) });
      }, 250);
    };
    const notified = new Set<string>();
    const once = (key: string) => {
      if (notified.has(key)) return false;
      notified.add(key);
      return true;
    };

    const channel = supabase
      .channel(`unread:${userId}:${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` },
        (payload) => {
          refreshCounts();
          if (payload.eventType !== 'INSERT') return;
          const row = payload.new as { id?: string; sender_id?: string; content?: string; is_view_once?: boolean | null };
          if (!row.id || !canNotifyNow() || !once(`m:${row.id}`)) return;
          void profileName(row.sender_id).then((name) => {
            if (cancelled) return;
            const body = row.is_view_once ? 'view-once message' : (row.content ?? '').slice(0, 100) || 'new message';
            showBrowserNotification(`message from ${name}`, body, `bosley-message-${row.id}`);
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          refreshCounts();
          void queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
          if (payload.eventType !== 'INSERT') return;
          const row = payload.new as { id?: string; type?: string; actor_id?: string };
          if (!row.id || !canNotifyNow() || !once(`n:${row.id}`)) return;
          void profileName(row.actor_id).then((name) => {
            if (cancelled) return;
            showBrowserNotification('bosley', `${name} ${VERB[row.type ?? ''] ?? 'did something'}`, `bosley-notification-${row.id}`);
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
};
