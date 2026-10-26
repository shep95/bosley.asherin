import { useRef } from "react";
import { format } from "date-fns";
import { formatMemberNumber, isFounding } from "@/lib/member";

interface MemberCardProps {
  username: string;
  displayName?: string | null;
  memberNumber?: number | null;
  joinedAt?: string | null;
  /** compact: one line for sidebars. rail: a small card for the right rail. */
  size?: "full" | "rail" | "compact";
  className?: string;
}

/**
 * A black metal card with the person's monogram, name and permanent member
 * number. Light follows the pointer through one CSS variable; nothing
 * re-renders on move.
 */
const MemberCard = ({ username, displayName, memberNumber, joinedAt, size = "full", className = "" }: MemberCardProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const name = displayName || username;
  const monogram = (name.trim()[0] || "b").toUpperCase();
  const founding = isFounding(memberNumber);
  const since = joinedAt ? format(new Date(joinedAt), "MMM yyyy").toLowerCase() : null;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  if (size === "compact") {
    return (
      <div ref={ref} onPointerMove={onMove} className={`member-card px-4 py-3.5 flex items-center gap-3.5 ${className}`}>
        <span className="font-display text-[1.6rem] leading-none text-gold w-7 text-center" aria-hidden>
          {monogram}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-light text-foreground truncate">{name}</p>
          <p className="flex flex-wrap gap-x-1.5 text-[10.5px] tracking-[0.16em] uppercase text-foreground/45 num">
            <span className="whitespace-nowrap">N° {formatMemberNumber(memberNumber)}</span>
            {founding && <span className="text-gold whitespace-nowrap">founding</span>}
          </p>
        </div>
      </div>
    );
  }

  if (size === "rail") {
    return (
      <div
        ref={ref}
        onPointerMove={onMove}
        className={`member-card aspect-[1.586/1] w-full p-4 flex flex-col justify-between select-none ${className}`}
        aria-label={`member card for ${name}, member number ${formatMemberNumber(memberNumber)}${founding ? ", founding member" : ""}`}
        role="img"
      >
        <div className="relative flex items-start justify-between">
          <span className="font-display text-[15px] leading-none text-foreground/80">Bosley</span>
          <span className="eyebrow !text-[8px] !tracking-[0.3em]">{founding ? "founding" : "member"}</span>
        </div>
        <div className="relative flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-[1.35rem] leading-[0.95] text-foreground truncate">{name}</p>
            <p className="mt-1.5 num text-[11px] tracking-[0.26em] text-foreground/60">
              N° <span className={founding ? "text-gold" : ""}>{formatMemberNumber(memberNumber)}</span>
            </p>
          </div>
          <span aria-hidden className="font-display text-[2.4rem] leading-[0.8] text-gold opacity-90">
            {monogram}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className={`member-card aspect-[1.586/1] w-full max-w-[420px] p-6 sm:p-7 flex flex-col justify-between select-none ${className}`}
      aria-label={`member card for ${name}, member number ${formatMemberNumber(memberNumber)}${founding ? ", founding member" : ""}`}
      role="img"
    >
      <div className="relative flex items-start justify-between">
        <span className="font-display text-[22px] leading-none text-foreground/85">Bosley</span>
        <span className="eyebrow !text-[9.5px] !tracking-[0.36em]">{founding ? "founding member" : "member"}</span>
      </div>

      <div className="relative flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-[2.1rem] sm:text-[2.4rem] leading-[0.95] text-foreground truncate">{name}</p>
          <p className="mt-1.5 text-[12.5px] font-light text-foreground/50 truncate">@{username}</p>
        </div>
        <span
          aria-hidden
          className="font-display text-[3.4rem] sm:text-[3.8rem] leading-[0.8] text-gold opacity-90 -mb-1"
        >
          {monogram}
        </span>
      </div>

      <div className="relative flex items-end justify-between">
        <p className="num text-[15px] tracking-[0.32em] text-foreground/75">
          N° <span className={founding ? "text-gold" : ""}>{formatMemberNumber(memberNumber)}</span>
        </p>
        {since && <p className="text-[10.5px] tracking-[0.24em] uppercase text-foreground/40">since {since}</p>}
      </div>
    </div>
  );
};

export default MemberCard;
