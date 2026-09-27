import React from "react";
import { Link } from "react-router-dom";
import UserAvatar from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Check,
  Edit2,
  Heart,
  Loader2,
  MoreHorizontal,
  Reply,
  Send,
  Trash2,
  X,
} from "lucide-react";

export interface PostComment {
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
  replies?: PostComment[];
  likesCount?: number;
  isLiked?: boolean;
}

interface CommentItemProps {
  comment: PostComment;
  depth?: number;
  currentUserId?: string;

  // Editing
  editingCommentId: string | null;
  editedCommentContent: string;
  onEditedCommentContentChange: (value: string) => void;
  onStartEdit: (commentId: string, currentContent: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (commentId: string, newContent: string) => void;
  isSavingEdit: boolean;

  // Delete
  onDelete: (commentId: string) => void;

  // Likes
  onLike: (commentId: string, isCurrentlyLiked: boolean) => void;

  // Replies
  replyingTo: string | null;
  replyContent: string;
  onReplyContentChange: (value: string) => void;
  onToggleReply: (commentId: string) => void;
  onSendReply: (parentId: string, content: string) => void;
  isSendingReply: boolean;

  formatDate: (dateString: string) => string;
}

const CommentItemComponent = ({
  comment,
  depth = 0,
  currentUserId,
  editingCommentId,
  editedCommentContent,
  onEditedCommentContentChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  isSavingEdit,
  onDelete,
  onLike,
  replyingTo,
  replyContent,
  onReplyContentChange,
  onToggleReply,
  onSendReply,
  isSendingReply,
  formatDate,
}: CommentItemProps) => {
  const isOwner = currentUserId === comment.user_id;
  const isEditing = editingCommentId === comment.id;
  const isReplying = replyingTo === comment.id;

  return (
    <div className={`${depth > 0 ? "ml-8 border-l border-border/20 pl-4" : ""}`}>
      <div className="py-4">
        <div className="flex items-start gap-3">
          <Link to={`/user/${comment.profiles?.username}`} className="flex-shrink-0">
            <UserAvatar
              avatarUrl={comment.profiles?.avatar_url}
              username={comment.profiles?.username}
              size="sm"
            />
          </Link>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <Link
                  to={`/user/${comment.profiles?.username}`}
                  className="text-foreground font-normal text-sm hover:underline"
                >
                  {comment.profiles?.display_name || comment.profiles?.username || "Anonymous"}
                </Link>
                <span className="text-foreground/40 font-light text-xs">@{comment.profiles?.username}</span>
                <span className="text-foreground/40 text-xs">·</span>
                <span className="text-foreground/40 text-xs font-light">{formatDate(comment.created_at)}</span>
              </div>

              {isOwner && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" type="button" className="h-6 w-6 p-0 text-foreground/40">
                      <MoreHorizontal className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="glass-panel border">
                    <DropdownMenuItem onClick={() => onStartEdit(comment.id, comment.content)}>
                      <Edit2 className="w-3 h-3 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDelete(comment.id)} className="text-red-500">
                      <Trash2 className="w-3 h-3 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={editedCommentContent}
                  onChange={(e) => onEditedCommentContentChange(e.target.value)}
                  className="bg-background/50 border-border/30 rounded-lg font-light text-sm min-h-[60px] resize-none"
                  maxLength={500}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => onSaveEdit(comment.id, editedCommentContent)}
                    disabled={isSavingEdit}
                    className="rounded-lg bg-foreground text-background h-7"
                  >
                    {isSavingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  </Button>
                  <Button size="sm" type="button" variant="ghost" onClick={onCancelEdit} className="rounded-lg h-7">
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-foreground font-light text-sm leading-relaxed whitespace-pre-wrap">{comment.content}</p>
            )}

            <div className="flex items-center gap-3 mt-2">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => onLike(comment.id, comment.isLiked || false)}
                className={`h-7 px-2 text-xs gap-1 ${comment.isLiked ? "text-red-500" : "text-foreground/40 hover:text-red-500"}`}
              >
                <Heart className={`w-3 h-3 ${comment.isLiked ? "fill-current" : ""}`} />
                {(comment.likesCount || 0) > 0 && comment.likesCount}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => onToggleReply(comment.id)}
                className="h-7 px-2 text-foreground/40 hover:text-foreground text-xs"
              >
                <Reply className="w-3 h-3 mr-1" />
                Reply
              </Button>
            </div>

            {isReplying && (
              <div className="mt-3 flex gap-2">
                <Textarea
                  value={replyContent}
                  onChange={(e) => onReplyContentChange(e.target.value)}
                  placeholder={`Reply to @${comment.profiles?.username}...`}
                  className="bg-background/50 border-border/30 rounded-lg font-light text-sm min-h-[60px] resize-none"
                  maxLength={500}
                  autoFocus
                />
                <Button
                  type="button"
                  onClick={() => onSendReply(comment.id, replyContent)}
                  disabled={!replyContent.trim() || isSendingReply}
                  size="sm"
                  className="rounded-lg bg-foreground text-background self-end"
                >
                  {isSendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {comment.replies && comment.replies.length > 0 && (
        <div>
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              currentUserId={currentUserId}
              editingCommentId={editingCommentId}
              editedCommentContent={editedCommentContent}
              onEditedCommentContentChange={onEditedCommentContentChange}
              onStartEdit={onStartEdit}
              onCancelEdit={onCancelEdit}
              onSaveEdit={onSaveEdit}
              isSavingEdit={isSavingEdit}
              onDelete={onDelete}
              onLike={onLike}
              replyingTo={replyingTo}
              replyContent={replyContent}
              onReplyContentChange={onReplyContentChange}
              onToggleReply={onToggleReply}
              onSendReply={onSendReply}
              isSendingReply={isSendingReply}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const CommentItem = React.memo(CommentItemComponent);
CommentItem.displayName = "CommentItem";

export default CommentItem;
