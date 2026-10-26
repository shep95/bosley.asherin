import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useStorageUrl } from "@/lib/storageUrl";

interface UserAvatarProps {
  avatarUrl?: string | null;
  username?: string;
  /** Display name; its first letter is the monogram when there is no photo. */
  name?: string | null;
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

const monogramClasses = {
  sm: "text-[15px]",
  md: "text-[22px]",
  lg: "text-[34px]",
  xl: "text-[34px]",
};

/** A stable, muted hue per person, so a face without a photo is still theirs. */
function hueFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

const pixelSizes = { sm: 28, md: 40, lg: 64, xl: 64 } as const;

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
  name,
  isOwner = false,
  size = "md",
  className,
  showCrown = true,
}: UserAvatarProps) => {
  // Signing is coalesced across the whole feed and cached, so the twentieth
  // avatar on screen costs no extra request.
  const resolvedAvatarUrl = useStorageUrl("avatars", avatarUrl);
  const showMark = showCrown && isOwner;
  // A deleted or unreadable avatar falls back to the glyph, not a broken image.
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [resolvedAvatarUrl]);
  const px = pixelSizes[size];
  const initial = ((name || username || "").replace(/^@/, "").trim()[0] || "·").toUpperCase();
  const hue = hueFor(username || "");

  return (
    <div className={cn("relative inline-block shrink-0", className)}>
      <div
        className={cn(
          "rounded-full overflow-hidden bg-foreground/[0.06] ring-1 ring-foreground/10",
          sizeClasses[size],
        )}
      >
        {resolvedAvatarUrl && !broken ? (
          <img
            src={resolvedAvatarUrl}
            alt={username || "avatar"}
            width={px}
            height={px}
            onError={() => setBroken(true)}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            aria-hidden
            className={cn("w-full h-full flex items-center justify-center font-display leading-none select-none", monogramClasses[size])}
            style={{
              background: `radial-gradient(120% 120% at 30% 20%, hsl(${hue} 22% 20%), hsl(${hue} 18% 9%))`,
              color: `hsl(${hue} 40% 84%)`,
            }}
          >
            {initial}
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
