import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import UserAvatar from "@/components/UserAvatar";
import StorageMedia from "@/components/media/StorageMedia";
import CommentItem from "@/components/post/CommentItem";
import FormattedContent from "@/components/feed/FormattedContent";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import PollDisplay from "@/components/polls/PollDisplay";
import { friendlyDbError, isUniqueViolation, isRateLimitError, SLOW_DOWN } from "@/lib/dbErrors";
import { Button } from "@/components/ui/button";
import {
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  MoreHorizontal,
  Flag,
  Loader2,
  Edit2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { FEED_QUERY_ROOTS } from "@/lib/postFeed";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  parent_id: string | null;
  profiles?: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  replies?: Comment[];
  likesCount?: number;
  isLiked?: boolean;
}

const REPLY_MAX = 500;
/** posts.content: 500 characters, or 25,000 for a long-form post. */
const POST_MAX = 500;
const LONG_FORM_MAX = 25_000;
/** Replies load newest-first in windows of this size; "earlier replies" widens it. */
const COMMENT_PAGE = 100;

type PostStats = {
  likesCount: number;
  commentsCount: number;
  repostCount: number;
  isLiked: boolean;
  isReposted: boolean;
  isBookmarked: boolean;
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  }).toLowerCase();
};

const PostSkeleton = () => (
  <div aria-busy="true" aria-label="loading post">
    <div className="row px-5 sm:px-8 py-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-foreground/[0.07] animate-pulse shrink-0" />
        <div className="flex-1 space-y-3 pt-1">
          <div className="flex items-center gap-2">
            <div className="h-3 w-24 rounded bg-foreground/[0.08] animate-pulse" />
            <div className="h-3 w-14 rounded bg-foreground/[0.05] animate-pulse" />
          </div>
          <div className="h-4 w-full rounded bg-foreground/[0.06] animate-pulse" />
          <div className="h-4 w-5/6 rounded bg-foreground/[0.06] animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-foreground/[0.06] animate-pulse" />
        </div>
      </div>
    </div>
    {[0, 1].map((i) => (
      <div key={i} className="row px-5 sm:px-8 py-4 flex items-start gap-4">
        <div className="w-7 h-7 rounded-full bg-foreground/[0.07] animate-pulse shrink-0" />
        <div className="flex-1 space-y-2.5 pt-1">
          <div className="h-3 w-32 rounded bg-foreground/[0.08] animate-pulse" />
          <div className="h-3 w-3/4 rounded bg-foreground/[0.06] animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

const PostDetail = () => {
  const { postId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [isEditingPost, setIsEditingPost] = useState(false);
  const [editedPostContent, setEditedPostContent] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [showSensitive, setShowSensitive] = useState(false);
  const [commentLimit, setCommentLimit] = useState(COMMENT_PAGE);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  // One in-flight write per action (and per comment for comment likes).
  const pendingPost = useRef<{ like: boolean; bookmark: boolean }>({ like: false, bookmark: false });
  const pendingCommentLikes = useRef(new Set<string>());
  // Feeds hold their own copy of this post's counts and the viewer's state;
  // mark them stale so going back shows what changed here.
  const invalidateFeeds = useCallback(() => {
    for (const root of FEED_QUERY_ROOTS) queryClient.invalidateQueries({ queryKey: [root] });
    queryClient.invalidateQueries({ queryKey: ['liked-posts'] });
  }, [queryClient]);

  // Fetch post
  const { data: post, isLoading: loadingPost } = useQuery({
    queryKey: ['post', postId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single();

      if (error) throw error;

      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .eq('user_id', data.user_id)
        .maybeSingle();

      return { ...data, profiles: profile };
    },
    enabled: !!postId
  });

  // The signed-in person's face, for the reply line.
  const { data: myProfile } = useQuery({
    queryKey: ['my-avatar', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    staleTime: 10 * 60_000,
  });

  // Fetch comments with threading and likes: the newest `commentLimit`, shown
  // oldest first, with "earlier replies" to widen the window.
  const { data: commentsData, isLoading: loadingComments, isFetching: fetchingComments } = useQuery({
    queryKey: ['comments', postId, user?.id, commentLimit],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data: newestFirst, error } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: false })
        .limit(commentLimit + 1);

      if (error) throw error;
      const hasEarlier = (newestFirst?.length ?? 0) > commentLimit;
      const rows = (newestFirst ?? []).slice(0, commentLimit).reverse();
      if (rows.length === 0) return { roots: [] as Comment[], hasEarlier: false };

      const userIds = [...new Set(rows.map(c => c.user_id))];
      const commentIds = rows.map(c => c.id);
      const [profilesRes, likesRes, userLikesRes] = await Promise.all([
        supabase.from('profiles').select('user_id, username, display_name, avatar_url').in('user_id', userIds),
        supabase.from('comment_likes').select('comment_id').in('comment_id', commentIds),
        user
          ? supabase.from('comment_likes').select('comment_id').eq('user_id', user.id).in('comment_id', commentIds)
          : Promise.resolve({ data: [] as { comment_id: string }[], error: null }),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (likesRes.error) throw likesRes.error;
      if (userLikesRes.error) throw userLikesRes.error;

      const profilesMap = new Map(profilesRes.data?.map(p => [p.user_id, p]) || []);
      const likesCountMap = new Map<string, number>();
      likesRes.data?.forEach(l => {
        likesCountMap.set(l.comment_id, (likesCountMap.get(l.comment_id) || 0) + 1);
      });
      const userLikedSet = new Set(userLikesRes.data?.map(l => l.comment_id) || []);

      const commentMap = new Map<string, Comment>();
      const rootComments: Comment[] = [];

      rows.forEach(c => {
        commentMap.set(c.id, {
          ...c,
          profiles: profilesMap.get(c.user_id) || null,
          replies: [],
          likesCount: likesCountMap.get(c.id) || 0,
          isLiked: userLikedSet.has(c.id)
        });
      });

      rows.forEach(c => {
        const comment = commentMap.get(c.id)!;
        const parent = c.parent_id ? commentMap.get(c.parent_id) : undefined;
        // A reply whose parent is outside the loaded window shows at top level
        // rather than disappearing.
        if (parent) parent.replies!.push(comment);
        else rootComments.push(comment);
      });

      return { roots: rootComments, hasEarlier };
    },
    enabled: !!postId
  });
  const comments = commentsData?.roots;

  // Realtime comments subscription
  useEffect(() => {
    if (!postId) return;

    const channel = supabase
      .channel(`comments-${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `post_id=eq.${postId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['comments', postId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId, queryClient]);

  // Counts and the viewer's own state, in one call (same RPC as the feeds).
  const statsKey = ['post-stats', postId, user?.id] as const;
  const { data: postStats } = useQuery({
    queryKey: statsKey,
    queryFn: async (): Promise<PostStats> => {
      const { data, error } = await supabase.rpc('get_post_stats', { post_ids: [postId as string] });
      if (error) throw error;
      const s = data?.[0];
      return {
        likesCount: Number(s?.likes_count) || 0,
        commentsCount: Number(s?.comments_count) || 0,
        repostCount: Number(s?.reposts_count) || 0,
        isLiked: !!s?.liked,
        isReposted: !!s?.reposted,
        isBookmarked: !!s?.bookmarked,
      };
    },
    enabled: !!postId && !!user
  });

  // Edit post mutation: the update must succeed before history is written,
  // so a refused edit never leaves a phantom "previous version".
  const editPost = useMutation({
    mutationFn: async (content: string) => {
      if (!user || !postId) throw new Error("Not authenticated");
      const max = post?.is_long_form ? LONG_FORM_MAX : POST_MAX;
      if (content.length > max) throw new Error(`posts can be up to ${max.toLocaleString()} characters.`);
      const previousContent = post?.content;

      const { data: updated, error } = await supabase
        .from('posts')
        .update({
          content,
          last_edited_at: new Date().toISOString(),
          edit_count: (post?.edit_count || 0) + 1
        })
        .eq('id', postId)
        .eq('user_id', user.id)
        .select('id');

      if (error) throw error;
      if (!updated || updated.length === 0) throw new Error("this post could not be edited.");

      if (previousContent && previousContent !== content) {
        const { error: historyError } = await supabase.from('post_edits').insert({
          post_id: postId,
          edited_by: user.id,
          previous_content: previousContent
        });
        if (historyError) return { historySaved: false };
      }
      return { historySaved: true };
    },
    onSuccess: (result) => {
      setIsEditingPost(false);
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      invalidateFeeds();
      if (result.historySaved) {
        toast({ title: "post updated" });
      } else {
        toast({ title: "post updated", description: "the earlier version could not be kept in its history.", variant: "destructive" });
      }
    },
    onError: (error) => {
      toast({
        title: "could not save",
        description: isRateLimitError(error) ? SLOW_DOWN : error.message,
        variant: "destructive",
      });
    }
  });

  // Add comment mutation
  const addComment = useMutation({
    mutationFn: async ({ content, parentId }: { content: string; parentId?: string }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from('comments').insert({
        content,
        post_id: postId,
        user_id: user.id,
        parent_id: parentId || null
      });

      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      if (vars.parentId) setReplyingTo(null);
      else setComment("");
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['post-stats', postId] });
      invalidateFeeds();
      toast({ title: "reply sent" });
    },
    onError: (error) => {
      toast({ title: "could not send", description: isRateLimitError(error) ? SLOW_DOWN : error.message, variant: "destructive" });
    }
  });

  // Edit comment mutation
  const editComment = useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from('comments')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', commentId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      setEditingCommentId(null);
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      toast({ title: "reply updated" });
    },
    onError: (error) => {
      toast({ title: "could not save", description: error.message, variant: "destructive" });
    }
  });

  // Delete comment mutation
  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['post-stats', postId] });
      invalidateFeeds();
      toast({ title: "reply deleted" });
    },
    onError: (error) => {
      toast({ title: "could not delete", description: error.message, variant: "destructive" });
    }
  });

  // Stable callbacks, so memoised CommentItems only re-render when their own
  // comment (or the editing / replying target) changes.
  const handleCommentLike = useCallback(async (commentId: string, isLiked: boolean) => {
    if (!user || pendingCommentLikes.current.has(commentId)) return;
    pendingCommentLikes.current.add(commentId);
    try {
      const { error } = isLiked
        ? await supabase.from('comment_likes').delete().match({ comment_id: commentId, user_id: user.id })
        : await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: user.id });
      if (error && !(isUniqueViolation(error) && !isLiked)) {
        toast({ title: friendlyDbError(error, "that did not save. try again."), variant: "destructive" });
      }
    } finally {
      pendingCommentLikes.current.delete(commentId);
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
    }
  }, [user, postId, queryClient, toast]);

  const handleStartEdit = useCallback((commentId: string) => setEditingCommentId(commentId), []);
  const handleCancelEdit = useCallback(() => setEditingCommentId(null), []);
  const { mutate: editCommentMutate } = editComment;
  const handleSaveEdit = useCallback(
    (commentId: string, content: string) => editCommentMutate({ commentId, content }),
    [editCommentMutate],
  );
  const { mutate: deleteCommentMutate } = deleteComment;
  const handleDeleteComment = useCallback((commentId: string) => deleteCommentMutate(commentId), [deleteCommentMutate]);
  const handleToggleReply = useCallback(
    (commentId: string) => setReplyingTo((current) => (current === commentId ? null : commentId)),
    [],
  );
  const { mutate: addCommentMutate } = addComment;
  const handleSendReply = useCallback(
    (parentId: string, content: string) => addCommentMutate({ content, parentId }),
    [addCommentMutate],
  );

  /** Optimistic toggle of the viewer's like/bookmark, rolled back on failure. */
  const toggleOwnState = async (action: 'like' | 'bookmark') => {
    if (!user || !postId || !postStats || pendingPost.current[action]) return;
    pendingPost.current[action] = true;
    const previous = postStats;
    const wasOn = action === 'like' ? previous.isLiked : previous.isBookmarked;
    queryClient.setQueryData<PostStats>(statsKey, action === 'like'
      ? { ...previous, isLiked: !wasOn, likesCount: previous.likesCount + (wasOn ? -1 : 1) }
      : { ...previous, isBookmarked: !wasOn });
    const table = action === 'like' ? 'post_likes' : 'bookmarks';
    try {
      const { error } = wasOn
        ? await supabase.from(table).delete().match({ post_id: postId, user_id: user.id })
        : await supabase.from(table).insert({ post_id: postId, user_id: user.id });
      if (error && !(isUniqueViolation(error) && !wasOn)) throw error;
      if (action === 'bookmark') {
        toast({ title: wasOn ? "removed from bookmarks" : "bookmarked" });
        queryClient.invalidateQueries({ queryKey: ['bookmarks'], refetchType: 'none' });
      }
    } catch (error) {
      queryClient.setQueryData<PostStats>(statsKey, previous);
      toast({ title: friendlyDbError(error, "that did not save. try again."), variant: "destructive" });
    } finally {
      pendingPost.current[action] = false;
      queryClient.invalidateQueries({ queryKey: ['post-stats', postId] });
      invalidateFeeds();
    }
  };

  const handleLike = () => toggleOwnState('like');
  const handleBookmark = () => toggleOwnState('bookmark');

  const handleReport = async () => {
    if (!user || !postId) return;
    const { error } = await supabase
      .from('post_flags')
      .insert({ post_id: postId, user_id: user.id, reason: 'reported' });
    if (error) {
      if (isUniqueViolation(error)) toast({ title: "you already reported this" });
      else if (isRateLimitError(error)) toast({ title: SLOW_DOWN, variant: "destructive" });
      else toast({ title: "could not report this post", description: "try again in a moment.", variant: "destructive" });
      return;
    }
    toast({ title: "reported", description: "thanks. someone will look at it." });
  };

  const focusCommentInput = () => {
    commentInputRef.current?.focus();
    commentInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/post/${postId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'a post on Bosley', url: shareUrl });
      } catch {
        /* user dismissed the share sheet */
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "link copied" });
    }
  };

  const startEditingPost = () => {
    setEditedPostContent(post?.content || '');
    setIsEditingPost(true);
  };

  // history.length counts pages from other sites too; only step back when
  // this app put an entry before this one (the first entry has key "default").
  const goBack = () => {
    if (location.key !== "default") navigate(-1);
    else navigate('/dashboard');
  };

  const backAction = (
    <button type="button" onClick={goBack} className="quiet text-[13px] px-2 h-9 rounded-md">
      ← back
    </button>
  );

  if (loadingPost) {
    return (
      <DashboardLayout>
        <PageHeader title="post" actions={backAction} />
        <PostSkeleton />
      </DashboardLayout>
    );
  }

  if (!post) {
    return (
      <DashboardLayout>
        <PageHeader title="post" subtitle="nothing at this address." actions={backAction} />
        <EmptyState
          title="this post is gone."
          description="it was deleted, or the link is wrong."
          actionLabel="back to the feed"
          actionTo="/dashboard"
        />
      </DashboardLayout>
    );
  }

  const isPostOwner = user?.id === post.user_id;
  const authorName = post.profiles?.display_name || post.profiles?.username || "someone";
  const authorHandle = post.profiles?.username || "user";
  // Every reply in the thread, nested ones included, so the number matches the
  // feed card. The server count covers replies outside the loaded window.
  const countReplies = (list?: Comment[]): number =>
    (list ?? []).reduce((n, c) => n + 1 + countReplies(c.replies), 0);
  const replyCount = postStats?.commentsCount ?? countReplies(comments);
  const editMax = post.is_long_form ? LONG_FORM_MAX : POST_MAX;
  const isSensitive = !!(post.content_warning || post.is_nsfw);
  const composerOpen = composerFocused || comment.length > 0;
  const canReply = comment.trim().length > 0 && !addComment.isPending;
  const canSavePost = editedPostContent.trim().length > 0 && editedPostContent.length <= editMax && !editPost.isPending;

  return (
    <DashboardLayout>
      <PageHeader title="post" subtitle={`by ${authorName}. ${replyCount === 1 ? "one reply." : `${replyCount} replies.`}`} actions={backAction} />

      {/* The post itself: a larger body, quiet actions, nothing boxed. */}
      <article className="row px-5 sm:px-8 py-6">
        <div className="flex items-start gap-4">
          <Link to={`/user/${authorHandle}`} className="shrink-0 mt-0.5">
            <UserAvatar avatarUrl={post.profiles?.avatar_url} username={post.profiles?.username} size="md" />
          </Link>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="flex items-baseline gap-x-2 min-w-0 text-[14px] font-light leading-none">
                <Link to={`/user/${authorHandle}`} className="text-foreground truncate hover:underline underline-offset-4 decoration-foreground/40">
                  {authorName}
                </Link>
                <span className="text-foreground/40 truncate">@{authorHandle}</span>
                <span className="text-foreground/30 tabular-nums whitespace-nowrap">{formatDate(post.created_at)}</span>
                {(post.edit_count ?? 0) > 0 && (
                  <span className="text-foreground/30" title={post.last_edited_at ? `edited ${formatDate(post.last_edited_at)}` : "edited"}>
                    edited
                  </span>
                )}
              </p>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="more" className="quiet -mt-1.5 -mr-2 p-2 rounded-md">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="glass-panel rounded-md border min-w-[160px]">
                  {isPostOwner && (
                    <>
                      <DropdownMenuItem onClick={startEditingPost} className="text-foreground/80 text-[13px]">
                        <Edit2 className="w-3.5 h-3.5 mr-2" /> edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={handleReport} className="text-foreground/80 text-[13px]">
                    <Flag className="w-3.5 h-3.5 mr-2" /> report
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {isEditingPost ? (
              <div className="mt-3">
                <label className="sr-only" htmlFor="edit-post">edit post</label>
                <textarea
                  id="edit-post"
                  value={editedPostContent}
                  onChange={(e) => setEditedPostContent(e.target.value)}
                  maxLength={editMax}
                  rows={4}
                  autoFocus
                  className="field w-full text-[17px] font-light leading-[1.7] text-foreground resize-none"
                />
                <div className="mt-3 flex items-center gap-3">
                  <Button variant="signal" size="sm" onClick={() => editPost.mutate(editedPostContent.trim())} disabled={!canSavePost}>
                    {editPost.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    save
                  </Button>
                  <button type="button" onClick={() => setIsEditingPost(false)} className="quiet text-[13px] px-2 h-9 rounded-md">
                    cancel
                  </button>
                  <span
                    className={`ml-auto text-[12px] font-light tabular-nums ${editedPostContent.length > editMax - 20 ? "text-destructive" : "text-foreground/35"}`}
                    aria-live="polite"
                  >
                    {editedPostContent.length}/{editMax}
                  </span>
                </div>
              </div>
            ) : isSensitive && !showSensitive ? (
              <div className="mt-3 py-4 border-y border-foreground/10">
                <p className="text-foreground/60 text-[14px] font-light">{post.content_warning || "sensitive content"}</p>
                <button
                  type="button"
                  onClick={() => setShowSensitive(true)}
                  className="mt-2 text-[13px] text-foreground hover:text-signal transition-colors"
                >
                  show it
                </button>
              </div>
            ) : (
              <div className="mt-3 text-[17px] font-light leading-[1.7] text-foreground/95 whitespace-pre-wrap [overflow-wrap:anywhere]">
                <FormattedContent content={post.content} />
              </div>
            )}

            {(!isSensitive || showSensitive) && post.media_urls && post.media_urls.length > 0 && (
              <div className={`grid gap-1.5 mt-4 ${post.media_urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {post.media_urls.map((url: string, idx: number) => {
                  const isVideo = /\.(mp4|webm|mov|avi)(\?|$)/i.test(url);
                  return isVideo ? (
                    <StorageMedia key={idx} bucket="post-media" value={url} kind="video" className="max-h-[520px] rounded-md overflow-hidden" priority={idx === 0} />
                  ) : (
                    <StorageMedia
                      key={idx}
                      bucket="post-media"
                      value={url}
                      kind="image"
                      alt=""
                      aspectClassName={post.media_urls!.length === 1 ? "aspect-[4/3] max-h-[520px]" : "aspect-square"}
                      priority={idx === 0}
                    />
                  );
                })}
              </div>
            )}

            <PollDisplay postId={post.id} />

            <div className="flex items-center gap-1 mt-4 -ml-2 text-[12px] tabular-nums">
              <button
                type="button"
                onClick={handleLike}
                aria-pressed={!!postStats?.isLiked}
                aria-label={postStats?.isLiked ? "unlike" : "like"}
                className="quiet inline-flex items-center gap-1.5 h-8 px-2 rounded-md"
              >
                <Heart className={`w-[15px] h-[15px] ${postStats?.isLiked ? 'fill-current' : ''}`} />
                <span>{(postStats?.likesCount ?? 0) > 0 ? postStats?.likesCount : ""}</span>
              </button>
              <button
                type="button"
                onClick={focusCommentInput}
                aria-label="write a reply"
                className="quiet inline-flex items-center gap-1.5 h-8 px-2 rounded-md"
              >
                <MessageCircle className="w-[15px] h-[15px]" />
                <span>{replyCount > 0 ? replyCount : ""}</span>
              </button>
              <button
                type="button"
                onClick={handleBookmark}
                aria-pressed={!!postStats?.isBookmarked}
                aria-label={postStats?.isBookmarked ? "remove bookmark" : "bookmark"}
                className="quiet inline-flex items-center gap-1.5 h-8 px-2 rounded-md"
              >
                <Bookmark className={`w-[15px] h-[15px] ${postStats?.isBookmarked ? 'fill-current' : ''}`} />
              </button>
              <button type="button" onClick={handleShare} aria-label="share" className="quiet inline-flex items-center gap-1.5 h-8 px-2 rounded-md ml-auto">
                <Share2 className="w-[15px] h-[15px]" />
              </button>
            </div>
          </div>
        </div>
      </article>

      {/* Reply line: one field with your face beside it; it opens when you touch it. */}
      {user && (
        <div className="row px-5 sm:px-8 py-4">
          <div className="flex items-start gap-4">
            <UserAvatar avatarUrl={myProfile?.avatar_url} username={myProfile?.username} size="md" className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <label className="sr-only" htmlFor="reply-to-post">reply to {authorName}</label>
              <textarea
                id="reply-to-post"
                ref={commentInputRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onFocus={() => setComposerFocused(true)}
                onBlur={() => setComposerFocused(false)}
                placeholder={`reply to ${authorName}.`}
                maxLength={REPLY_MAX}
                rows={composerOpen ? 3 : 1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && canReply) {
                    e.preventDefault();
                    addComment.mutate({ content: comment.trim() });
                  }
                }}
                className="field w-full text-[15px] font-light leading-relaxed text-foreground placeholder:text-foreground/30 resize-none"
              />
              {composerOpen && (
                <div className="mt-3 flex items-center gap-3">
                  <Button variant="signal" size="sm" onClick={() => addComment.mutate({ content: comment.trim() })} disabled={!canReply}>
                    {addComment.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    reply
                  </Button>
                  <span className="text-[12px] font-light text-foreground/35">enter sends. shift+enter for a new line.</span>
                  <span className="ml-auto text-[12px] font-light text-foreground/35 tabular-nums">
                    {comment.length}/{REPLY_MAX}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {loadingComments ? (
        <div aria-busy="true" aria-label="loading replies">
          {[0, 1].map((i) => (
            <div key={i} className="row px-5 sm:px-8 py-4 flex items-start gap-4">
              <div className="w-7 h-7 rounded-full bg-foreground/[0.07] animate-pulse shrink-0" />
              <div className="flex-1 space-y-2.5 pt-1">
                <div className="h-3 w-32 rounded bg-foreground/[0.08] animate-pulse" />
                <div className="h-3 w-3/4 rounded bg-foreground/[0.06] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : comments && comments.length > 0 ? (
        <div className="stagger">
          {commentsData?.hasEarlier && (
            <div className="row px-5 sm:px-8 py-3">
              <button
                type="button"
                onClick={() => setCommentLimit((n) => n + COMMENT_PAGE)}
                disabled={fetchingComments}
                className="text-[13px] text-foreground hover:text-signal transition-colors disabled:text-foreground/40"
              >
                {fetchingComments ? "loading…" : "earlier replies"}
              </button>
            </div>
          )}
          {comments.map((c, idx) => (
            <div key={c.id} style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
              <CommentItem
                comment={c}
                currentUserId={user?.id}
                editingCommentId={editingCommentId}
                onStartEdit={handleStartEdit}
                onCancelEdit={handleCancelEdit}
                onSaveEdit={handleSaveEdit}
                isSavingEdit={editComment.isPending}
                onDelete={handleDeleteComment}
                onLike={handleCommentLike}
                replyingTo={replyingTo}
                onToggleReply={handleToggleReply}
                onSendReply={handleSendReply}
                isSendingReply={addComment.isPending}
                formatDate={formatDate}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="no replies yet."
          description="say the first thing."
          actionLabel={user ? "reply" : undefined}
          onAction={user ? focusCommentInput : undefined}
        />
      )}
    </DashboardLayout>
  );
};

export default PostDetail;
