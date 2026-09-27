import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { 
  Bell, Heart, MessageCircle, UserPlus, Loader2, Check, Trash2, Repeat2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";

interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'repost';
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

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'like':
        return <Heart className="w-4 h-4 text-foreground/70" />;
      case 'comment':
        return <MessageCircle className="w-4 h-4 text-foreground/70" />;
      case 'follow':
        return <UserPlus className="w-4 h-4 text-foreground/70" />;
      case 'repost':
        return <Repeat2 className="w-4 h-4 text-foreground/70" />;
      default:
        return <Bell className="w-4 h-4 text-foreground/70" />;
    }
  };

  const getNotificationText = (notification: Notification) => {
    const actorName = notification.actor?.display_name || notification.actor?.username || 'Someone';
    switch (notification.type) {
      case 'like':
        return <><span className="font-medium">{actorName}</span> liked your post</>;
      case 'comment':
        return <><span className="font-medium">{actorName}</span> commented on your post</>;
      case 'follow':
        return <><span className="font-medium">{actorName}</span> started following you</>;
      case 'mention':
        return <><span className="font-medium">{actorName}</span> mentioned you</>;
      case 'repost':
        return <><span className="font-medium">{actorName}</span> reposted your post</>;
      default:
        return 'New notification';
    }
  };

  const unreadCount = notifications?.filter(n => !n.read).length || 0;

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <PageHeader
          title="Notifications"
          statusDot={unreadCount > 0 ? "bg-emerald-500" : "bg-foreground/30"}
          statusLabel={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          actions={
            unreadCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllAsRead.mutate()}
                disabled={markAllAsRead.isPending}
                className="rounded-lg text-xs font-medium text-foreground/60 hover:text-foreground bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 h-9"
              >
                <Check className="w-3.5 h-3.5 mr-1.5" />
                Mark all read
              </Button>
            ) : null
          }
        />

        <div className="px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-foreground/60" />
          </div>
        ) : notifications && notifications.length > 0 ? (
          <div className="glass-card rounded-lg divide-y divide-foreground/5 overflow-hidden">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`p-4 flex items-start gap-3 hover:bg-foreground/5 cursor-pointer transition-colors relative ${
                  !notification.read ? 'bg-foreground/[0.03]' : ''
                }`}
              >
                {!notification.read && (
                  <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-foreground/60" />
                )}
                <div className="flex-shrink-0 mt-1 w-7 h-7 rounded-md bg-foreground/5 border border-foreground/10 flex items-center justify-center">
                  {getNotificationIcon(notification.type)}
                </div>
                
                <div className="flex-shrink-0">
                  <UserAvatar
                    avatarUrl={notification.actor?.avatar_url}
                    username={notification.actor?.username}
                    size="sm"
                  />
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-light text-sm">
                    {getNotificationText(notification)}
                  </p>
                  <p className="text-foreground/40 text-xs font-light mt-1">
                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification.mutate(notification.id);
                    }}
                    className="h-8 w-8 p-0 text-foreground/40 hover:text-foreground hover:bg-foreground/5"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Bell}
            title="Nothing new"
            description="When someone likes, replies to, or reposts your writing, it lands here."
            actionLabel="Write something"
            actionTo="/dashboard"
          />
        )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Notifications;