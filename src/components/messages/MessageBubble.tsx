import { useMemo, useState } from "react";
import { Trash2, Reply, Smile, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import UserAvatar from "@/components/UserAvatar";

interface MessageBubbleProps {
  id: string;
  content: string;
  senderId: string;
  currentUserId: string;
  createdAt: string;
  readAt?: string | null;
  replyTo?: {
    id: string;
    content: string;
    senderName: string;
  } | null;
  sender?: {
    username?: string;
    display_name?: string | null;
    avatar_url?: string | null;
  };
  /** First message of a run from this sender (group chats): show avatar + name. */
  showSenderInfo?: boolean;
  /** Last message of a run: the only one that carries a timestamp. */
  showTime?: boolean;
  onDelete?: (messageId: string) => void;
  onReply?: (messageId: string, content: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  reactions?: { emoji: string; count: number; hasReacted: boolean }[];
}

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'];

/**
 * One message. Two tones of the same surface tell you who spoke; nothing is
 * coloured. Actions sleep until the pointer arrives (or a finger taps).
 */
const MessageBubble = ({
  id,
  content,
  senderId,
  currentUserId,
  createdAt,
  readAt,
  replyTo,
  sender,
  showSenderInfo = false,
  showTime = true,
  onDelete,
  onReply,
  onReact,
  reactions = []
}: MessageBubbleProps) => {
  const [showActions, setShowActions] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isMine = senderId === currentUserId;
  // Hover-capable pointers reveal actions on hover. Touch devices have no hover
  // (and emulate mouseenter right before click), so there we toggle on tap instead.
  const canHover = useMemo(
    () => typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(hover: hover)').matches,
    []
  );

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  };

  const shownReactions = reactions.filter((r) => !!r.emoji);
  const hasActions = !!(onReact || onReply || (onDelete && isMine));
  const canDelete = isMine && !!onDelete;
  // Keep the strip mounted while a popover or menu opened from it is showing,
  // otherwise moving the pointer into the emoji picker unmounts its trigger.
  const actionsVisible = hasActions && (showActions || reactOpen || menuOpen);

  return (
    <div
      className={`group flex ${isMine ? 'justify-end' : 'justify-start'}`}
      onMouseEnter={canHover ? () => setShowActions(true) : undefined}
      onMouseLeave={canHover ? () => setShowActions(false) : undefined}
    >
      <div className={`flex items-end gap-2 max-w-[82%] sm:max-w-[70%] ${isMine ? 'flex-row-reverse' : ''}`}>
        {!isMine && sender && (
          showSenderInfo ? (
            <UserAvatar avatarUrl={sender.avatar_url} username={sender.username} size="sm" className="shrink-0 mb-5" />
          ) : (
            <span aria-hidden className="w-8 shrink-0" />
          )
        )}

        <div className={`relative min-w-0 flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
          {!isMine && showSenderInfo && sender && (
            <p className="text-[11px] font-light text-foreground/45 mb-1 px-0.5">
              {sender.display_name || sender.username}
            </p>
          )}

          {replyTo && (
            <div className="mb-1.5 pl-2.5 border-l border-foreground/25 text-[12px] font-light max-w-full">
              <span className="text-foreground/45">{replyTo.senderName}</span>
              <p className="truncate text-foreground/60">{replyTo.content}</p>
            </div>
          )}

          {/* Tap toggles the actions so touch users can reply, react and delete */}
          <div
            className={`rounded-md px-3.5 py-2 ${isMine ? 'bg-foreground/[0.08]' : 'bg-foreground/[0.04]'}`}
            onClick={canHover || !hasActions ? undefined : () => setShowActions((prev) => !prev)}
          >
            {/* Message content with anti-screenshot protection */}
            <p className="text-[15px] font-light leading-[1.5] text-foreground/90 select-none whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ userSelect: 'none' }}>
              {content}
            </p>
          </div>

          {shownReactions.length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
              {shownReactions.map((reaction) => (
                <button
                  key={reaction.emoji}
                  onClick={() => onReact?.(id, reaction.emoji)}
                  aria-pressed={reaction.hasReacted}
                  aria-label={`${reaction.emoji} ${reaction.count}`}
                  className={`quiet inline-flex items-center gap-1 h-6 px-1.5 rounded-md text-[11px] tabular-nums ${
                    reaction.hasReacted ? 'bg-foreground/[0.08]' : 'bg-foreground/[0.04]'
                  }`}
                >
                  <span aria-hidden>{reaction.emoji}</span>
                  {reaction.count > 1 && <span>{reaction.count}</span>}
                </button>
              ))}
            </div>
          )}

          {showTime && (
            <p className={`mt-1 px-0.5 text-[11px] font-light text-foreground/35 tabular-nums flex items-center gap-1.5 ${isMine ? 'justify-end' : ''}`}>
              <span>{formatTime(createdAt)}</span>
              {isMine && <span>{readAt ? 'read' : 'sent'}</span>}
            </p>
          )}

          {/* Actions: beside the bubble on wide screens, under it on a phone. */}
          {actionsVisible && (
            <div
              className={`flex items-center gap-0.5 mt-1 sm:mt-0 sm:absolute sm:top-0 ${
                isMine ? 'sm:right-full sm:mr-1' : 'sm:left-full sm:ml-1'
              }`}
            >
              {onReact && (
                <Popover open={reactOpen} onOpenChange={setReactOpen}>
                  <PopoverTrigger asChild>
                    <button aria-label="react" className="quiet p-2 rounded-md">
                      <Smile className="w-[15px] h-[15px]" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="glass-panel border rounded-md w-auto p-1.5" side="top">
                    <div className="flex gap-0.5">
                      {EMOJI_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => { onReact(id, emoji); setReactOpen(false); }}
                          aria-label={`react ${emoji}`}
                          className="text-[17px] leading-none p-1.5 rounded-md hover:bg-foreground/[0.06] transition-colors duration-150 ease-soft"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {onReply && (
                <button onClick={() => onReply(id, content)} aria-label="reply" className="quiet p-2 rounded-md">
                  <Reply className="w-[15px] h-[15px]" />
                </button>
              )}

              {canDelete && (
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button aria-label="more" className="quiet p-2 rounded-md">
                      <MoreHorizontal className="w-[15px] h-[15px]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="glass-panel border rounded-md min-w-[140px]" align={isMine ? 'end' : 'start'}>
                    <DropdownMenuItem
                      onClick={() => onDelete?.(id)}
                      className="text-destructive focus:text-destructive text-[13px] font-light"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-2" />
                      delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
