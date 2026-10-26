import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUnread } from "@/hooks/useUnread";
import MemberCard from "@/components/MemberCard";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

interface RoomRailProps {
  profile?: {
    username: string | null;
    display_name: string | null;
    member_number?: number | null;
    created_at: string | null;
  } | null;
}

/**
 * The right-hand rail on wide screens: what belongs to you, never what
 * someone wants you to click. Your card, what is waiting for you, and the
 * rules your feed runs on. No suggestions, no trends, no counters that grow.
 */
const RoomRail = ({ profile }: RoomRailProps) => {
  const { user } = useAuth();
  const { counts } = useUnread();

  const { data: desk } = useQuery({
    queryKey: ["room-rail", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const [drafts, scheduled] = await Promise.all([
        supabase.from("post_drafts").select("id", { count: "exact", head: true }).eq("user_id", user!.id),
        supabase
          .from("scheduled_posts")
          .select("scheduled_for", { count: "exact" })
          .eq("user_id", user!.id)
          .eq("status", "pending")
          .order("scheduled_for", { ascending: true })
          .limit(1),
      ]);
      return {
        drafts: drafts.count ?? 0,
        scheduled: scheduled.count ?? 0,
        next: scheduled.data?.[0]?.scheduled_for ?? null,
      };
    },
  });

  const rows: { label: string; value: string; to: string; lit?: boolean }[] = [
    { label: "messages", value: String(counts.messages + counts.requests), to: "/messages", lit: counts.messages + counts.requests > 0 },
    { label: "notifications", value: String(counts.notifications), to: "/notifications", lit: counts.notifications > 0 },
    { label: "drafts", value: String(desk?.drafts ?? 0), to: "/drafts" },
    {
      label: "scheduled",
      value: desk?.next ? format(new Date(desk.next), "EEE h:mm a").toLowerCase() : String(desk?.scheduled ?? 0),
      to: "/scheduled",
    },
  ];

  return (
    <aside className="hidden xl:flex w-[260px] flex-shrink-0 sticky top-0 h-[100dvh] flex-col gap-9 px-6 pt-9 pb-6 overflow-y-auto">
      {profile?.username && (
        <section>
          <p className="eyebrow !text-[9.5px] mb-3">your card</p>
          <Link to="/profile" className="block transition-transform duration-200 ease-soft hover:-translate-y-px">
            <MemberCard
              size="rail"
              username={profile.username}
              displayName={profile.display_name}
              memberNumber={profile.member_number}
              joinedAt={profile.created_at}
            />
          </Link>
        </section>
      )}

      <section>
        <p className="eyebrow !text-[9.5px] mb-2">waiting for you</p>
        <ul>
          {rows.map((r) => (
            <li key={r.label}>
              <Link
                to={r.to}
                className="flex items-baseline justify-between py-2 border-b border-foreground/[0.06] text-[13.5px] font-light text-foreground/60 hover:text-foreground transition-colors"
              >
                <span>{r.label}</span>
                <span className={`num text-[12.5px] ${r.lit ? "text-gold" : "text-foreground/35"}`}>{r.value}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <p className="eyebrow !text-[9.5px] mb-2">your feed runs on</p>
        <ul className="space-y-1.5 text-[13px] font-light text-foreground/55 leading-snug">
          <li>newest first, nothing reordered.</li>
          <li>no ads. no boosted posts.</li>
          <li>your mutes and filters, applied before you see a thing.</li>
        </ul>
        <Link to="/settings" className="inline-block mt-3 text-[12.5px] font-light text-foreground/40 hover:text-gold transition-colors">
          change the rules
        </Link>
      </section>

      <p className="mt-auto text-[11px] font-light text-foreground/30 leading-relaxed">
        <span className="kbd">{isMac ? "⌘ K" : "ctrl K"}</span> jump · <span className="kbd">n</span> write · <span className="kbd">?</span> keys
      </p>
    </aside>
  );
};

export default RoomRail;
