import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStorageUrl } from "@/lib/storageUrl";

interface UserAvatarProps {
  avatarUrl?: string | null;
  username?: string;
  isOwner?: boolean;
  /** sm 28px · md 40px · lg 64px. `xl` is kept for callers and renders as lg. */
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showCrown?: boolean;
}

const sizeClasses = {
  sm: "w-7 h-7",
  md: "w-10 h-10",
  lg: "w-16 h-16",
  xl: "w-16 h-16",
};

const iconSizeClasses = {
  sm: "w-3.5 h-3.5",
  md: "w-[18px] h-[18px]",
  lg: "w-7 h-7",
  xl: "w-7 h-7",
};

const markClasses = {
  sm: "w-2 h-2 -top-px -right-px",
  md: "w-2.5 h-2.5 top-0 right-0",
  lg: "w-3 h-3 top-0.5 right-0.5",
  xl: "w-3 h-3 top-0.5 right-0.5",
};

/**
 * A face in the room: round, a single hairline, no rings and no gold. The
 * owner mark, when asked for, is a tiny quiet dot rather than a crown.
 */
const UserAvatar = ({
  avatarUrl,
  username,
  isOwner = false,
  size = "md",
  className,
  showCrown = true,
}: UserAvatarProps) => {
  // Signing is coalesced across the whole feed and cached, so the twentieth
  // avatar on screen costs no extra request.
  const resolvedAvatarUrl = useStorageUrl("avatars", avatarUrl);
  const showMark = showCrown && isOwner;

  return (
    <div className={cn("relative inline-block shrink-0", className)}>
      <div
        className={cn(
          "rounded-full overflow-hidden bg-foreground/[0.06] ring-1 ring-foreground/10",
          sizeClasses[size],
        )}
      >
        {resolvedAvatarUrl ? (
          <img
            src={resolvedAvatarUrl}
            alt={username || "avatar"}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className={cn("text-foreground/45", iconSizeClasses[size])} strokeWidth={1.5} />
          </div>
        )}
      </div>

      {showMark && (
        <span
          aria-label="owner"
          title="owner"
          className={cn(
            "absolute rounded-full bg-foreground/60 ring-2 ring-background",
            markClasses[size],
          )}
        />
      )}
    </div>
  );
};

export default UserAvatar;
