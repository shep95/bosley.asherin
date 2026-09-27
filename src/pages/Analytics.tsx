import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";

type TopPost = { id: string; content: string; created_at: string; likes: number; comments: number; engagement: number };

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
          topPosts: [] as TopPost[],
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

      const postsWithStats: TopPost[] = posts.map(p => ({
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
      const bestDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayDistribution.indexOf(Math.max(...dayDistribution))];

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
        bestHour: `${String(bestHour).padStart(2, '0')}:00`,
        avgEngagement: postsWithStats.length > 0
          ? (postsWithStats.reduce((sum, p) => sum + p.engagement, 0) / postsWithStats.length).toFixed(1)
          : '0',
      };
    },
    enabled: !!user
  });

  const maxEngagement = Math.max(1, ...(stats?.topPosts.map(p => p.engagement) ?? [0]));

  const Line = ({ label, value }: { label: string; value: string | number }) => (
    <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-foreground/[0.07] text-[14px] font-light">
      <span className="text-foreground/50">{label}</span>
      <span className="text-foreground tabular-nums">{value}</span>
    </div>
  );

  return (
    <DashboardLayout>
      <PageHeader title="analytics" subtitle="how your posts did. no vanity, just counts." />

      {isLoading ? (
        <div className="px-5 sm:px-8 py-4 stagger" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-foreground/[0.07]" style={{ "--i": i } as React.CSSProperties}>
              <div className="h-3 w-20 rounded bg-foreground/[0.06] animate-pulse" />
              <div className="h-3 w-8 rounded bg-foreground/[0.08] animate-pulse" />
            </div>
          ))}
        </div>
      ) : stats ? (
        <>
          <section className="px-5 sm:px-8 pt-2 pb-6">
            <div className="grid sm:grid-cols-2 gap-x-10">
              <Line label="posts" value={stats.totalPosts} />
              <Line label="likes" value={stats.totalLikes} />
              <Line label="replies" value={stats.totalComments} />
              <Line label="followers" value={stats.followers} />
              <Line label="following" value={stats.following} />
              <Line label="reactions per post" value={stats.avgEngagement} />
              <Line label="you post most on" value={stats.bestDay} />
              <Line label="usually around" value={stats.bestHour} />
            </div>
          </section>

          <section className="pb-6">
            <p className="px-5 sm:px-8 pb-1 text-[12px] font-light text-foreground/40">
              {stats.topPosts.length > 0 ? "posts people responded to most" : "top posts"}
            </p>
            {stats.topPosts.length > 0 ? (
              <div className="stagger">
                {stats.topPosts.map((post, i) => (
                  <Link
                    key={post.id}
                    to={`/post/${post.id}`}
                    className="row block px-5 sm:px-8 py-4"
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <div className="flex items-baseline justify-between gap-4 text-[14px] font-light">
                      <p className="text-foreground/85 truncate">{post.content}</p>
                      <p className="text-foreground/40 tabular-nums whitespace-nowrap text-[12px]">
                        {post.likes} {post.likes === 1 ? "like" : "likes"} · {post.comments} {post.comments === 1 ? "reply" : "replies"} · {format(new Date(post.created_at), 'd MMM').toLowerCase()}
                      </p>
                    </div>
                    <div className="mt-2.5 h-px w-full bg-foreground/[0.06]">
                      <div className="h-px bg-foreground/20 transition-[width] duration-[380ms] ease-soft" style={{ width: `${Math.max(2, (post.engagement / maxEngagement) * 100)}%` }} />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="no posts to count yet."
                description="once you have written something, likes and replies show up here."
                actionLabel="write something"
                actionTo="/dashboard"
              />
            )}
          </section>
        </>
      ) : null}
    </DashboardLayout>
  );
};

export default Analytics;
