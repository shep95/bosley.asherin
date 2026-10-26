import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { RefreshCw, ArrowUpRight } from "lucide-react";
import PostCard from "@/components/feed/PostCard";
import FeedSkeleton from "@/components/feed/FeedSkeleton";
import { enrichPosts } from "@/lib/postFeed";

/**
 * The room, live, on the landing page. Signed-out visitors read the latest
 * public posts through a capped RPC; signed-in visitors see their own feed.
 * Storage is private and cannot be signed without a session, so signed-out
 * cards describe their media ("1 photo · sign in to see it") instead of
 * showing a tile that can never load.
 */
const EmbeddedFeed = ({ onOpenAuth }: { onOpenAuth?: (tab: "login" | "signup") => void }) => {
  const { user } = useAuth();

  const { data: posts, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["embedded-feed", user?.id ?? "anon"],
    queryFn: async () => {
      if (!user) {
        const { data, error } = await supabase.rpc("get_public_preview_posts");
        if (error) throw error;
        return (data ?? []).map((row) => ({
          id: row.id,
          user_id: row.user_id,
          content: row.content,
          created_at: row.created_at,
          media_urls: row.media_urls,
          is_nsfw: row.is_nsfw,
          content_warning: row.content_warning,
          profiles: { user_id: row.user_id, username: row.username, display_name: row.display_name, avatar_url: row.avatar_url },
          likesCount: Number(row.likes_count) || 0,
          commentsCount: Number(row.comments_count) || 0,
          repostCount: 0,
          isLiked: false,
          isReposted: false,
          isBookmarked: false,
          hasPoll: false,
          quotedPost: null,
        }));
      }

      const { data: rawPosts, error } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      const list = (rawPosts ?? []).filter((p) => !p.expires_at || new Date(p.expires_at) > new Date());
      return enrichPosts(list, user.id);
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="relative h-full flex flex-col">
      <div className="flex items-center justify-between px-5 sm:px-6 py-3 border-b border-foreground/10">
        <p className="flex items-center gap-2 text-[11px] font-light uppercase tracking-[0.24em] text-foreground/45">
          <span className="w-1 h-1 rounded-full bg-signal" /> live · {user ? "your feed" : "public posts"}
        </p>
        <button onClick={() => refetch()} disabled={isFetching} aria-label="refresh" className="quiet p-2.5 -m-1 rounded-md">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <FeedSkeleton count={3} />
        ) : posts && posts.length > 0 ? (
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
                  anonymous={!user}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="px-6 py-12 text-[14px] font-light text-foreground/45">the room is quiet right now.</p>
        )}
      </div>

      {!user && (
        <div className="px-5 sm:px-6 py-3 border-t border-foreground/10 flex items-center justify-between text-[13px] font-light">
          <span className="text-foreground/50">read-only until you sign in.</span>
          <button onClick={() => onOpenAuth?.("signup")} className="inline-flex items-center gap-1 text-foreground hover:text-signal transition-colors">
            join <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default EmbeddedFeed;
