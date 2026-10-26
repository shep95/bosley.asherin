import { useState } from "react";
import DashboardLayout, { useRefresh } from "@/components/layout/DashboardLayout";
import PostComposer from "@/components/feed/PostComposer";
import PostCard from "@/components/feed/PostCard";
import FeedControls from "@/components/feed/FeedControls";
import FeedSkeleton from "@/components/feed/FeedSkeleton";
import LoadMoreSentinel from "@/components/feed/LoadMoreSentinel";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, WifiOff, CloudUpload } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";
import { isPostAllowedInFeed } from "@/lib/linkUtils";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { enrichPosts, type FeedPost } from "@/lib/postFeed";

/** A host greets you by name. Time of day is local to the reader. */
function greeting(name?: string) {
  const h = new Date().getHours();
  const part = h < 5 ? "late night" : h < 12 ? "good morning" : h < 18 ? "good afternoon" : "good evening";
  return `${part}${name ? `, ${name}` : ""}. newest first, nothing reordered.`;
}

// Founder username - posts from this account appear in Founder tab
const FOUNDER_USERNAME = "asher";

const PAGE_SIZE = 20;

/** Keyset cursor: the last row of the previous page, ordered (created_at, id) desc. */
type Cursor = { created_at: string; id: string };
type FeedPage = { posts: FeedPost[]; rawCount: number; cursor: Cursor | null };

const Dashboard = () => {
  const [feedMode, setFeedMode] = useState("chronological");
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

  // The founder id only changes what is fetched in founder mode, so only the
  // founder feed is keyed on it. Every key carries the viewer id so switching
  // accounts never shows the previous account's likes or bookmarks.
  const founderId = founderProfile?.user_id;
  const {
    data,
    isPending,
    isError,
    isFetching,
    isFetchingNextPage,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: feedMode === 'founder' ? ['posts', user?.id, 'founder', founderId] : ['posts', user?.id, feedMode],
    // Founder mode has nothing to show until the id is known; running it early
    // would fetch the unfiltered firehose and then discard it.
    enabled: !!user && (feedMode !== 'founder' || !!founderId),
    initialPageParam: null as Cursor | null,
    // Only a short page from the server means the end. A page that the
    // client-side filters emptied is not the end.
    getNextPageParam: (last: FeedPage) => (last.rawCount < PAGE_SIZE ? undefined : last.cursor ?? undefined),
    queryFn: async ({ pageParam }): Promise<FeedPage> => {
      let query = supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

      if (feedMode === 'founder' && founderId) {
        query = query.eq('user_id', founderId);
      } else if (feedMode === 'friends' && user) {
        // Who the viewer follows, cached briefly so each page does not re-ask.
        const followedIds = await queryClient.fetchQuery({
          queryKey: ['following-ids', user.id],
          staleTime: 60_000,
          queryFn: async () => {
            const { data: follows, error } = await supabase
              .from('follows')
              .select('following_id')
              .eq('follower_id', user.id);
            if (error) throw error;
            return (follows ?? []).map(f => f.following_id);
          },
        });
        // Following nobody means an empty feed, not the whole firehose.
        if (followedIds.length === 0) return { posts: [], rawCount: 0, cursor: null };
        query = query.in('user_id', followedIds);
      }
      // chronological and interest: everything, newest first.

      if (pageParam) {
        query = query.or(
          `created_at.lt."${pageParam.created_at}",and(created_at.eq."${pageParam.created_at}",id.lt.${pageParam.id})`,
        );
      }

      const { data: rawPostsData, error } = await query.limit(PAGE_SIZE);
      if (error) throw error;
      const raw = rawPostsData ?? [];
      const last = raw[raw.length - 1];

      // Filter out expired posts and posts with harmful content (for Latest/For You tabs)
      const now = new Date();
      const postsData = raw.filter(post => {
        if (post.expires_at && new Date(post.expires_at) <= now) return false;
        if (feedMode === 'chronological' || feedMode === 'interest') {
          if (!isPostAllowedInFeed(post.content, post.media_urls ?? undefined)) return false;
        }
        return true;
      });

      return {
        posts: await enrichPosts(postsData, user?.id),
        rawCount: raw.length,
        cursor: last ? { created_at: last.created_at, id: last.id } : null,
      };
    }
  });

  const posts = data?.pages.flatMap((p) => p.posts) ?? [];
  // Pending covers "waiting for the session / founder id" too, so the empty
  // state never flashes before the first page. A founder account that does
  // not exist is simply an empty feed.
  const showSkeleton = isPending && !(feedMode === 'founder' && founderProfile === null);

  const handleRefresh = () => {
    refetch();
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="feed"
        subtitle={greeting(user?.user_metadata?.username as string | undefined)}
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

      {showSkeleton ? (
        <FeedSkeleton count={4} />
      ) : isError && posts.length === 0 ? (
        <EmptyState
          title="the feed did not load."
          description="check your connection and try again."
          actionLabel="try again"
          onAction={() => refetch()}
        />
      ) : posts.length > 0 || hasNextPage ? (
        <div className="stagger">
          {posts.map((post, idx) => (
            <div key={post.id} style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
              <PostCard
                post={post}
                likesCount={post.likesCount}
                commentsCount={post.commentsCount}
                repostCount={post.repostCount}
                isLiked={post.isLiked}
                isReposted={post.isReposted}
                isBookmarked={post.isBookmarked}
                hasPoll={post.hasPoll}
                quotedPost={post.quotedPost}
              />
            </div>
          ))}
          <LoadMoreSentinel
            hasMore={!!hasNextPage}
            isLoading={isFetchingNextPage}
            isError={isFetchNextPageError}
            onLoadMore={() => { if (!isFetchingNextPage) fetchNextPage(); }}
            endLabel={posts.length > PAGE_SIZE ? `that is everything. ${posts.length} posts.` : undefined}
          />
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
