import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, Clock, Users, Heart, MessageSquare, Loader2 } from "lucide-react";
import { format } from "date-fns";

const Analytics = () => {
  const { user } = useAuth();

  // Fetch user's posts with engagement data
  const { data: stats, isLoading } = useQuery({
    queryKey: ['analytics', user?.id],
    queryFn: async () => {
      if (!user) return null;

      // Get all user posts
      const { data: posts } = await supabase
        .from('posts')
        .select('id, created_at, content')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!posts || posts.length === 0) {
        // Followers exist independently of posts, so still resolve them.
        const { count: followersOnly } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('following_id', user.id);
        const { count: followingOnly } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('follower_id', user.id);
        // Same shape as the populated branch — a partial object renders blanks.
        return {
          totalPosts: 0,
          totalLikes: 0,
          totalComments: 0,
          followers: followersOnly || 0,
          following: followingOnly || 0,
          topPosts: [] as any[],
          bestDay: '—',
          bestHour: '—',
          avgEngagement: '0',
        };
      }

      const postIds = posts.map(p => p.id);

      // Get likes
      const { data: likes } = await supabase
        .from('post_likes')
        .select('post_id')
        .in('post_id', postIds);

      // Get comments
      const { data: comments } = await supabase
        .from('comments')
        .select('post_id')
        .in('post_id', postIds);

      // Get followers
      const { count: followers } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', user.id);

      // Get following
      const { count: following } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', user.id);

      // Aggregate per post
      const likesMap = new Map<string, number>();
      likes?.forEach(l => likesMap.set(l.post_id, (likesMap.get(l.post_id) || 0) + 1));
      
      const commentsMap = new Map<string, number>();
      comments?.forEach(c => commentsMap.set(c.post_id, (commentsMap.get(c.post_id) || 0) + 1));

      const postsWithStats = posts.map(p => ({
        ...p,
        likes: likesMap.get(p.id) || 0,
        comments: commentsMap.get(p.id) || 0,
        engagement: (likesMap.get(p.id) || 0) + (commentsMap.get(p.id) || 0),
      }));

      const topPosts = [...postsWithStats].sort((a, b) => b.engagement - a.engagement).slice(0, 5);

      // Posts per day of week
      const dayDistribution = new Array(7).fill(0);
      posts.forEach(p => {
        dayDistribution[new Date(p.created_at).getDay()]++;
      });
      const bestDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayDistribution.indexOf(Math.max(...dayDistribution))];

      // Posts per hour
      const hourDistribution = new Array(24).fill(0);
      posts.forEach(p => {
        hourDistribution[new Date(p.created_at).getHours()]++;
      });
      const bestHour = hourDistribution.indexOf(Math.max(...hourDistribution));

      return {
        totalPosts: posts.length,
        totalLikes: likes?.length || 0,
        totalComments: comments?.length || 0,
        followers: followers || 0,
        following: following || 0,
        topPosts,
        bestDay,
        bestHour: `${bestHour}:00`,
        avgEngagement: postsWithStats.length > 0
          ? (postsWithStats.reduce((sum, p) => sum + p.engagement, 0) / postsWithStats.length).toFixed(1)
          : '0',
      };
    },
    enabled: !!user
  });

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto py-6 px-4">
        <div className="flex items-center gap-3 mb-6">
          <BarChart3 className="w-6 h-6 text-foreground/60" />
          <h1 className="text-2xl font-light text-foreground">Analytics</h1>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-foreground/30" />
          </div>
        ) : stats ? (
          <div className="space-y-6">
            {/* Overview cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Posts", value: stats.totalPosts, icon: MessageSquare },
                { label: "Likes", value: stats.totalLikes, icon: Heart },
                { label: "Comments", value: stats.totalComments, icon: MessageSquare },
                { label: "Followers", value: stats.followers, icon: Users },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="glass-card rounded-xl p-4 text-center">
                  <Icon className="w-5 h-5 text-foreground/30 mx-auto mb-2" />
                  <p className="text-2xl font-light text-foreground">{value}</p>
                  <p className="text-xs text-foreground/40 font-light">{label}</p>
                </div>
              ))}
            </div>

            {/* Insights */}
            <div className="glass-card rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-light text-foreground flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-foreground/50" />
                Insights
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-accent/5 rounded-lg p-4">
                  <p className="text-xs text-foreground/40 font-light uppercase tracking-wider">Best Day</p>
                  <p className="text-lg font-light text-foreground mt-1">{stats.bestDay}</p>
                </div>
                <div className="bg-accent/5 rounded-lg p-4">
                  <p className="text-xs text-foreground/40 font-light uppercase tracking-wider">Best Time</p>
                  <p className="text-lg font-light text-foreground mt-1">{stats.bestHour}</p>
                </div>
                <div className="bg-accent/5 rounded-lg p-4">
                  <p className="text-xs text-foreground/40 font-light uppercase tracking-wider">Avg Engagement</p>
                  <p className="text-lg font-light text-foreground mt-1">{stats.avgEngagement}/post</p>
                </div>
              </div>
            </div>

            {/* Top posts */}
            <div className="glass-card rounded-xl p-6">
              <h2 className="text-lg font-light text-foreground mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-foreground/50" />
                Top Performing Posts
              </h2>
              {stats.topPosts.length > 0 ? (
                <div className="space-y-3">
                  {stats.topPosts.map((post: any, i: number) => (
                    <div key={post.id} className="flex items-start gap-3 py-3 border-b border-border/10 last:border-0">
                      <span className="text-foreground/20 text-lg font-light w-6 shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground/70 font-light truncate">
                          {post.content.substring(0, 100)}{post.content.length > 100 ? '...' : ''}
                        </p>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-xs text-foreground/30 font-light flex items-center gap-1">
                            <Heart className="w-3 h-3" /> {post.likes}
                          </span>
                          <span className="text-xs text-foreground/30 font-light flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" /> {post.comments}
                          </span>
                          <span className="text-xs text-foreground/20 font-light">
                            {format(new Date(post.created_at), 'MMM d')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-foreground/30 text-sm font-light text-center py-4">
                  Start posting to see your analytics
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
};

export default Analytics;
