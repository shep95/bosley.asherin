import {
  useUnread,
  useNotificationPermission,
  showBrowserNotification,
  playNotificationSound,
} from '@/hooks/useUnread';

export { useUnread, useNotificationPermission } from '@/hooks/useUnread';
export { UnreadProvider } from '@/hooks/UnreadProvider';

export interface Notification {
  id: string;
  type: 'message' | 'message_request' | 'like' | 'follow' | 'comment';
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  data?: unknown;
}

/**
 * Compatibility wrapper. Counts and realtime now live in `UnreadProvider` /
 * `useUnread` (one channel for the whole app); this hook opens no channels of
 * its own and never prompts for permission on its own.
 */
export const useNotifications = () => {
  const { counts, refresh } = useUnread();
  const { permission, requestPermission } = useNotificationPermission();
  return {
    unreadMessages: counts.messages + counts.requests,
    notificationPermission: (permission === 'unsupported' ? 'denied' : permission) as NotificationPermission,
    requestPermission,
    showNotification: (title: string, body: string) => showBrowserNotification(title, body),
    playSound: playNotificationSound,
    fetchUnreadCount: refresh,
  };
};
