import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Reply, Smile, MoreHorizontal, Check, CheckCheck } from "lucide-react";
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
  showSenderInfo?: boolean;
  onDelete?: (messageId: string) => void;
  onReply?: (messageId: string, content: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  reactions?: { emoji: string; count: number; hasReacted: boolean }[];
}

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'];

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
  onDelete,
  onReply,
  onReact,
  reactions = []
}: MessageBubbleProps) => {
  const [showActions, setShowActions] = useState(false);
  const isMine = senderId === currentUserId;
  // Hover-capable pointers reveal actions on hover. Touch devices have no hover
  // (and emulate mouseenter right before click), so there we toggle on tap instead.
  const canHover = useMemo(
    () => typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(hover: hover)').matches,
    []
  );
  
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div 
      className={`flex ${isMine ? 'justify-end' : 'justify-start'} group`}
      onMouseEnter={canHover ? () => setShowActions(true) : undefined}
      onMouseLeave={canHover ? () => setShowActions(false) : undefined}
    >
      <div className={`max-w-[70%] ${!isMine && showSenderInfo ? 'flex gap-2' : ''}`}>
        {!isMine && showSenderInfo && sender && (
          <UserAvatar avatarUrl={sender.avatar_url} size="sm" />
        )}
        
        <div className="relative">
          {/* Reply preview */}
          {replyTo && (
            <div className={`text-xs px-3 py-1.5 rounded-t-lg border-l-2 mb-1 ${
              isMine 
                ? 'bg-foreground/80 text-background/70 border-background/40' 
                : 'glass-card text-foreground/60 border-foreground/40'
            }`}>
              <span className="font-medium">{replyTo.senderName}</span>
              <p className="truncate opacity-80">{replyTo.content}</p>
            </div>
          )}
          
          {/* Tap toggles the actions so touch users can reply, react and delete */}
          <div
            className={`rounded-lg px-4 py-2 ${
              isMine 
                ? 'bg-foreground text-background' 
                : 'glass-card'
            }`}
            onClick={canHover ? undefined : () => setShowActions((prev) => !prev)}
          >
            {!isMine && showSenderInfo && sender && (
              <p className="text-xs text-foreground/60 font-light mb-1">
                {sender.display_name || sender.username}
              </p>
            )}
            
            {/* Message content with anti-screenshot protection */}
            <p className="font-light select-none" style={{ userSelect: 'none' }}>
              {content}
            </p>
            
            <div className={`flex items-center gap-1.5 mt-1 ${
              isMine ? 'text-background/60' : 'text-foreground/40'
            }`}>
              <span className="text-xs">{formatTime(createdAt)}</span>
              {isMine && (
                readAt ? (
                  <CheckCheck className="w-3.5 h-3.5 text-blue-400" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )
              )}
            </div>
          </div>
          
          {/* Reactions display */}
          {reactions.length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
              {reactions.map((reaction) => (
                <button
                  key={reaction.emoji}
                  onClick={() => onReact?.(id, reaction.emoji)}
                  className={`text-xs px-1.5 py-0.5 rounded-full glass-inset ${
                    reaction.hasReacted ? 'ring-1 ring-foreground/30' : ''
                  }`}
                >
                  {reaction.emoji} {reaction.count > 1 && reaction.count}
                </button>
              ))}
            </div>
          )}
          
          {/* Action buttons */}
          {showActions && (
            <div className={`absolute top-0 flex items-center gap-0.5 ${
              isMine ? 'right-full mr-1' : 'left-full ml-1'
            }`}>
              {/* Emoji reaction */}
              {onReact && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 rounded-full glass-inset"
                    >
                      <Smile className="w-3.5 h-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="glass-panel border w-auto p-2" side="top">
                    <div className="flex gap-1">
                      {EMOJI_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            onReact(id, emoji);
                          }}
                          className="text-lg hover:scale-125 transition-transform p-1"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              
              {/* Reply */}
              {onReply && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onReply(id, content)}
                  className="h-7 w-7 p-0 rounded-full glass-inset"
                >
                  <Reply className="w-3.5 h-3.5" />
                </Button>
              )}
              
              {/* More options */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-full glass-inset"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="glass-panel border" align={isMine ? 'end' : 'start'}>
                  {onDelete && (
                    <DropdownMenuItem 
                      onClick={() => onDelete(id)}
                      className="text-red-500 focus:text-red-500"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
