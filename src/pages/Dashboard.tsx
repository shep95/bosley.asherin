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
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";
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
      <PageHeader
        title="feed"
        subtitle="newest first. nothing is reordered for you."
        actions={
          <button onClick={handleRefresh} disabled={isFetching} aria-label="refresh" className="quiet p-2 rounded-md">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        }
        belowRow={<FeedControls mode={feedMode} onModeChange={setFeedMode} />}
      />

      {isOffline && (
        <div className="row px-5 sm:px-8 py-3 flex items-center gap-3 text-[13px] font-light">
          <WifiOff className="w-4 h-4 text-signal" />
          <span className="text-foreground/80">offline. posts wait here and send when you are back.</span>
          {queueCount > 0 && <span className="ml-auto text-signal tabular-nums">{queueCount} waiting</span>}
        </div>
      )}
      {queueCount > 0 && !isOffline && (
        <div className="row px-5 sm:px-8 py-3 flex items-center gap-3 text-[13px] font-light">
          <CloudUpload className={`w-4 h-4 text-foreground/60 ${isSyncing ? "animate-pulse" : ""}`} />
          <span className="text-foreground/80">
            {isSyncing ? "sending queued posts…" : `${queueCount} post${queueCount > 1 ? "s" : ""} ready to send`}
          </span>
          {!isSyncing && (
            <button onClick={syncQueue} className="ml-auto text-foreground hover:text-signal transition-colors">
              send now
            </button>
          )}
        </div>
      )}

      <PostComposer />

      {isLoading ? (
        <FeedSkeleton count={4} />
      ) : posts && posts.length > 0 ? (
        <div className="stagger">
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
            <div className="px-5 sm:px-8 py-6">
              <button
                onClick={() => setVisibleCount((c) => c + 30)}
                className="text-[14px] text-foreground hover:text-signal transition-colors"
              >
                more <span className="text-foreground/40 tabular-nums ml-2">{visiblePosts.length} of {posts.length}</span>
              </button>
            </div>
          ) : (
            posts.length > 30 && (
              <p className="px-5 sm:px-8 py-6 text-[13px] font-light text-foreground/40">
                that is everything. {posts.length} posts.
              </p>
            )
          )}
        </div>
      ) : (
        <EmptyState
          title="nothing here yet."
          description={
            feedMode === "friends"
              ? "you are not following anyone yet. the feed fills as you do."
              : "the room is quiet. write the first thing."
          }
          actionLabel={feedMode === "friends" ? "find people" : undefined}
          actionTo={feedMode === "friends" ? "/explore" : undefined}
        />
      )}
    </DashboardLayout>
  );
};

export default Dashboard;
