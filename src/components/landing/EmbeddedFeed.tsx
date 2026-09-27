import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Lock, ArrowUpRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import PostCard from "@/components/feed/PostCard";
import { Skeleton } from "@/components/ui/skeleton";
import Brandmark from "@/components/Brandmark";

/**
 * Live, embeddable feed used inside the split-screen landing pane.
 * - Anon users: read-only preview served by the `get_public_preview_posts`
 *   RPC (anonymous visitors cannot read the tables directly).
 * - Authed users: full interactivity (likes, bookmarks).
 */
const EmbeddedFeed = ({ onOpenAuth }: { onOpenAuth?: (tab: "login" | "signup") => void }) => {
  const { user } = useAuth();

  const { data: posts, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["embedded-feed", user?.id ?? "anon"],
    queryFn: async () => {
      if (!user) {
        const { data: preview, error } = await supabase.rpc("get_public_preview_posts");
        if (error) throw error;
        return (preview ?? []).map((p) => ({
          id: p.id,
          content: p.content,
          created_at: p.created_at,
          user_id: p.user_id,
          media_urls: p.media_urls ?? undefined,
          is_nsfw: p.is_nsfw,
          content_warning: p.content_warning ?? undefined,
          profiles: {
            user_id: p.user_id,
            username: p.username,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
          },
          likesCount: p.likes_count ?? 0,
          commentsCount: p.comments_count ?? 0,
          isLiked: false,
          isBookmarked: false,
        }));
      }

      const { data: rawPosts } = await supabase
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(25);

      const list = (rawPosts ?? []).filter((p: any) =>
        !p.expires_at || new Date(p.expires_at) > new Date()
      );

      const userIds = [...new Set(list.map((p: any) => p.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", userIds);
      const pmap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));

      const ids = list.map((p: any) => p.id);
      const { data: likes } = await supabase
        .from("post_likes").select("post_id").in("post_id", ids);
      const lcount = new Map<string, number>();
      (likes ?? []).forEach((l: any) => lcount.set(l.post_id, (lcount.get(l.post_id) ?? 0) + 1));

      const { data: cmts } = await supabase
        .from("comments").select("post_id").in("post_id", ids);
      const ccount = new Map<string, number>();
      (cmts ?? []).forEach((c: any) => ccount.set(c.post_id, (ccount.get(c.post_id) ?? 0) + 1));

      const { data: ul } = await supabase
        .from("post_likes").select("post_id").eq("user_id", user.id).in("post_id", ids);
      const likedSet = new Set((ul ?? []).map((x: any) => x.post_id));
      const { data: ub } = await supabase
        .from("bookmarks").select("post_id").eq("user_id", user.id).in("post_id", ids);
      const bmSet = new Set((ub ?? []).map((x: any) => x.post_id));

      return list.map((p: any) => ({
        ...p,
        profiles: pmap.get(p.user_id) ?? null,
        likesCount: lcount.get(p.id) ?? 0,
        commentsCount: ccount.get(p.id) ?? 0,
        isLiked: likedSet.has(p.id),
        isBookmarked: bmSet.has(p.id),
      }));
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="relative z-10 h-full flex flex-col overflow-hidden">
      {/* Embedded header */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-foreground/5 backdrop-blur-xl bg-background/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brandmark className="w-6 h-6 opacity-90" />
          <div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-signal" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/70 font-medium">
              Live feed · Real data
            </span>
          </div>
          <h2 className="text-base font-semibold text-foreground mt-1">
            {user ? "Your timeline" : "Public timeline"}
          </h2>
          </div>
        </div>
        <Button
          variant="ghost" size="icon"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-8 w-8 rounded-lg bg-foreground/5 hover:bg-foreground/10"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Anon callout */}
      {!user && (
        <div className="flex-shrink-0 mx-4 mt-4 rounded-xl border border-foreground/10 bg-foreground/[0.03] backdrop-blur-md p-3 flex items-center gap-3">
          <Lock className="w-4 h-4 text-foreground/60 flex-shrink-0" />
          <p className="text-xs text-foreground/70 font-light flex-1">
            Read-only preview. Sign in to like, reply, and post.
          </p>
          <Button
            size="sm"
            onClick={() => onOpenAuth?.("signup")}
            className="h-7 px-3 text-xs bg-foreground text-background hover:bg-foreground/90"
          >
            <ArrowUpRight className="w-3 h-3 mr-1" /> join
          </Button>
        </div>
      )}

      {/* Posts */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : posts && posts.length > 0 ? (
          <div className="space-y-3">
            {posts.map((post: any, idx: number) => (
              <div
                key={post.id}
                style={{ animationDelay: `${idx * 40}ms` }}
                className="animate-fade-in"
              >
                <PostCard
                  post={post}
                  likesCount={post.likesCount}
                  commentsCount={post.commentsCount}
                  isLiked={post.isLiked}
                  isBookmarked={post.isBookmarked}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-foreground/70 font-light py-12 text-sm">
            No public posts yet.
          </div>
        )}
      </div>
    </div>
  );
};

export default EmbeddedFeed;