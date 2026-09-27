import { memo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Heart, MessageCircle, Bookmark, Share2, 
  MoreHorizontal, Flag, History, Trash2, Users, Repeat2,
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

  return (
    <article
      className="glass-card lift rounded-xl p-4 sm:p-5 cursor-pointer"
      onClick={handlePostClick}
    >
      {/* Reposted by indicator */}
      {repostedBy && (
        <div className="flex items-center gap-2 text-foreground/55 text-xs font-medium mb-2.5 ml-[3.25rem]">
          <Repeat2 className="w-3.5 h-3.5" />
          <span>{repostedBy} reposted</span>
        </div>
      )}

      <div className="flex items-start gap-3">
        <Link to={`/user/${post.profiles?.username}`} className="flex-shrink-0">
          <UserAvatar
            avatarUrl={post.profiles?.avatar_url}
            username={post.profiles?.username}
            size="md"
          />
        </Link>
        
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-x-1.5 gap-y-0.5 flex-wrap min-w-0">
              <Link 
                to={`/user/${post.profiles?.username}`}
                className="text-foreground text-[0.9375rem] font-semibold tracking-[-0.01em] hover:underline underline-offset-2 truncate"
              >
                {post.profiles?.display_name || post.profiles?.username || 'Anonymous'}
              </Link>
              <span className="text-foreground/50 text-sm truncate">
                @{post.profiles?.username || 'user'}
              </span>
              <span className="text-foreground/30 text-sm">·</span>
              <span className="text-foreground/50 text-sm tabular-nums">
                {formatDate(post.created_at)}
              </span>
              {(post.edit_count ?? 0) > 0 && (
                <span className="text-foreground/45 text-xs flex items-center gap-1">
                  <History className="w-3 h-3" />
                  edited
                </span>
              )}
              {(post.circle_ids?.length ?? 0) > 0 && (
                <span className="text-foreground/45 text-xs flex items-center gap-1" title="Limited audience">
                  <Users className="w-3 h-3" />
                </span>
              )}
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full text-foreground/40 hover:text-foreground hover:bg-foreground/10">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-panel rounded-xl border">
                <DropdownMenuItem onClick={handleFlag} className="text-foreground/70">
                  <Flag className="w-4 h-4 mr-2" />
                  Flag post
                </DropdownMenuItem>
                {user?.id === post.user_id && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete post
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {/* Content warning overlay */}
          {hasCW && !showCW ? (
            <div className="glass-inset rounded-xl p-5 mb-3 text-center">
              <p className="text-foreground/70 text-sm mb-3">
                {post.content_warning || 'Sensitive content (NSFW)'}
              </p>
              <Button variant="glass" size="sm" onClick={(e) => { e.stopPropagation(); setShowCW(true); }} className="rounded-lg">
                Show content
              </Button>
            </div>
          ) : (
            <>
              {/* Post content */}
              <div className="text-foreground/90 text-[0.9375rem] leading-[1.6] whitespace-pre-wrap mb-3 [overflow-wrap:anywhere]">
                <FormattedContent content={post.content} />
              </div>
              
              {/* Media */}
              {post.media_urls && post.media_urls.length > 0 && (
                <div className={`grid gap-2 mb-3 ${post.media_urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {post.media_urls.map((url, idx) => {
                    const isVideo = url.includes('.mp4') || url.includes('.webm') || url.includes('.mov') || url.includes('.avi');
                    return isVideo ? (
                      <StorageMedia key={idx} bucket="post-media" value={url} kind="video" className="max-h-96" />
                    ) : (
                      <StorageMedia key={idx} bucket="post-media" value={url} kind="image" alt="" imgClassName="w-full rounded-[0.625rem] object-cover max-h-96" />
                    );
                  })}
                </div>
              )}

              {/* Quoted post */}
              {quotedPost && (
                <div 
                  className="glass-inset rounded-xl p-3 mb-3 transition-colors duration-200 hover:bg-foreground/[0.07]"
                  onClick={(e) => { e.stopPropagation(); navigate(`/post/${quotedPost.id}`); }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-foreground/70 text-sm font-medium">
                      @{quotedPost.profiles?.username}
                    </span>
                    <span className="text-foreground/45 text-xs">{formatDate(quotedPost.created_at)}</span>
                  </div>
                  <p className="text-foreground/75 text-sm leading-relaxed line-clamp-3">
                    {quotedPost.content}
                  </p>
                </div>
              )}
            </>
          )}
          
          <PollDisplay postId={post.id} />
          
          {/* Actions */}
          <div className="flex items-center justify-between mt-2 -ml-2">
            <div className="flex items-center gap-0.5 sm:gap-1">
              {/* Like */}
              <Button
                variant="ghost" size="sm" onClick={handleLike}
                aria-pressed={liked}
                aria-label={liked ? 'Unlike post' : 'Like post'}
                className={`gap-1.5 px-2 sm:px-2.5 h-8 rounded-full hover:bg-rose-500/10 ${liked ? 'text-rose-500' : 'text-foreground/50 hover:text-rose-400'}`}
              >
                <span className="relative inline-flex">
                  <motion.span
                    key={`heart-${burst}-${liked}`}
                    initial={liked && burst > 0 ? { scale: 0.6 } : false}
                    animate={liked && burst > 0 ? { scale: [0.6, 1.4, 1] } : { scale: 1 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  >
                    <Heart className={`w-4 h-4 ${liked ? 'fill-current text-rose-500' : ''}`} />
                  </motion.span>
                  <AnimatePresence>
                    {burst > 0 && liked && (
                      <>
                        {[...Array(6)].map((_, i) => {
                          const angle = (i / 6) * Math.PI * 2;
                          return (
                            <motion.span
                              key={`spark-${burst}-${i}`}
                              initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
                              animate={{
                                x: Math.cos(angle) * 18,
                                y: Math.sin(angle) * 18,
                                opacity: 0,
                                scale: 0.2,
                              }}
                              transition={{ duration: 0.6, ease: "easeOut" }}
                              className="absolute left-1/2 top-1/2 w-1 h-1 rounded-full bg-rose-400 pointer-events-none"
                            />
                          );
                        })}
                      </>
                    )}
                  </AnimatePresence>
                </span>
                <span className="text-xs font-medium tabular-nums">{likeCount > 0 ? likeCount : ''}</span>
              </Button>
              
              {/* Comment */}
              <Button
                variant="ghost" size="sm"
                onClick={(e) => { e.stopPropagation(); navigate(`/post/${post.id}`); }}
                aria-label="View replies"
                className="gap-1.5 px-2 sm:px-2.5 h-8 rounded-full text-foreground/50 hover:text-sky-400 hover:bg-sky-500/10"
              >
                <MessageCircle className="w-4 h-4" />
                <span className="text-xs font-medium tabular-nums">{commentsCount > 0 ? commentsCount : ''}</span>
              </Button>

              {/* Repost */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost" size="sm"
                    aria-label="Repost"
                    className={`gap-1.5 px-2 sm:px-2.5 h-8 rounded-full hover:bg-emerald-500/10 ${reposted ? 'text-emerald-400' : 'text-foreground/50 hover:text-emerald-400'}`}
                  >
                    <Repeat2 className="w-4 h-4" />
                    <span className="text-xs font-medium tabular-nums">{reposts > 0 ? reposts : ''}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="glass-panel rounded-xl border">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRepost(); }}>
                    <Repeat2 className="w-4 h-4 mr-2" />
                    {reposted ? 'Undo repost' : 'Repost'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleQuotePost(); }}>
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Quote post
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Bookmark */}
              <Button
                variant="ghost" size="sm" onClick={handleBookmark}
                aria-pressed={bookmarked}
                aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark post'}
                className={`gap-1.5 px-2 sm:px-2.5 h-8 rounded-full hover:bg-signal/10 ${bookmarked ? 'text-signal' : 'text-foreground/50 hover:text-signal'}`}
              >
                <Bookmark className={`w-4 h-4 ${bookmarked ? 'fill-current' : ''}`} />
              </Button>
              
              {/* Share */}
              <Button
                variant="ghost" size="sm" onClick={handleShare}
                aria-label="Share post"
                className="gap-1.5 px-2 sm:px-2.5 h-8 rounded-full text-foreground/50 hover:text-foreground hover:bg-foreground/10"
              >
                <Share2 className="w-4 h-4" />
              </Button>
            </div>
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
