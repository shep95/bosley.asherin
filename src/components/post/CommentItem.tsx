import React from "react";
import { Link } from "react-router-dom";
import UserAvatar from "@/components/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Edit2, Heart, Loader2, MoreHorizontal, Trash2 } from "lucide-react";

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

const REPLY_MAX = 500;

/**
 * One reply in a thread. A root reply is a `.row`; nested replies sit inside
 * it, indented 44px behind a thin hairline that drops from the parent avatar.
 */
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
  const name = comment.profiles?.display_name || comment.profiles?.username || "someone";
  const handle = comment.profiles?.username || "user";
  const canSendReply = replyContent.trim().length > 0 && !isSendingReply;
  const canSaveEdit = editedCommentContent.trim().length > 0 && !isSavingEdit;

  return (
    <div className={depth === 0 ? "row px-5 sm:px-8 py-4" : "mt-4"}>
      <div className="flex items-start gap-4">
        <Link to={`/user/${handle}`} className="shrink-0 mt-0.5">
          <UserAvatar avatarUrl={comment.profiles?.avatar_url} username={comment.profiles?.username} size="sm" />
        </Link>

        <div className="flex-1 min-w-0">
          {/* Byline: who, handle, when. One weight, three opacities. */}
          <div className="flex items-baseline justify-between gap-3">
            <p className="flex items-baseline gap-x-2 min-w-0 text-[14px] font-light leading-none">
              <Link to={`/user/${handle}`} className="text-foreground truncate hover:underline underline-offset-4 decoration-foreground/40">
                {name}
              </Link>
              <span className="text-foreground/40 truncate">@{handle}</span>
              <span className="text-foreground/30 tabular-nums whitespace-nowrap">{formatDate(comment.created_at)}</span>
            </p>

            {isOwner && !isEditing && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="more" className="quiet -mt-1.5 -mr-2 p-2 rounded-md">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="glass-panel rounded-md border min-w-[160px]">
                  <DropdownMenuItem onClick={() => onStartEdit(comment.id, comment.content)} className="text-foreground/80 text-[13px]">
                    <Edit2 className="w-3.5 h-3.5 mr-2" /> edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDelete(comment.id)} className="text-destructive focus:text-destructive text-[13px]">
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {isEditing ? (
            <div className="mt-2">
              <label className="sr-only" htmlFor={`edit-${comment.id}`}>edit reply</label>
              <textarea
                id={`edit-${comment.id}`}
                value={editedCommentContent}
                onChange={(e) => onEditedCommentContentChange(e.target.value)}
                maxLength={REPLY_MAX}
                rows={2}
                autoFocus
                className="field w-full text-[15px] font-light leading-relaxed text-foreground resize-none"
              />
              <div className="mt-2 flex items-center gap-3 text-[13px]">
                <button
                  type="button"
                  onClick={() => onSaveEdit(comment.id, editedCommentContent.trim())}
                  disabled={!canSaveEdit}
                  className="inline-flex items-center gap-1.5 h-9 px-1 text-foreground hover:text-signal transition-colors disabled:opacity-40 disabled:hover:text-foreground"
                >
                  {isSavingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  save
                </button>
                <button type="button" onClick={onCancelEdit} className="quiet h-9 px-1">
                  cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[15px] font-light leading-[1.65] text-foreground/90 whitespace-pre-wrap [overflow-wrap:anywhere]">
              {comment.content}
            </p>
          )}

          {!isEditing && (
            <div className="flex items-center gap-1 mt-1.5 -ml-2 text-[12px] tabular-nums">
              <button
                type="button"
                onClick={() => onLike(comment.id, comment.isLiked || false)}
                aria-pressed={!!comment.isLiked}
                aria-label={comment.isLiked ? "unlike" : "like"}
                className="quiet inline-flex items-center gap-1.5 h-8 px-2 rounded-md"
              >
                <Heart className={`w-[15px] h-[15px] ${comment.isLiked ? "fill-current" : ""}`} />
                <span>{(comment.likesCount || 0) > 0 ? comment.likesCount : ""}</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleReply(comment.id)}
                aria-pressed={isReplying}
                className="quiet inline-flex items-center h-8 px-2 rounded-md text-[13px]"
              >
                reply
              </button>
            </div>
          )}

          {isReplying && (
            <div className="mt-1">
              <label className="sr-only" htmlFor={`reply-${comment.id}`}>reply to {name}</label>
              <textarea
                id={`reply-${comment.id}`}
                value={replyContent}
                onChange={(e) => onReplyContentChange(e.target.value)}
                placeholder={`reply to ${name}.`}
                maxLength={REPLY_MAX}
                rows={1}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && canSendReply) {
                    e.preventDefault();
                    onSendReply(comment.id, replyContent.trim());
                  }
                }}
                className="field w-full text-[15px] font-light leading-relaxed text-foreground placeholder:text-foreground/30 resize-none"
              />
              <div className="mt-2 flex items-center gap-3 text-[13px]">
                <button
                  type="button"
                  onClick={() => onSendReply(comment.id, replyContent.trim())}
                  disabled={!canSendReply}
                  className="inline-flex items-center gap-1.5 h-9 px-1 text-foreground hover:text-signal transition-colors disabled:opacity-40 disabled:hover:text-foreground"
                >
                  {isSendingReply && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  send
                </button>
                <button type="button" onClick={() => onToggleReply(comment.id)} className="quiet h-9 px-1">
                  cancel
                </button>
                <span className="ml-auto text-[12px] font-light text-foreground/35 tabular-nums">
                  {replyContent.length}/{REPLY_MAX}
                </span>
              </div>
            </div>
          )}

          {comment.replies && comment.replies.length > 0 && (
            <div className="-ml-[31px] pl-[30px] border-l border-foreground/10">
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
      </div>
    </div>
  );
};

const CommentItem = React.memo(CommentItemComponent);
CommentItem.displayName = "CommentItem";

export default CommentItem;
