import { useState, useEffect } from "react";
import DashboardLayout, { useRefresh } from "@/components/layout/DashboardLayout";
import PostComposer from "@/components/feed/PostComposer";
import PostCard from "@/components/feed/PostCard";
import FeedControls from "@/components/feed/FeedControls";
import FeedSkeleton from "@/components/feed/FeedSkeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, WifiOff, CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPostAllowedInFeed } from "@/lib/linkUtils";
import { useOfflineSync } from "@/hooks/useOfflineSync";

// Founder username - posts from this account appear in Founder tab
const FOUNDER_USERNAME = "asher";

const Dashboard = () => {
  const [feedMode, setFeedMode] = useState("chronological");
  const [visibleCount, setVisibleCount] = useState(30);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const refresh = useRefresh();
  const { isSyncing, queueCount, isOffline, syncQueue } = useOfflineSync();

  // Fetch founder's user_id for founder tab
  const { data: founderProfile } = useQuery({
    queryKey: ['founder-profile'],
    queryFn: async () => {
      // Query directly for the founder's profile by username
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, username')
        .eq('username', FOUNDER_USERNAME)
        .maybeSingle();
      
      if (error) {
        if (import.meta.env.DEV) console.error('Error fetching founder profile:', error);
        return null;
      }
      
      return data;
    },
    staleTime: 1000 * 60 * 60 // Cache for 1 hour
  });

  // The founder id only changes what is fetched in founder mode. Keying every
  // feed on it made the founder lookup resolving mid-flight invalidate the
  // chronological feed, so every visit fetched 100 posts twice and re-ran the
  // whole engagement/profile fan-out for an identical result.
  const founderId = founderProfile?.user_id;
  const { data: posts, isLoading, isFetching, refetch } = useQuery({
    queryKey: feedMode === 'founder' ? ['posts', 'founder', founderId] : ['posts', feedMode],
    // Founder mode has nothing to show until the id is known; running it early
    // would fetch the unfiltered firehose and then discard it.
    enabled: feedMode !== 'founder' || !!founderId,
    queryFn: async () => {
      let query = supabase
        .from('posts')
        .select('*');

      if (feedMode === 'chronological') {
        query = query.order('created_at', { ascending: false });
      } else if (feedMode === 'founder' && founderId) {
        // Only show founder's posts
        query = query.eq('user_id', founderId).order('created_at', { ascending: false });
      } else if (feedMode === 'friends' && user) {
        // Get followed users
        const { data: follows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);
        
        const followedIds = follows?.map(f => f.following_id) || [];
        // Following nobody means an empty feed, not the whole firehose.
        if (followedIds.length === 0) return [];
        query = query.in('user_id', followedIds).order('created_at', { ascending: false });
      } else {
        // Interest-based - could add ML later, for now show popular
        query = query.order('created_at', { ascending: false });
      }

      const { data: rawPostsData, error } = await query.limit(100);
      if (error) throw error;

      // Filter out expired posts and posts with harmful content (for Latest/For You tabs)
      const now = new Date();
      const postsData = (rawPostsData || []).filter(post => {
        // Check expiration
        if (post.expires_at && new Date(post.expires_at) <= now) return false;
        
        // Apply content filter for Latest and For You tabs (not Founder or Following)
        if (feedMode === 'chronological' || feedMode === 'interest') {
          if (!isPostAllowedInFeed(post.content, post.media_urls)) {
            return false;
          }
        }
        
        return true;
      });

      if (postsData.length === 0) return [];

      const userIds = [...new Set(postsData.map(p => p.user_id))];
      const postIds = postsData.map(p => p.id);

      // These four reads do not depend on each other. Awaiting them one after
      // another cost four sequential round trips before the feed could paint;
      // issued together they cost one. Engagement totals are aggregated in the
      // database rather than by downloading every like and comment row, which
      // previously made a popular post arbitrarily expensive to display.
      const [profilesRes, engagementRes, userLikesRes, userBookmarksRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url')
          .in('user_id', userIds),
        supabase.rpc('get_post_engagement', { post_ids: postIds }),
        user
          ? supabase.from('post_likes').select('post_id').eq('user_id', user.id).in('post_id', postIds)
          : Promise.resolve({ data: [] as { post_id: string }[] }),
        user
          ? supabase.from('bookmarks').select('post_id').eq('user_id', user.id).in('post_id', postIds)
          : Promise.resolve({ data: [] as { post_id: string }[] }),
      ]);

      const profilesMap = new Map(profilesRes.data?.map(p => [p.user_id, p]) || []);

      const likesCountMap = new Map<string, number>();
      const commentsCountMap = new Map<string, number>();
      for (const row of engagementRes.data || []) {
        likesCountMap.set(row.post_id, Number(row.likes_count) || 0);
        commentsCountMap.set(row.post_id, Number(row.comments_count) || 0);
      }

      const userLikedSet = new Set(userLikesRes.data?.map(l => l.post_id) || []);
      const userBookmarkedSet = new Set(userBookmarksRes.data?.map(b => b.post_id) || []);

      return postsData.map(post => ({
        ...post,
        profiles: profilesMap.get(post.user_id) || null,
        likesCount: likesCountMap.get(post.id) || 0,
        commentsCount: commentsCountMap.get(post.id) || 0,
        isLiked: userLikedSet.has(post.id),
        isBookmarked: userBookmarkedSet.has(post.id),
      }));
    }
  });

  const handleRefresh = () => {
    refetch();
  };

  // Reset visible count when feed mode changes
  useEffect(() => {
    setVisibleCount(30);
  }, [feedMode]);

  const visiblePosts = posts?.slice(0, visibleCount) ?? [];
  const hasMore = (posts?.length ?? 0) > visibleCount;

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        {/* Sticky glass feed header */}
        <div className="sticky top-0 z-20 page-header">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-foreground">Home</h1>
              <p className="text-xs text-foreground/60 mt-0.5">
                Newest posts first — no algorithm deciding for you
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isFetching}
              aria-label="Refresh feed"
              className="rounded-lg h-9 w-9 glass-inset hover:bg-foreground/10 press"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <div className="px-6 pb-4">
            <FeedControls mode={feedMode} onModeChange={setFeedMode} />
          </div>
        </div>

        <div className="px-4 py-6">
        {/* Offline indicator */}
        {isOffline && (
          <div className="glass-card rounded-xl p-3 mb-4 flex items-center gap-3 border-signal/30">
            <WifiOff className="w-5 h-5 text-signal" />
            <div className="flex-1">
              <p className="text-foreground text-sm font-medium">You're offline</p>
              <p className="text-foreground/60 text-xs">Posts will be queued and synced when you're back online</p>
            </div>
            {queueCount > 0 && (
              <span className="text-signal text-sm font-medium tabular-nums">{queueCount} queued</span>
            )}
          </div>
        )}

        {/* Sync indicator */}
        {queueCount > 0 && !isOffline && (
          <div className="glass-card rounded-xl p-3 mb-4 flex items-center gap-3 border-sky-500/30">
            <CloudUpload className={`w-5 h-5 text-sky-400 ${isSyncing ? 'animate-pulse' : ''}`} />
            <div className="flex-1">
              <p className="text-foreground text-sm font-medium">
                {isSyncing ? 'Syncing posts...' : `${queueCount} post${queueCount > 1 ? 's' : ''} ready to sync`}
              </p>
            </div>
            {!isSyncing && (
              <Button variant="ghost" size="sm" onClick={syncQueue} className="text-sky-400">
                Sync now
              </Button>
            )}
          </div>
        )}

        {/* Post composer */}
        <div className="mb-6">
          <PostComposer />
        </div>

        {/* Posts feed */}
        {isLoading ? (
          <FeedSkeleton count={4} />
        ) : posts && posts.length > 0 ? (
          <div className="space-y-4 stagger">
            {visiblePosts.map((post, idx) => (
              <div key={post.id} style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
                <PostCard
                  post={post}
                  likesCount={post.likesCount}
                  commentsCount={post.commentsCount}
                  isLiked={post.isLiked}
                  isBookmarked={post.isBookmarked}
                />
              </div>
            ))}
            {hasMore ? (
              <div className="flex justify-center pt-2">
                <Button
                  onClick={() => setVisibleCount((c) => c + 30)}
                  variant="glass"
                  className="rounded-lg font-medium press"
                >
                  Load more posts
                  <span className="ml-2 text-foreground/55 text-xs tabular-nums">
                    {visiblePosts.length} / {posts.length}
                  </span>
                </Button>
              </div>
            ) : (
              posts.length > 30 && (
                <p className="text-center text-xs text-foreground/50 pt-2">
                  You're all caught up · {posts.length} posts
                </p>
              )
            )}
          </div>
        ) : (
          <div className="glass-card rounded-xl p-10 text-center">
            <p className="text-foreground/70">
              No posts yet. Be the first to speak your mind!
            </p>
          </div>
        )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
