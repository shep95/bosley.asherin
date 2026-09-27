import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface FeedControlsProps {
  mode: string;
  onModeChange: (mode: string) => void;
}

/**
 * Feed modes are words. The founder feed is a feed like any other: nothing on
 * this row gets the accent, because none of these is a commitment.
 */
const FeedControls = ({ mode, onModeChange }: FeedControlsProps) => {
  const { user } = useAuth();

  const { data: feedProfiles } = useQuery({
    queryKey: ["feed-profiles", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("feed_profiles").select("*").eq("user_id", user.id);
      return data || [];
    },
    enabled: !!user,
  });

  const modes = [
    { id: "chronological", label: "latest" },
    { id: "friends", label: "following" },
    { id: "interest", label: "for you" },
    { id: "founder", label: "from asher" },
  ];

  return (
    <div role="tablist" aria-label="feed" className="flex items-center gap-6 border-b border-foreground/10 overflow-x-auto">
      {modes.map((m) => (
        <button
          key={m.id}
          role="tab"
          aria-selected={mode === m.id}
          onClick={() => onModeChange(m.id)}
          className="text-tab text-[14px] whitespace-nowrap"
        >
          {m.label}
        </button>
      ))}
      {feedProfiles && feedProfiles.length > 0 && (
        <>
          <span className="text-foreground/15">·</span>
          {feedProfiles.map((fp: { id: string; name: string; config: unknown }) => {
            const cfg = (fp.config ?? {}) as { mode?: string };
            return (
              <button
                key={fp.id}
                role="tab"
                aria-selected={false}
                onClick={() => onModeChange(cfg.mode || "chronological")}
                className="text-tab text-[14px] whitespace-nowrap"
              >
                {fp.name}
              </button>
            );
          })}
        </>
      )}
    </div>
  );
};

export default FeedControls;
