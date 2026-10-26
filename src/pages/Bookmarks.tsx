import DashboardLayout from "@/components/layout/DashboardLayout";
import PostCard from "@/components/feed/PostCard";
import FeedSkeleton from "@/components/feed/FeedSkeleton";
import LoadMoreSentinel from "@/components/feed/LoadMoreSentinel";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useInfiniteQuery } from "@tanstack/react-query";
import EmptyState from "@/components/ui/empty-state";
import PageHeader from "@/components/layout/PageHeader";
import { enrichPosts, type FeedPost } from "@/lib/postFeed";

const PAGE_SIZE = 30;

/** Keyset cursor on the bookmark rows: (created_at, id), newest first. */
type Cursor = { created_at: string; id: string };
type BookmarkPage = { posts: FeedPost[]; rawCount: number; cursor: Cursor | null };

const Bookmarks = () => {
  const { user } = useAuth();

  const {
    data,
    isPending,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useInfiniteQuery({
    queryKey: ['bookmarks', user?.id],
    enabled: !!user,
    initialPageParam: null as Cursor | null,
    getNextPageParam: (last: BookmarkPage) => (last.rawCount < PAGE_SIZE ? undefined : last.cursor ?? undefined),
    queryFn: async ({ pageParam }): Promise<BookmarkPage> => {
      if (!user) return { posts: [], rawCount: 0, cursor: null };

      let query = supabase
        .from('bookmarks')
        .select('id, post_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);
      if (pageParam) {
        query = query.or(
          `created_at.lt."${pageParam.created_at}",and(created_at.eq."${pageParam.created_at}",id.lt.${pageParam.id})`,
        );
      }

      const { data: bookmarks, error } = await query;
      if (error) throw error;
      const rows = bookmarks ?? [];
      const last = rows[rows.length - 1];
      const cursor = last ? { created_at: last.created_at, id: last.id } : null;
      if (rows.length === 0) return { posts: [], rawCount: 0, cursor };

      const postIds = rows.map(b => b.post_id);
      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('*')
        .in('id', postIds);
      if (postsError) throw postsError;

      const enriched = await enrichPosts(postsData ?? [], user.id);
      // Keep bookmark order; posts that were deleted or hidden simply drop out.
      const byId = new Map(enriched.map(p => [p.id, p]));
      const posts = postIds
        .map(id => byId.get(id))
        .filter((p): p is FeedPost => !!p);

      return { posts, rawCount: rows.length, cursor };
    },
  });

  const bookmarkedPosts = data?.pages.flatMap(p => p.posts) ?? [];
  const count = bookmarkedPosts.length;

  return (
    <DashboardLayout>
      <PageHeader
        title="bookmarks"
        subtitle={
          count > 0 && !hasNextPage
            ? `kept for later. only you see this. ${count} ${count === 1 ? "post" : "posts"}.`
            : "kept for later. only you see this."
        }
      />

      {isPending ? (
        <FeedSkeleton count={3} />
      ) : isError && count === 0 ? (
        <EmptyState
          title="your bookmarks did not load."
          description="nothing was lost. check your connection and try again."
          actionLabel="try again"
          onAction={() => refetch()}
        />
      ) : count > 0 || hasNextPage ? (
        <div className="stagger">
          {bookmarkedPosts.map((post, idx) => (
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
          />
        </div>
      ) : (
        <EmptyState
          title="nothing kept yet."
          description="the bookmark on any post puts it here. no one else can see the list."
          actionLabel="read the feed"
          actionTo="/dashboard"
        />
      )}
    </DashboardLayout>
  );
};

export default Bookmarks;
