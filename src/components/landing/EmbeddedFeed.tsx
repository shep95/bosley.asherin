import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { RefreshCw, ArrowUpRight } from "lucide-react";
import PostCard from "@/components/feed/PostCard";
import FeedSkeleton from "@/components/feed/FeedSkeleton";

/**
 * The room, live, on the landing page. Signed-out visitors read the latest
 * public posts through a capped RPC; signed-in visitors see their own feed.
 */
const EmbeddedFeed = ({ onOpenAuth }: { onOpenAuth?: (tab: "login" | "signup") => void }) => {
  const { user } = useAuth();

  const { data: posts, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["embedded-feed", user?.id ?? "anon"],
    queryFn: async () => {
      if (!user) {
        const { data } = await supabase.rpc("get_public_preview_posts");
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
          isLiked: false,
          isBookmarked: false,
        }));
      }

      const { data: rawPosts } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(20);
      const list = (rawPosts ?? []).filter((p) => !p.expires_at || new Date(p.expires_at) > new Date());
      const userIds = [...new Set(list.map((p) => p.user_id))];
      const ids = list.map((p) => p.id);
      const [{ data: profiles }, { data: engagement }, { data: ul }, { data: ub }] = await Promise.all([
        supabase.from("profiles").select("user_id, username, display_name, avatar_url").in("user_id", userIds),
        supabase.rpc("get_post_engagement", { post_ids: ids }),
        supabase.from("post_likes").select("post_id").eq("user_id", user.id).in("post_id", ids),
        supabase.from("bookmarks").select("post_id").eq("user_id", user.id).in("post_id", ids),
      ]);
      const pmap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      const eng = new Map((engagement ?? []).map((e) => [e.post_id, e]));
      const likedSet = new Set((ul ?? []).map((x) => x.post_id));
      const bmSet = new Set((ub ?? []).map((x) => x.post_id));
      return list.map((p) => ({
        ...p,
        profiles: pmap.get(p.user_id) ?? null,
        likesCount: Number(eng.get(p.id)?.likes_count) || 0,
        commentsCount: Number(eng.get(p.id)?.comments_count) || 0,
        isLiked: likedSet.has(p.id),
        isBookmarked: bmSet.has(p.id),
      }));
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="relative h-full flex flex-col">
      <div className="flex items-center justify-between px-5 sm:px-6 py-3 border-b border-foreground/10">
        <p className="flex items-center gap-2 text-[11px] font-light uppercase tracking-[0.24em] text-foreground/45">
          <span className="w-1 h-1 rounded-full bg-signal" /> live · {user ? "your feed" : "public posts"}
        </p>
        <button onClick={() => refetch()} disabled={isFetching} aria-label="refresh" className="quiet p-1.5 rounded-md">
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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  post={post as any}
                  likesCount={post.likesCount}
                  commentsCount={post.commentsCount}
                  isLiked={post.isLiked}
                  isBookmarked={post.isBookmarked}
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
