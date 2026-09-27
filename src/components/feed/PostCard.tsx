import { memo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Heart, MessageCircle, Bookmark, Share2, 
  MoreHorizontal, Flag, Trash2, Users, Repeat2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import UserAvatar from "@/components/UserAvatar";
import StorageMedia from "@/components/media/StorageMedia";
import FormattedContent from "@/components/feed/FormattedContent";
import PollDisplay from "@/components/polls/PollDisplay";

interface PostCardProps {
  post: {
    id: string;
    content: string;
    created_at: string;
    user_id: string;
    media_urls?: string[];
    edit_count?: number;
    last_edited_at?: string;
    circle_ids?: string[];
    visibility?: string;
    content_warning?: string;
    is_nsfw?: boolean;
    quoted_post_id?: string;
    profiles?: {
      username: string;
      display_name: string | null;
      avatar_url: string | null;
    } | null;
  };
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  isBookmarked: boolean;
  repostCount?: number;
  isReposted?: boolean;
  repostedBy?: string;
}

const PostCard = ({ post, likesCount, commentsCount, isLiked, isBookmarked, repostCount = 0, isReposted = false, repostedBy }: PostCardProps) => {
  const [liked, setLiked] = useState(isLiked);
  const [likeCount, setLikeCount] = useState(likesCount);
  const [burst, setBurst] = useState(0);
  const [bookmarked, setBookmarked] = useState(isBookmarked);
  const [reposted, setReposted] = useState(isReposted);
  const [reposts, setReposts] = useState(repostCount);
  const [showCW, setShowCW] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Keep local optimistic state in sync when the parent re-fetches and passes
  // fresh props (useState only seeds from props on first mount).
  useEffect(() => { setLiked(isLiked); }, [isLiked]);
  useEffect(() => { setLikeCount(likesCount); }, [likesCount]);
  useEffect(() => { setBookmarked(isBookmarked); }, [isBookmarked]);
  useEffect(() => { setReposted(isReposted); }, [isReposted]);
  useEffect(() => { setReposts(repostCount); }, [repostCount]);

  // Fetch quoted post if exists
  const { data: quotedPost } = useQuery({
    queryKey: ['quoted-post', post.quoted_post_id],
    queryFn: async () => {
      if (!post.quoted_post_id) return null;
      const { data } = await supabase
        .from('posts')
        .select('id, content, user_id, created_at')
        .eq('id', post.quoted_post_id)
        .maybeSingle();
      if (!data) return null;
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url')
        .eq('user_id', data.user_id)
        .maybeSingle();
      return { ...data, profiles: profile };
    },
    enabled: !!post.quoted_post_id,
    // A quoted post is immutable in practice; refetching it per card mount was
    // pure overhead.
    staleTime: 10 * 60_000,
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const handleLike = async () => {
    if (!user) return;
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(!liked);
    setLikeCount(prev => liked ? prev - 1 : prev + 1);
    if (!liked) setBurst(b => b + 1);
    try {
      if (prevLiked) {
        const { error } = await supabase.from('post_likes').delete().match({ post_id: post.id, user_id: user.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('post_likes').insert({ post_id: post.id, user_id: user.id });
        if (error) throw error;
        // The like → notification fan-out happens in a database trigger.
      }
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      toast({ title: "Action failed", variant: "destructive" });
    }
  };

  const handleRepost = async () => {
    if (!user) return;
    const prevReposted = reposted;
    const prevCount = reposts;
    setReposted(!reposted);
    setReposts(prev => reposted ? prev - 1 : prev + 1);
    try {
      if (prevReposted) {
        const { error } = await supabase.from('reposts').delete().match({ post_id: post.id, user_id: user.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('reposts').insert({ post_id: post.id, user_id: user.id });
        if (error) throw error;
      }
    } catch {
      setReposted(prevReposted);
      setReposts(prevCount);
      toast({ title: "Action failed", variant: "destructive" });
    }
  };

  const handleQuotePost = () => {
    navigate('/dashboard', { state: { quotePostId: post.id } });
  };

  const handleBookmark = async () => {
    if (!user) return;
    const prev = bookmarked;
    setBookmarked(!bookmarked);
    try {
      if (prev) {
        const { error } = await supabase.from('bookmarks').delete().match({ post_id: post.id, user_id: user.id });
        if (error) throw error;
        toast({ title: "Removed from bookmarks" });
      } else {
        const { error } = await supabase.from('bookmarks').insert({ post_id: post.id, user_id: user.id });
        if (error) throw error;
        toast({ title: "Added to bookmarks" });
      }
    } catch {
      setBookmarked(prev);
      toast({ title: "Action failed", variant: "destructive" });
    }
  };

  const handleFlag = async () => {
    if (!user) return;
    await supabase.from('post_flags').insert({ post_id: post.id, user_id: user.id, reason: 'engagement_bait' });
    toast({ title: "Post flagged", description: "Thanks for keeping the community clean." });
  };

  const handleDelete = async () => {
    if (!user || post.user_id !== user.id) return;
    try {
      await Promise.all([
        supabase.from('post_likes').delete().eq('post_id', post.id),
        supabase.from('bookmarks').delete().eq('post_id', post.id),
        supabase.from('comments').delete().eq('post_id', post.id),
        supabase.from('notifications').delete().eq('post_id', post.id),
        supabase.from('post_flags').delete().eq('post_id', post.id),
        supabase.from('reposts').delete().eq('post_id', post.id),
      ]);
      const { error } = await supabase.from('posts').delete().eq('id', post.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast({ title: "Post deleted" });
    } catch (error) {
      toast({ title: "Error deleting post", variant: "destructive" });
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/post/${post.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Check out this post on Bosley', text: post.content.substring(0, 100), url: shareUrl });
      } catch {
        /* user dismissed the share sheet */
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "Link copied to clipboard" });
    }
  };

  const handlePostClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('a') || target.closest('button') || target.closest('[role="button"]')) return;
    navigate(`/post/${post.id}`);
  };

  const hasCW = post.content_warning || post.is_nsfw;
  const name = post.profiles?.display_name || post.profiles?.username || "someone";

  return (
    <article className="row px-5 sm:px-8 py-5 cursor-pointer" onClick={handlePostClick}>
      {repostedBy && (
        <p className="flex items-center gap-1.5 text-foreground/40 text-[12px] font-light mb-3 pl-[52px]">
          <Repeat2 className="w-3 h-3" /> {repostedBy} reposted
        </p>
      )}

      <div className="flex items-start gap-4">
        <Link to={`/user/${post.profiles?.username}`} className="flex-shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
          <UserAvatar avatarUrl={post.profiles?.avatar_url} username={post.profiles?.username} size="md" />
        </Link>

        <div className="flex-1 min-w-0">
          {/* Byline: who, handle, when. One weight, three opacities. */}
          <div className="flex items-baseline justify-between gap-3">
            <p className="flex items-baseline gap-x-2 min-w-0 text-[14px] font-light leading-none">
              <Link
                to={`/user/${post.profiles?.username}`}
                onClick={(e) => e.stopPropagation()}
                className="text-foreground truncate hover:underline underline-offset-4 decoration-foreground/40"
              >
                {name}
              </Link>
              <span className="text-foreground/40 truncate">@{post.profiles?.username || "user"}</span>
              <span className="text-foreground/30 tabular-nums whitespace-nowrap">{formatDate(post.created_at)}</span>
              {(post.edit_count ?? 0) > 0 && <span className="text-foreground/30">edited</span>}
              {(post.circle_ids?.length ?? 0) > 0 && (
                <span className="text-foreground/30 inline-flex items-center gap-1" title="limited audience">
                  <Users className="w-3 h-3" />
                </span>
              )}
            </p>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="more"
                  onClick={(e) => e.stopPropagation()}
                  className="quiet -mt-1 -mr-2 p-2 rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100 [article:hover_&]:opacity-100"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-panel rounded-md border min-w-[160px]">
                <DropdownMenuItem onClick={handleFlag} className="text-foreground/80 text-[13px]">
                  <Flag className="w-3.5 h-3.5 mr-2" /> report
                </DropdownMenuItem>
                {user?.id === post.user_id && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive text-[13px]">
                      <Trash2 className="w-3.5 h-3.5 mr-2" /> delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {hasCW && !showCW ? (
            <div className="mt-3 py-4 border-y border-foreground/10">
              <p className="text-foreground/60 text-[14px] font-light">{post.content_warning || "sensitive content"}</p>
              <button
                onClick={(e) => { e.stopPropagation(); setShowCW(true); }}
                className="mt-2 text-[13px] text-foreground hover:text-signal transition-colors"
              >
                show it
              </button>
            </div>
          ) : (
            <>
              <div className="mt-2.5 text-foreground/90 text-[15.5px] font-light leading-[1.65] whitespace-pre-wrap [overflow-wrap:anywhere]">
                <FormattedContent content={post.content} />
              </div>

              {post.media_urls && post.media_urls.length > 0 && (
                <div className={`grid gap-1.5 mt-4 ${post.media_urls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                  {post.media_urls.map((url, idx) => {
                    const isVideo = url.includes(".mp4") || url.includes(".webm") || url.includes(".mov") || url.includes(".avi");
                    return isVideo ? (
                      <StorageMedia key={idx} bucket="post-media" value={url} kind="video" className="max-h-[480px] rounded-md overflow-hidden" />
                    ) : (
                      <StorageMedia key={idx} bucket="post-media" value={url} kind="image" alt="" imgClassName="w-full rounded-md object-cover max-h-[480px]" />
                    );
                  })}
                </div>
              )}

              {quotedPost && (
                <div
                  className="mt-4 pl-4 border-l border-foreground/20 hover:border-foreground/50 transition-colors"
                  onClick={(e) => { e.stopPropagation(); navigate(`/post/${quotedPost.id}`); }}
                >
                  <p className="text-[13px] font-light text-foreground/50">
                    @{quotedPost.profiles?.username} <span className="text-foreground/30">· {formatDate(quotedPost.created_at)}</span>
                  </p>
                  <p className="mt-1 text-foreground/75 text-[14px] font-light leading-relaxed line-clamp-3">{quotedPost.content}</p>
                </div>
              )}
            </>
          )}

          <PollDisplay postId={post.id} />

          {/* Actions: quiet at rest, no colour coding. Counts are facts, not rewards. */}
          <div className="flex items-center gap-1 mt-3 -ml-2 text-[12px] tabular-nums">
            <button
              onClick={handleLike}
              aria-pressed={liked}
              aria-label={liked ? "unlike" : "like"}
              className="quiet inline-flex items-center gap-1.5 h-8 px-2 rounded-md"
            >
              <span className="relative inline-flex">
                <motion.span
                  key={`heart-${burst}-${liked}`}
                  initial={liked && burst > 0 ? { scale: 0.6 } : false}
                  animate={liked && burst > 0 ? { scale: [0.6, 1.3, 1] } : { scale: 1 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                >
                  <Heart className={`w-[15px] h-[15px] ${liked ? "fill-current" : ""}`} />
                </motion.span>
                <AnimatePresence>
                  {burst > 0 && liked && (
                    <>
                      {[...Array(6)].map((_, i) => {
                        const angle = (i / 6) * Math.PI * 2;
                        return (
                          <motion.span
                            key={`spark-${burst}-${i}`}
                            initial={{ x: 0, y: 0, opacity: 0.9, scale: 0.6 }}
                            animate={{ x: Math.cos(angle) * 16, y: Math.sin(angle) * 16, opacity: 0, scale: 0.2 }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                            className="absolute left-1/2 top-1/2 w-1 h-1 rounded-full bg-foreground pointer-events-none"
                          />
                        );
                      })}
                    </>
                  )}
                </AnimatePresence>
              </span>
              <span>{likeCount > 0 ? likeCount : ""}</span>
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/post/${post.id}`); }}
              aria-label="replies"
              className="quiet inline-flex items-center gap-1.5 h-8 px-2 rounded-md"
            >
              <MessageCircle className="w-[15px] h-[15px]" />
              <span>{commentsCount > 0 ? commentsCount : ""}</span>
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  aria-label="repost"
                  aria-pressed={reposted}
                  className="quiet inline-flex items-center gap-1.5 h-8 px-2 rounded-md"
                >
                  <Repeat2 className="w-[15px] h-[15px]" />
                  <span>{reposts > 0 ? reposts : ""}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="glass-panel rounded-md border min-w-[160px]">
                <DropdownMenuItem className="text-[13px]" onClick={(e) => { e.stopPropagation(); handleRepost(); }}>
                  <Repeat2 className="w-3.5 h-3.5 mr-2" /> {reposted ? "undo repost" : "repost"}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-[13px]" onClick={(e) => { e.stopPropagation(); handleQuotePost(); }}>
                  <MessageCircle className="w-3.5 h-3.5 mr-2" /> quote
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              onClick={handleBookmark}
              aria-pressed={bookmarked}
              aria-label={bookmarked ? "remove bookmark" : "bookmark"}
              className="quiet inline-flex items-center gap-1.5 h-8 px-2 rounded-md"
            >
              <Bookmark className={`w-[15px] h-[15px] ${bookmarked ? "fill-current" : ""}`} />
            </button>

            <button onClick={handleShare} aria-label="share" className="quiet inline-flex items-center gap-1.5 h-8 px-2 rounded-md ml-auto">
              <Share2 className="w-[15px] h-[15px]" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};

// Tapping "Load more" changes state on the Dashboard, which re-rendered every
// already-mounted card. Props are stable value objects here, so a shallow
// comparison keeps an established feed from re-rendering on scroll growth.
export default memo(PostCard);
