import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";

interface Notification {
  id: string;
  type: 'like' | 'comment' | 'reply' | 'follow' | 'mention' | 'repost';
  actor_id: string;
  post_id: string | null;
  comment_id: string | null;
  read: boolean;
  created_at: string;
  actor?: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

/** "8m", "2h", "1d", then "12 sep". A quiet fact, not a sentence. */
const shortTime = (dateString: string) => {
  const date = new Date(dateString);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" }).toLowerCase();
};

const VERB: Record<Notification["type"], string> = {
  like: "liked your post",
  comment: "replied to your post",
  reply: "replied to your comment",
  follow: "followed you",
  mention: "mentioned you",
  repost: "reposted your post",
};

const NotificationSkeleton = ({ count = 5 }: { count?: number }) => (
  <div className="stagger" aria-busy="true" aria-label="loading notifications">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="row px-5 sm:px-8 py-4 flex items-center gap-4" style={{ "--i": i } as React.CSSProperties}>
        <div className="w-8 h-8 rounded-full bg-foreground/[0.07] animate-pulse shrink-0" />
        <div className="h-3 flex-1 max-w-[260px] rounded bg-foreground/[0.06] animate-pulse" />
        <div className="h-3 w-6 rounded bg-foreground/[0.05] animate-pulse" />
      </div>
    ))}
  </div>
);

const Notifications = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch notifications
  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch actor profiles
      const actorIds = [...new Set(data?.map(n => n.actor_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', actorIds);

      const profilesMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      return data?.map(n => ({
        ...n,
        actor: profilesMap.get(n.actor_id)
      })) as Notification[];
    },
    enabled: !!user
  });

  // Subscribe to realtime notifications
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  // Mark notification as read
  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  // Mark all as read
  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  // Delete notification
  const deleteNotification = useMutation({
    mutationFn: async (notificationId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.read) {
      markAsRead.mutate(notification.id);
    }

    // Navigate based on type
    if (notification.post_id) {
      navigate(`/post/${notification.post_id}`);
    } else if (notification.type === 'follow') {
      navigate(`/user/${notification.actor?.username}`);
    }
  };

  const unreadCount = notifications?.filter(n => !n.read).length || 0;

  return (
    <DashboardLayout>
      <PageHeader
        title="notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : "all quiet."}
        actions={
          unreadCount > 0 ? (
            <button
              onClick={() => markAllAsRead.mutate()}
              disabled={markAllAsRead.isPending}
              className="quiet inline-flex items-center gap-2 h-10 px-2 -mr-2 rounded-md text-[13px] font-light"
            >
              {markAllAsRead.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              mark all read
            </button>
          ) : null
        }
      />

      {isLoading ? (
        <NotificationSkeleton />
      ) : notifications && notifications.length > 0 ? (
        <div className="stagger">
          {notifications.map((notification, idx) => {
            const name = notification.actor?.display_name || notification.actor?.username || "someone";
            const verb = VERB[notification.type] ?? "did something";
            return (
              <div
                key={notification.id}
                role="link"
                tabIndex={0}
                onClick={() => handleNotificationClick(notification)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleNotificationClick(notification);
                  }
                }}
                style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}
                className="group row relative flex items-center gap-4 px-5 sm:px-8 py-4 cursor-pointer focus:outline-none focus-visible:bg-foreground/[0.03]"
              >
                {!notification.read && (
                  <>
                    <span aria-hidden className="absolute left-2 sm:left-3.5 top-1/2 -translate-y-1/2 w-[5px] h-[5px] rounded-full bg-signal" />
                    <span className="sr-only">unread</span>
                  </>
                )}

                <UserAvatar
                  avatarUrl={notification.actor?.avatar_url}
                  username={notification.actor?.username}
                  size="sm"
                  className="shrink-0"
                />

                <p className="flex-1 min-w-0 text-[14px] font-light leading-snug">
                  <span className="text-foreground">{name}</span>{" "}
                  <span className="text-foreground/70">{verb}</span>
                </p>

                <span className="shrink-0 text-[12px] font-light text-foreground/35 tabular-nums">{shortTime(notification.created_at)}</span>

                {/* Dismiss: wakes on hover or keyboard focus; on a phone it is always there, small. */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNotification.mutate(notification.id);
                  }}
                  className="quiet hidden sm:inline-flex items-center h-10 px-2 -mr-2 rounded-md text-[12px] font-light opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 transition-opacity duration-150 ease-soft"
                >
                  dismiss
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNotification.mutate(notification.id);
                  }}
                  aria-label="dismiss"
                  className="quiet sm:hidden inline-flex items-center justify-center w-10 h-10 -mr-3 rounded-md"
                >
                  <X className="w-[15px] h-[15px]" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="all quiet."
          description="when someone replies, follows or mentions you, it lands here."
          actionLabel="back to the feed"
          actionTo="/dashboard"
        />
      )}
    </DashboardLayout>
  );
};

export default Notifications;
