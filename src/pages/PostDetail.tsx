import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import UserAvatar from "@/components/UserAvatar";
import StorageMedia from "@/components/media/StorageMedia";
import CommentItem from "@/components/post/CommentItem";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  MoreHorizontal,
  Flag,
  History,
  Loader2,
  Send,
  Edit2,
  Check,
  X,
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

const PostDetail = () => {
  const { postId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
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
      toast({ title: "Post updated" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      toast({ title: "Comment posted" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      toast({ title: "Comment updated" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      toast({ title: "Comment deleted" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      toast({ title: "Removed from bookmarks" });
    } else {
      await supabase.from('bookmarks').insert({ post_id: postId, user_id: user.id });
      toast({ title: "Added to bookmarks" });
    }
    queryClient.invalidateQueries({ queryKey: ['post-stats', postId] });
  };

  const handleReport = async () => {
    if (!user || !postId) return;
    const { error } = await supabase
      .from('post_flags')
      .insert({ post_id: postId, user_id: user.id, reason: 'reported' });
    if (error) {
      toast({ title: "Could not report post", variant: "destructive" });
      return;
    }
    toast({ title: "Post reported", description: "Thanks for keeping the community safe." });
  };

  const focusCommentInput = () => {
    commentInputRef.current?.focus();
    commentInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/post/${postId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Check out this post', url: shareUrl });
      } catch {
        /* user dismissed the share sheet */
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "Link copied to clipboard" });
    }
  };

  const startEditingPost = () => {
    setEditedPostContent(post?.content || '');
    setIsEditingPost(true);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };


  if (loadingPost) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/60" />
        </div>
      </DashboardLayout>
    );
  }

  if (!post) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="glass-card rounded-xl p-8 text-center">
            <p className="text-foreground/60 font-light">Post not found</p>
            <Button onClick={() => navigate(-1)} variant="ghost" className="mt-4">
              Go back
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isPostOwner = user?.id === post.user_id;

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/dashboard')}
          className="mb-4 text-foreground/60 hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>

        <div className="glass-card rounded-xl p-4 sm:p-6">
          <div className="flex items-start gap-3 mb-4">
            <Link to={`/user/${post.profiles?.username}`} className="flex-shrink-0">
              <UserAvatar
                avatarUrl={post.profiles?.avatar_url}
                username={post.profiles?.username}
                size="md"
              />
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div>
                  <Link 
                    to={`/user/${post.profiles?.username}`}
                    className="text-foreground font-normal hover:underline"
                  >
                    {post.profiles?.display_name || post.profiles?.username || 'Anonymous'}
                  </Link>
                  <p className="text-foreground/40 font-light text-sm">
                    @{post.profiles?.username}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-foreground/40">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="glass-panel border">
                    {isPostOwner && (
                      <>
                        <DropdownMenuItem onClick={startEditingPost}>
                          <Edit2 className="w-4 h-4 mr-2" />
                          Edit post
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem onClick={handleReport} className="text-foreground/70">
                      <Flag className="w-4 h-4 mr-2" />
                      Report
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {isEditingPost ? (
            <div className="mb-4 space-y-3">
              <Textarea
                value={editedPostContent}
                onChange={(e) => setEditedPostContent(e.target.value)}
                className="bg-background/50 border-border/30 rounded-lg font-light resize-none min-h-[120px]"
                maxLength={1000}
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => editPost.mutate(editedPostContent)}
                  disabled={editPost.isPending || !editedPostContent.trim()}
                  className="rounded-lg bg-foreground text-background"
                >
                  {editPost.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                  Save
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setIsEditingPost(false)}
                  className="rounded-lg"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-foreground font-light text-lg leading-relaxed whitespace-pre-wrap mb-4">
                {post.content}
              </p>
            </>
          )}

          {post.media_urls && post.media_urls.length > 0 && (
            <div className={`grid gap-2 mb-4 ${post.media_urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {post.media_urls.map((url: string, idx: number) => {
                const isVideo = url.includes('.mp4') || url.includes('.webm') || url.includes('.mov') || url.includes('.avi');
                return isVideo ? (
                  <StorageMedia key={idx} bucket="post-media" value={url} kind="video" className="max-h-[500px]" priority={idx === 0} />
                ) : (
                  <StorageMedia key={idx} bucket="post-media" value={url} kind="image" alt="" imgClassName="w-full rounded-[0.625rem] object-cover max-h-96" priority={idx === 0} />
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2 text-foreground/40 text-sm font-light border-b border-border/20 pb-4">
            <span>{formatDate(post.created_at)}</span>
            {(post.edit_count ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <History className="w-3 h-3" /> edited
              </span>
            )}
          </div>

          <div className="flex items-center gap-6 py-4 border-b border-border/20 text-sm">
            <span className="text-foreground">
              {postStats?.likesCount || 0} <span className="text-foreground/60 font-light">Likes</span>
            </span>
            <span className="text-foreground">
              {comments?.length || 0} <span className="text-foreground/60 font-light">Comments</span>
            </span>
          </div>

          <div className="flex items-center justify-around py-2 border-b border-border/20">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLike}
              className={`gap-2 ${postStats?.isLiked ? 'text-red-500' : 'text-foreground/40 hover:text-red-500'}`}
            >
              <Heart className={`w-5 h-5 ${postStats?.isLiked ? 'fill-current' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={focusCommentInput}
              aria-label="Write a reply"
              className="gap-2 text-foreground/40 hover:text-blue-500"
            >
              <MessageCircle className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBookmark}
              className={`gap-2 ${postStats?.isBookmarked ? 'text-yellow-500' : 'text-foreground/40 hover:text-yellow-500'}`}
            >
              <Bookmark className={`w-5 h-5 ${postStats?.isBookmarked ? 'fill-current' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShare}
              className="gap-2 text-foreground/40 hover:text-green-500"
            >
              <Share2 className="w-5 h-5" />
            </Button>
          </div>

          <div className="pt-4">
            <div className="flex gap-3">
              <Textarea
                ref={commentInputRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Post your reply..."
                className="flex-1 bg-background/50 border border-border/30 rounded-lg font-light px-4 py-3 text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20 min-h-[48px] resize-none"
                maxLength={500}
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && comment.trim()) {
                    e.preventDefault();
                    addComment.mutate({ content: comment });
                  }
                }}
              />
            </div>
            <div className="flex justify-between items-center mt-3">
              <span className="text-foreground/40 text-sm font-light">{comment.length}/500</span>
              <Button
                onClick={() => addComment.mutate({ content: comment })}
                disabled={!comment.trim() || addComment.isPending}
                className="rounded-lg bg-foreground text-background"
              >
                {addComment.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Reply
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h2 className="text-lg font-light text-foreground mb-4">Comments</h2>
          
          {loadingComments ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-foreground/60" />
            </div>
          ) : comments && comments.length > 0 ? (
            <div className="glass-card rounded-lg divide-y divide-border/20">
              {comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
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
              ))}
            </div>
          ) : (
            <div className="glass-card rounded-xl p-8 text-center">
              <p className="text-foreground/60 font-light">
                No comments yet. Be the first to reply!
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default PostDetail;