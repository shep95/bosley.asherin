import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import UserAvatar from "@/components/UserAvatar";
import StorageMedia from "@/components/media/StorageMedia";
import CommentItem from "@/components/post/CommentItem";
import FormattedContent from "@/components/feed/FormattedContent";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
const POST_MAX = 1000;

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
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [isEditingPost, setIsEditingPost] = useState(false);
  const [editedPostContent, setEditedPostContent] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editedCommentContent, setEditedCommentContent] = useState("");
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch post
  const { data: post, isLoading: loadingPost } = useQuery({
    queryKey: ['post', postId],
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

  // Fetch comments with threading and likes
  const { data: comments, isLoading: loadingComments } = useQuery({
    queryKey: ['comments', postId],
    queryFn: async () => {
      const { data: commentsData, error } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const userIds = [...new Set(commentsData?.map(c => c.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', userIds);

      const profilesMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // Fetch comment likes
      const commentIds = commentsData?.map(c => c.id) || [];
      const { data: likesData } = await supabase
        .from('comment_likes')
        .select('comment_id')
        .in('comment_id', commentIds);

      const likesCountMap = new Map<string, number>();
      likesData?.forEach(l => {
        likesCountMap.set(l.comment_id, (likesCountMap.get(l.comment_id) || 0) + 1);
      });

      const { data: userLikes } = user ? await supabase
        .from('comment_likes')
        .select('comment_id')
        .eq('user_id', user.id)
        .in('comment_id', commentIds) : { data: [] };

      const userLikedSet = new Set(userLikes?.map(l => l.comment_id) || []);

      const commentMap = new Map<string, Comment>();
      const rootComments: Comment[] = [];

      commentsData?.forEach(c => {
        const commentWithProfile: Comment = {
          ...c,
          profiles: profilesMap.get(c.user_id) || null,
          replies: [],
          likesCount: likesCountMap.get(c.id) || 0,
          isLiked: userLikedSet.has(c.id)
        };
        commentMap.set(c.id, commentWithProfile);
      });

      commentsData?.forEach(c => {
        const comment = commentMap.get(c.id)!;
        if (c.parent_id) {
          const parent = commentMap.get(c.parent_id);
          if (parent) {
            parent.replies = parent.replies || [];
            parent.replies.push(comment);
          }
        } else {
          rootComments.push(comment);
        }
      });

      return rootComments;
    },
    enabled: !!postId
  });

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

  // Fetch likes and bookmark status
  const { data: postStats } = useQuery({
    queryKey: ['post-stats', postId, user?.id],
    queryFn: async () => {
      const { count: likesCount } = await supabase
        .from('post_likes')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);

      const { data: userLike } = user ? await supabase
        .from('post_likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .maybeSingle() : { data: null };

      const { data: userBookmark } = user ? await supabase
        .from('bookmarks')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .maybeSingle() : { data: null };

      return {
        likesCount: likesCount || 0,
        isLiked: !!userLike,
        isBookmarked: !!userBookmark
      };
    },
    enabled: !!postId
  });

  // Edit post mutation
  const editPost = useMutation({
    mutationFn: async (content: string) => {
      if (!user || !postId) throw new Error("Not authenticated");

      // Save previous content to post_edits
      if (post?.content) {
        await supabase.from('post_edits').insert({
          post_id: postId,
          edited_by: user.id,
          previous_content: post.content
        });
      }

      const { error } = await supabase
        .from('posts')
        .update({
          content,
          last_edited_at: new Date().toISOString(),
          edit_count: (post?.edit_count || 0) + 1
        })
        .eq('id', postId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      setIsEditingPost(false);
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      toast({ title: "post updated" });
    },
    onError: (error) => {
      toast({ title: "could not save", description: error.message, variant: "destructive" });
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
    onSuccess: () => {
      setComment("");
      setReplyContent("");
      setReplyingTo(null);
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      toast({ title: "reply sent" });
    },
    onError: (error) => {
      toast({ title: "could not send", description: error.message, variant: "destructive" });
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
      toast({ title: "reply deleted" });
    },
    onError: (error) => {
      toast({ title: "could not delete", description: error.message, variant: "destructive" });
    }
  });

  // Like comment handler
  const handleCommentLike = async (commentId: string, isLiked: boolean) => {
    if (!user) return;

    if (isLiked) {
      await supabase.from('comment_likes').delete().match({ comment_id: commentId, user_id: user.id });
    } else {
      await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: user.id });
    }
    queryClient.invalidateQueries({ queryKey: ['comments', postId] });
  };

  const handleLike = async () => {
    if (!user || !postId) return;

    if (postStats?.isLiked) {
      await supabase.from('post_likes').delete().match({ post_id: postId, user_id: user.id });
    } else {
      await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
      // Notification for the post owner is created by a database trigger.
    }
    queryClient.invalidateQueries({ queryKey: ['post-stats', postId] });
  };

  const handleBookmark = async () => {
    if (!user || !postId) return;

    if (postStats?.isBookmarked) {
      await supabase.from('bookmarks').delete().match({ post_id: postId, user_id: user.id });
      toast({ title: "removed from bookmarks" });
    } else {
      await supabase.from('bookmarks').insert({ post_id: postId, user_id: user.id });
      toast({ title: "bookmarked" });
    }
    queryClient.invalidateQueries({ queryKey: ['post-stats', postId] });
  };

  const handleReport = async () => {
    if (!user || !postId) return;
    const { error } = await supabase
      .from('post_flags')
      .insert({ post_id: postId, user_id: user.id, reason: 'reported' });
    if (error) {
      toast({ title: "could not report this post", description: "try again in a moment.", variant: "destructive" });
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

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/dashboard');
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
  // Every reply in the thread, nested ones included, so the number matches the feed card.
  const countReplies = (list?: Comment[]): number =>
    (list ?? []).reduce((n, c) => n + 1 + countReplies(c.replies), 0);
  const replyCount = countReplies(comments);
  const composerOpen = composerFocused || comment.length > 0;
  const canReply = comment.trim().length > 0 && !addComment.isPending;
  const canSavePost = editedPostContent.trim().length > 0 && !editPost.isPending;

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
                  maxLength={POST_MAX}
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
                  <span className="ml-auto text-[12px] font-light text-foreground/35 tabular-nums">
                    {editedPostContent.length}/{POST_MAX}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-3 text-[17px] font-light leading-[1.7] text-foreground/95 whitespace-pre-wrap [overflow-wrap:anywhere]">
                <FormattedContent content={post.content} />
              </div>
            )}

            {post.media_urls && post.media_urls.length > 0 && (
              <div className={`grid gap-1.5 mt-4 ${post.media_urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {post.media_urls.map((url: string, idx: number) => {
                  const isVideo = url.includes('.mp4') || url.includes('.webm') || url.includes('.mov') || url.includes('.avi');
                  return isVideo ? (
                    <StorageMedia key={idx} bucket="post-media" value={url} kind="video" className="max-h-[520px] rounded-md overflow-hidden" priority={idx === 0} />
                  ) : (
                    <StorageMedia key={idx} bucket="post-media" value={url} kind="image" alt="" imgClassName="w-full rounded-md object-cover max-h-[520px]" priority={idx === 0} />
                  );
                })}
              </div>
            )}

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
          {comments.map((c, idx) => (
            <div key={c.id} style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
              <CommentItem
                comment={c}
                currentUserId={user?.id}
                editingCommentId={editingCommentId}
                editedCommentContent={editedCommentContent}
                onEditedCommentContentChange={setEditedCommentContent}
                onStartEdit={(commentId, currentContent) => {
                  setEditingCommentId(commentId);
                  setEditedCommentContent(currentContent);
                }}
                onCancelEdit={() => setEditingCommentId(null)}
                onSaveEdit={(commentId, newContent) =>
                  editComment.mutate({ commentId, content: newContent })
                }
                isSavingEdit={editComment.isPending}
                onDelete={(commentId) => deleteComment.mutate(commentId)}
                onLike={handleCommentLike}
                replyingTo={replyingTo}
                replyContent={replyContent}
                onReplyContentChange={setReplyContent}
                onToggleReply={(commentId) =>
                  setReplyingTo(replyingTo === commentId ? null : commentId)
                }
                onSendReply={(parentId, content) => addComment.mutate({ content, parentId })}
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
