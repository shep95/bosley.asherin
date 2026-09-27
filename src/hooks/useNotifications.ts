import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// Notification sound
const notificationSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleVAYG3OS1+mYbEYvVILL38yOY0E5Y4i+2cGGXkRDZoq608V/WkhMa4W+z7h5VExTb4e+zLR0UlFYdIO8yLBxVFVceIq7xq1uVllgfIy5xKpqWF1kgI63wqZoXGFngo23wKRkX2RqhIy1vqJiYWdth4uyvJ9gZGlxiYmwupxeZ2xziIivuJldaW50iYatuJdbbHF3ioWruJRabnN6i4SptpFZcHV8i4OntI5YcnZ+jIKls4xXc3l/jYGjsYtWdHqAjoChsIlVdXuBjoCfsIdUdnyDj3+dr4VTd32Dj36cr4NSeH6Ej32ar4JSeH+FkHyZroFReX+GkHuYrn9QeoGHkXqXrX5PeoGIkXmWrH1PeoGIkXmVq3xOe4GJknmUqntOe4GJknmTqXpNe4GJkniSqHlNe4GKkniRp3lMfIGKk3eQpnhMfIGKk3ePpXdLfIKKk3aNpHZLfIKLlHaMo3VKfIKLlHWLonRKfYKLlHWKoXNJfYKMlXSJoHJJfYKMlXOIn3FIfYKNlnOHnnBIfYKNlnKGnW9HfYKNlnGFnG5HfoONl3GEnG1GfoOOl3CDm2xGfoOOmG+Cm2tGf4OOmG+Bmmo=');

export interface Notification {
  id: string;
  type: 'message' | 'message_request' | 'like' | 'follow' | 'comment';
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  data?: any;
}

export const useNotifications = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  // Request notification permission
  const requestPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      return permission === 'granted';
    }
    return false;
  };

  // Play notification sound
  const playSound = () => {
    notificationSound.currentTime = 0;
    notificationSound.volume = 0.5;
    notificationSound.play().catch(() => {});
  };

  // Show browser notification. Read the live permission rather than the captured
  // React state so notifications fire right after the user grants permission.
  const showNotification = (title: string, body: string, icon?: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: icon || '/favicon.png',
        badge: '/favicon.png',
      });
      playSound();
    }
  };

  // Fetch unread message request count (only from people you haven't messaged back)
  const fetchUnreadCount = async () => {
    if (!userId) return;

    // Unread messages where I'm the receiver (bounded — this is a badge count)
    const { data: receivedMessages } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('receiver_id', userId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(500);

    // Recent messages where I'm the sender (to find who I've replied to)
    const { data: sentMessages } = await supabase
      .from('messages')
      .select('receiver_id')
      .eq('sender_id', userId)
      .order('created_at', { ascending: false })
      .limit(500);

    const repliedToIds = new Set(sentMessages?.map(m => m.receiver_id) || []);

    // Count unread messages only from people I haven't replied to (message requests)
    const unreadRequestCount = receivedMessages?.filter(
      m => !repliedToIds.has(m.sender_id)
    ).length || 0;

    setUnreadMessages(unreadRequestCount);
  };

  // Subscribe to realtime direct messages
  useEffect(() => {
    if (!userId) return;

    // Initial fetch
    fetchUnreadCount();

    // Check permission
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    // Subscribe to new messages — unique channel name per mount to avoid
    // "cannot add postgres_changes callbacks ... after subscribe()" when
    // React StrictMode / fast-refresh remounts the hook before cleanup runs.
    const channelName = `notifications:${userId}:${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`,
        },
        async (payload) => {
          // Increment unread count
          setUnreadMessages((prev) => prev + 1);

          // Get sender info
          const { data: sender } = await supabase
            .from('profiles')
            .select('username, display_name')
            .eq('user_id', payload.new.sender_id)
            .maybeSingle();

          const senderName = sender?.display_name || sender?.username || 'Someone';
          showNotification(
            `New message from ${senderName}`,
            payload.new.content?.substring(0, 100) || 'New message'
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Subscribe to realtime group messages — scoped to the user's own groups so
  // we are not woken (and do not run a membership lookup) for every group on
  // the platform. Skipped entirely when the user belongs to no groups.
  useEffect(() => {
    if (!userId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: memberships } = await supabase
        .from('group_chat_members')
        .select('group_id')
        .eq('user_id', userId);

      const groupIds = (memberships || []).map(m => m.group_id);
      if (cancelled || groupIds.length === 0) return;

      const channelName = `group-notifications:${userId}:${Math.random().toString(36).slice(2, 8)}`;
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'group_messages',
            filter: `group_id=in.(${groupIds.join(',')})`,
          },
          async (payload) => {
            if (payload.new.sender_id === userId) return;

            const { data: group } = await supabase
              .from('group_chats')
              .select('name')
              .eq('id', payload.new.group_id)
              .maybeSingle();

            showNotification(
              `New message in ${group?.name || 'Group'}`,
              payload.new.content?.substring(0, 100) || 'New message'
            );
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return {
    unreadMessages,
    setUnreadMessages,
    notificationPermission,
    requestPermission,
    showNotification,
    playSound,
    fetchUnreadCount,
  };
};
