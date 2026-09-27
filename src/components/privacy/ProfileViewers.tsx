import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Eye, Loader2 } from "lucide-react";
import UserAvatar from "@/components/UserAvatar";
import { Link } from "react-router-dom";

const ProfileViewers = () => {
  const { user } = useAuth();

  const { data: viewers, isLoading } = useQuery({
    queryKey: ['profile-viewers', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      // Get unique viewers from the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: views } = await supabase
        .from('profile_views')
        .select('viewer_user_id, viewed_at')
        .eq('profile_user_id', user.id)
        .gte('viewed_at', thirtyDaysAgo.toISOString())
        .order('viewed_at', { ascending: false });
      
      if (!views || views.length === 0) return [];
      
      // Get unique viewers (most recent view per user)
      const uniqueViewers = new Map<string, string>();
      views.forEach(v => {
        if (!uniqueViewers.has(v.viewer_user_id)) {
          uniqueViewers.set(v.viewer_user_id, v.viewed_at);
        }
      });
      
      // Fetch profiles
      const viewerIds = Array.from(uniqueViewers.keys());
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', viewerIds);
      
      const profilesMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      
      return Array.from(uniqueViewers.entries()).map(([userId, viewedAt]) => ({
        userId,
        viewedAt,
        profile: profilesMap.get(userId)
      })).slice(0, 20); // Limit to 20 most recent
    },
    enabled: !!user
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-foreground/60" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <Eye className="w-5 h-5 text-foreground/60" />
        <h3 className="font-light text-foreground">Who viewed your profile</h3>
        <span className="text-foreground/40 text-sm">(last 30 days)</span>
      </div>
      
      {viewers && viewers.length > 0 ? (
        <div className="space-y-2">
          {viewers.map((viewer) => (
            <Link
              key={viewer.userId}
              to={`/user/${viewer.profile?.username}`}
              className="flex items-center justify-between p-3 rounded-lg border border-border/30 hover:border-border/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <UserAvatar
                  avatarUrl={viewer.profile?.avatar_url}
                  username={viewer.profile?.username}
                  size="sm"
                />
                <div>
                  <p className="font-light">{viewer.profile?.display_name || viewer.profile?.username}</p>
                  <p className="text-foreground/50 text-sm">@{viewer.profile?.username}</p>
                </div>
              </div>
              <span className="text-foreground/40 text-sm">{formatDate(viewer.viewedAt)}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-foreground/50 font-light text-sm text-center py-4">
          No profile views in the last 30 days
        </p>
      )}
    </div>
  );
};

export default ProfileViewers;
