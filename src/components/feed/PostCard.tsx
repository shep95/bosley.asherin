import { memo, useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { friendlyDbError, isRateLimitError, isUniqueViolation, SLOW_DOWN } from "@/lib/dbErrors";
import { FEED_QUERY_ROOTS, fetchQuotedPost, type QuotedPost } from "@/lib/postFeed";
import { extractStorageObjectPath } from "@/lib/storageUrl";

interface PostCardProps {
  post: {
    id: string;
    content: string;
    created_at: string;
    user_id: string;
    media_urls?: string[] | null;
    edit_count?: number | null;
    last_edited_at?: string | null;
    circle_ids?: string[] | null;
    visibility?: string | null;
    content_warning?: string | null;
    is_nsfw?: boolean | null;
    quoted_post_id?: string | null;
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
  /**
   * Whether the post has a poll (from the feed's page-level polls lookup).
   * Leave undefined when unknown: the card then asks once via PollDisplay.
   */
  hasPoll?: boolean;
  /**
   * The quoted post, loaded with the page. Undefined means "not loaded", and
   * the card fetches it itself; null means "quoted post is gone or hidden".
   */
  quotedPost?: QuotedPost | null;
  /**
   * Signed-out preview (landing page). Private storage cannot be signed for
   * anonymous visitors, so media is described instead of shown.
   */
  anonymous?: boolean;
}

type PendingAction = "like" | "repost" | "bookmark" | "report" | "delete";

const isVideoUrl = (url: string) => /\.(mp4|webm|mov|avi)(\?|$)/i.test(url);

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
};

/** "2 photos · 1 video" for media a signed-out visitor cannot load. */
const describeMedia = (urls: string[]) => {
  const videos = urls.filter(isVideoUrl).length;
  const photos = urls.length - videos;
  const parts: string[] = [];
  if (photos > 0) parts.push(`${photos} photo${photos > 1 ? "s" : ""}`);
  if (videos > 0) parts.push(`${videos} video${videos > 1 ? "s" : ""}`);
  return `${parts.join(" · ")} · sign in to see ${urls.length > 1 ? "them" : "it"}`;
};

const PostCard = ({
  post, likesCount, commentsCount, isLiked, isBookmarked,
  repostCount = 0, isReposted = false, repostedBy, hasPoll, quotedPost: quotedPostProp, anonymous = false,
}: PostCardProps) => {
  const [liked, setLiked] = useState(isLiked);
  const [likeCount, setLikeCount] = useState(likesCount);
  const [burst, setBurst] = useState(0);
  const [bookmarked, setBookmarked] = useState(isBookmarked);
  const [reposted, setReposted] = useState(isReposted);
  const [reposts, setReposts] = useState(repostCount);
  const [showCW, setShowCW] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // One request per action at a time; a double tap must not insert twice or
  // race an insert against a delete.
  const pending = useRef<Record<PendingAction, boolean>>({ like: false, repost: false, bookmark: false, report: false, delete: false });
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

  // Feeds load quoted posts with the page. Only a caller that did not (and
  // passes undefined) makes the card fetch it — once, cached for 10 minutes.
  const needsQuotedFetch = quotedPostProp === undefined && !!post.quoted_post_id && !anonymous;
  const { data: fetchedQuote } = useQuery({
    queryKey: ['quoted-post', post.quoted_post_id, user?.id],
    queryFn: () => fetchQuotedPost(post.quoted_post_id as string),
    enabled: needsQuotedFetch,
    staleTime: 10 * 60_000,
  });
  const quotedPost = quotedPostProp === undefined ? fetchedQuote ?? null : quotedPostProp;

  const begin = (action: PendingAction) => {
    if (pending.current[action]) return false;
    pending.current[action] = true;
    return true;
  };
  const end = (action: PendingAction) => {
    pending.current[action] = false;
  };

  const failToast = (error: unknown, fallback = "that did not save. try again.") => {
    toast({ title: friendlyDbError(error, fallback), variant: "destructive" });
  };

  // Every other list showing this post is now stale. Mark it, but do not
  // refetch now: this card already shows the new state, and a refetch would
  // only make the feed flicker. Lists refetch when they are next opened.
  const markStale = () => {
    for (const root of [...FEED_QUERY_ROOTS, "liked-posts"]) {
      void queryClient.invalidateQueries({ queryKey: [root], refetchType: "none" });
    }
    void queryClient.invalidateQueries({ queryKey: ["post", post.id], refetchType: "none" });
    void queryClient.invalidateQueries({ queryKey: ["post-stats", post.id], refetchType: "none" });
  };

  const handleLike = async () => {
    if (!user || !begin("like")) return;
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(!prevLiked);
    setLikeCount(prevLiked ? prevCount - 1 : prevCount + 1);
    if (!prevLiked) setBurst(b => b + 1);
    try {
      if (prevLiked) {
        const { error } = await supabase.from('post_likes').delete().match({ post_id: post.id, user_id: user.id });
        if (error) throw error;
      } else {
        // The like → notification fan-out happens in a database trigger.
        const { error } = await supabase.from('post_likes').insert({ post_id: post.id, user_id: user.id });
        // Already liked elsewhere (another tab): the end state is what we wanted.
        if (error && !isUniqueViolation(error)) throw error;
        if (error) setLikeCount(prevCount);
      }
      markStale();
    } catch (error) {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      failToast(error);
    } finally {
      end("like");
    }
  };

  const handleRepost = async () => {
    if (!user || !begin("repost")) return;
    const prevReposted = reposted;
    const prevCount = reposts;
    setReposted(!prevReposted);
    setReposts(prevReposted ? prevCount - 1 : prevCount + 1);
    try {
      if (prevReposted) {
        const { error } = await supabase.from('reposts').delete().match({ post_id: post.id, user_id: user.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('reposts').insert({ post_id: post.id, user_id: user.id });
        if (error && !isUniqueViolation(error)) throw error;
        if (error) setReposts(prevCount);
      }
      markStale();
    } catch (error) {
      setReposted(prevReposted);
      setReposts(prevCount);
      failToast(error);
    } finally {
      end("repost");
    }
  };

  const handleQuotePost = () => {
    navigate('/dashboard', { state: { quotePostId: post.id, compose: true } });
  };

  const handleBookmark = async () => {
    if (!user || !begin("bookmark")) return;
    const prev = bookmarked;
    setBookmarked(!prev);
    try {
      if (prev) {
        const { error } = await supabase.from('bookmarks').delete().match({ post_id: post.id, user_id: user.id });
        if (error) throw error;
        toast({ title: "removed from bookmarks" });
      } else {
        const { error } = await supabase.from('bookmarks').insert({ post_id: post.id, user_id: user.id });
        if (error && !isUniqueViolation(error)) throw error;
        toast({ title: "saved to bookmarks" });
      }
      markStale();
    } catch (error) {
      setBookmarked(prev);
      failToast(error);
    } finally {
      end("bookmark");
    }
  };

  const handleFlag = async () => {
    if (!user || !begin("report")) return;
    try {
      const { error } = await supabase.from('post_flags').insert({ post_id: post.id, user_id: user.id, reason: 'reported' });
      if (error) {
        if (isUniqueViolation(error)) toast({ title: "you already reported this" });
        else if (isRateLimitError(error)) toast({ title: SLOW_DOWN, variant: "destructive" });
        else toast({ title: "could not report this post", description: "try again in a moment.", variant: "destructive" });
        return;
      }
      toast({ title: "reported", description: "thanks. someone will look at it." });
    } finally {
      end("report");
    }
  };

  const handleDelete = async () => {
    if (!user || post.user_id !== user.id || !begin("delete")) return;
    try {
      // Likes, bookmarks, comments, notifications, flags, reposts and polls
      // all cascade from the post row.
      const { data, error } = await supabase
        .from('posts')
        .delete()
        .eq('id', post.id)
        .eq('user_id', user.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("nothing deleted");

      // Media objects do not cascade; remove the author's own files.
      const paths = (post.media_urls ?? [])
        .map((u) => extractStorageObjectPath('post-media', u))
        .filter((p) => p && p.startsWith(`${user.id}/`));
      if (paths.length > 0) void supabase.storage.from('post-media').remove(paths);

      for (const root of FEED_QUERY_ROOTS) queryClient.invalidateQueries({ queryKey: [root] });
      queryClient.removeQueries({ queryKey: ['post', post.id] });
      toast({ title: "post deleted" });
    } catch (error) {
      failToast(error, "could not delete this post. try again.");
    } finally {
      end("delete");
      setConfirmDelete(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/post/${post.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'a post on bosley', text: post.content.substring(0, 100), url: shareUrl });
      } catch {
        /* user dismissed the share sheet */
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast({ title: "link copied" });
      } catch {
        toast({ title: "could not copy the link", description: shareUrl });
      }
    }
  };

  const handlePostClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    // React bubbles events out of portals (menus, dialogs) to this article even
    // though the DOM node is elsewhere; only clicks on the card itself navigate.
    if (!e.currentTarget.contains(target)) return;
    if (target.closest('a, button, input, textarea, video, [role="button"], [role="menuitem"], [role="menu"]')) return;
    navigate(`/post/${post.id}`);
  };

  const hasCW = post.content_warning || post.is_nsfw;
  const name = post.profiles?.display_name || post.profiles?.username || "someone";
  const media = post.media_urls ?? [];
  const showPoll = !anonymous && (hasPoll ?? true);

  return (
    <article className="row px-5 sm:px-8 py-5 cursor-pointer [content-visibility:auto] [contain-intrinsic-size:auto_220px]" onClick={handlePostClick}>
      {repostedBy && (
        <p className="flex items-center gap-1.5 text-foreground/40 text-[12px] font-light mb-3 pl-[52px]">
          <Repeat2 className="w-3 h-3" /> {repostedBy} reposted
        </p>
      )}

      <div className="flex items-start gap-4">
        <Link to={`/user/${post.profiles?.username}`} className="flex-shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
          <UserAvatar avatarUrl={anonymous ? null : post.profiles?.avatar_url} username={post.profiles?.username} name={post.profiles?.display_name} size="md" />
        </Link>

        <div className="flex-1 min-w-0">
          {/* Byline: who (a step heavier than the words), handle, when. */}
          <div className="flex items-baseline justify-between gap-3">
            <p className="flex items-baseline gap-x-2 min-w-0 text-[14px] font-light leading-none">
              <Link
                to={`/user/${post.profiles?.username}`}
                onClick={(e) => e.stopPropagation()}
                className="text-foreground font-normal tracking-[-0.005em] truncate hover:underline underline-offset-4 decoration-foreground/40"
              >
                {name}
              </Link>
              <span className="text-foreground/35 truncate">@{post.profiles?.username || "user"}</span>
              <span className="text-foreground/30 num whitespace-nowrap">{formatDate(post.created_at)}</span>
              {(post.edit_count ?? 0) > 0 && <span className="text-foreground/30">edited</span>}
              {(post.circle_ids?.length ?? 0) > 0 && (
                <span className="text-foreground/30 inline-flex items-center gap-1" title="limited audience">
                  <Users className="w-3 h-3" />
                </span>
              )}
            </p>

            {user && (
              <DropdownMenu
                open={menuOpen}
                onOpenChange={(open) => { setMenuOpen(open); if (!open) setConfirmDelete(false); }}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="more"
                    onClick={(e) => e.stopPropagation()}
                    className="quiet -mt-1 -mr-2 p-2 rounded-md [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus:opacity-100 [article:hover_&]:opacity-100"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="glass-panel rounded-md border min-w-[160px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {!confirmDelete && (
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); void handleFlag(); }}
                      className="text-foreground/80 text-[13px]"
                    >
                      <Flag className="w-3.5 h-3.5 mr-2" /> report
                    </DropdownMenuItem>
                  )}
                  {user.id === post.user_id && (
                    <>
                      {!confirmDelete && <DropdownMenuSeparator />}
                      {confirmDelete ? (
                        <>
                          <p className="px-2 py-1.5 text-[13px] font-light text-foreground/60">delete?</p>
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); void handleDelete(); }}
                            className="text-destructive focus:text-destructive text-[13px]"
                          >
                            yes, delete
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(e) => { e.preventDefault(); setConfirmDelete(false); }}
                            onClick={(e) => e.stopPropagation()}
                            className="text-foreground/80 text-[13px]"
                          >
                            no
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem
                          // Keep the menu open and ask first.
                          onSelect={(e) => { e.preventDefault(); setConfirmDelete(true); }}
                          onClick={(e) => e.stopPropagation()}
                          className="text-destructive focus:text-destructive text-[13px]"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" /> delete
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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

              {media.length > 0 && (anonymous ? (
                <p className="mt-3 text-[13px] font-light text-foreground/40">{describeMedia(media)}</p>
              ) : (
                <div className={`grid gap-1.5 mt-4 ${media.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                  {media.map((url, idx) => {
                    return isVideoUrl(url) ? (
                      <StorageMedia key={idx} bucket="post-media" value={url} kind="video" className="max-h-[480px] rounded-md overflow-hidden" />
                    ) : (
                      <StorageMedia
                        key={idx}
                        bucket="post-media"
                        value={url}
                        kind="image"
                        alt=""
                        aspectClassName={media.length === 1 ? "aspect-[4/3] max-h-[480px]" : "aspect-square"}
                      />
                    );
                  })}
                </div>
              ))}

              {quotedPost && (
                <div
                  role="link"
                  tabIndex={0}
                  className="mt-4 pl-4 border-l border-foreground/20 hover:border-foreground/50 transition-colors"
                  onClick={(e) => { e.stopPropagation(); navigate(`/post/${quotedPost.id}`); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); navigate(`/post/${quotedPost.id}`); } }}
                >
                  <p className="text-[13px] font-light text-foreground/50">
                    @{quotedPost.profiles?.username || "user"} <span className="text-foreground/30">· {formatDate(quotedPost.created_at)}</span>
                  </p>
                  <p className="mt-1 text-foreground/75 text-[14px] font-light leading-relaxed line-clamp-3">
                    {quotedPost.content_warning || quotedPost.is_nsfw
                      ? <span className="text-foreground/50">{quotedPost.content_warning || "sensitive content"}</span>
                      : quotedPost.content}
                  </p>
                </div>
              )}
              {!quotedPost && post.quoted_post_id && quotedPostProp === null && (
                <p className="mt-4 pl-4 border-l border-foreground/10 text-[13px] font-light text-foreground/40">
                  the quoted post is not available.
                </p>
              )}
            </>
          )}

          {showPoll && <PollDisplay postId={post.id} />}

          {/* Actions: quiet at rest, no colour coding. Counts are facts, not rewards. */}
          <div className="flex items-center gap-1 mt-3 -ml-2 text-[12px] tabular-nums">
            <button
              onClick={handleLike}
              aria-pressed={liked}
              aria-label={liked ? "unlike" : "like"}
              className="quiet inline-flex items-center gap-1.5 h-8 [@media(pointer:coarse)]:h-10 px-2 rounded-md"
            >
              <span className="relative inline-flex">
                <span
                  key={`heart-${burst}`}
                  className={`inline-flex ${liked && burst > 0 ? "animate-like-pop motion-reduce:animate-none" : ""}`}
                >
                  <Heart className={`w-[15px] h-[15px] ${liked ? "fill-current" : ""}`} />
                </span>
                {burst > 0 && liked && [0, 1, 2, 3, 4, 5].map((i) => {
                  const angle = (i / 6) * Math.PI * 2;
                  return (
                    <span
                      key={`spark-${burst}-${i}`}
                      aria-hidden
                      className="absolute left-1/2 top-1/2 w-1 h-1 rounded-full bg-foreground pointer-events-none opacity-0 animate-like-spark motion-reduce:hidden"
                      style={{ "--dx": `${Math.cos(angle) * 16}px`, "--dy": `${Math.sin(angle) * 16}px` } as React.CSSProperties}
                    />
                  );
                })}
              </span>
              <span>{likeCount > 0 ? likeCount : ""}</span>
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/post/${post.id}`); }}
              aria-label="replies"
              className="quiet inline-flex items-center gap-1.5 h-8 [@media(pointer:coarse)]:h-10 px-2 rounded-md"
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
                  disabled={!user}
                  className="quiet inline-flex items-center gap-1.5 h-8 [@media(pointer:coarse)]:h-10 px-2 rounded-md"
                >
                  <Repeat2 className="w-[15px] h-[15px]" />
                  <span>{reposts > 0 ? reposts : ""}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="glass-panel rounded-md border min-w-[160px]" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem className="text-[13px]" onClick={(e) => { e.stopPropagation(); void handleRepost(); }}>
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
              className="quiet inline-flex items-center gap-1.5 h-8 [@media(pointer:coarse)]:h-10 px-2 rounded-md"
            >
              <Bookmark className={`w-[15px] h-[15px] ${bookmarked ? "fill-current" : ""}`} />
            </button>

            <button onClick={handleShare} aria-label="share" className="quiet inline-flex items-center gap-1.5 h-8 [@media(pointer:coarse)]:h-10 px-2 rounded-md ml-auto">
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
