import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStorageUrl } from "@/lib/storageUrl";

interface UserAvatarProps {
  avatarUrl?: string | null;
  username?: string;
  isOwner?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showCrown?: boolean;
}

const sizeClasses = {
  sm: "w-8 h-8",
  md: "w-10 h-10 sm:w-12 sm:h-12",
  lg: "w-16 h-16",
  xl: "w-24 h-24 sm:w-32 sm:h-32",
};

const crownSizeClasses = {
  sm: "w-3 h-3 -top-1 -right-1",
  md: "w-4 h-4 -top-1 -right-1",
  lg: "w-5 h-5 -top-1.5 -right-1.5",
  xl: "w-6 h-6 -top-2 -right-2",
};

const iconSizeClasses = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-8 h-8",
  xl: "w-12 h-12",
};

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

  const isActualOwner = isOwner;
  
  // Silver crown marks the owner
  const showSilverCrown = showCrown && isActualOwner;

  return (
    <div className={cn("relative inline-block", className)}>
      {/* Avatar with rounded-square corners */}
      <div
        className={cn(
          "bg-accent overflow-hidden rounded-lg border-0",
          sizeClasses[size]
        )}
      >
        {resolvedAvatarUrl ? (
          <img
            src={resolvedAvatarUrl}
            alt={username || "User avatar"}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className={cn("text-foreground/60", iconSizeClasses[size])} />
          </div>
        )}
      </div>

      {/* Silver Crown for Owner */}
      {showSilverCrown && (
        <div
          className={cn(
            "absolute flex items-center justify-center",
            crownSizeClasses[size]
          )}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-full h-full drop-shadow-lg"
          >
            <path
              d="M2 17L5 8L9 12L12 4L15 12L19 8L22 17H2Z"
              fill="url(#silverGradient)"
              stroke="#9CA3AF"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <defs>
              <linearGradient id="silverGradient" x1="12" y1="4" x2="12" y2="17">
                <stop stopColor="#E5E7EB" />
                <stop offset="0.5" stopColor="#D1D5DB" />
                <stop offset="1" stopColor="#9CA3AF" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      )}
    </div>
  );
};

export default UserAvatar;
