import { Button } from "@/components/ui/button";
import { Clock, SlidersHorizontal, Users, Crown, Layers } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface FeedControlsProps {
  mode: string;
  onModeChange: (mode: string) => void;
}

const FeedControls = ({ mode, onModeChange }: FeedControlsProps) => {
  const { user } = useAuth();
  
  const { data: feedProfiles } = useQuery({
    queryKey: ['feed-profiles', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('feed_profiles')
        .select('*')
        .eq('user_id', user.id);
      return data || [];
    },
    enabled: !!user
  });

  const modes = [
    { id: "chronological", icon: Clock, label: "Latest" },
    { id: "interest", icon: SlidersHorizontal, label: "For You" },
    { id: "friends", icon: Users, label: "Following" },
    { id: "founder", icon: Crown, label: "Founder", highlight: true },
  ];

  return (
    <div className="flex items-center gap-2">
      <div className="p-1 glass-inset rounded-xl flex items-center gap-1">
        {modes.map((m) => {
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onModeChange(m.id)}
              aria-pressed={active}
              className={`
                relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                transition-colors duration-200 ease-soft
                ${active
                  ? 'text-foreground'
                  : m.highlight
                    ? 'text-signal/80 hover:text-signal'
                    : 'text-foreground/60 hover:text-foreground'}
              `}
            >
              {active && (
                <motion.span
                  layoutId="feed-mode-indicator"
                  className="absolute inset-0 rounded-lg bg-foreground/[0.12] shadow-card"
                  transition={{ type: "spring", stiffness: 480, damping: 38 }}
                />
              )}
              <m.icon className="w-3.5 h-3.5 relative z-10" />
              <span className="hidden sm:inline relative z-10">{m.label}</span>
            </button>
          );
        })}
      </div>

      {feedProfiles && feedProfiles.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-1.5 rounded-lg text-xs font-medium text-foreground/60 hover:text-foreground hover:bg-foreground/5 px-3 h-9"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Saved</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="glass-panel border">
            {feedProfiles.map((fp: any) => (
              <DropdownMenuItem
                key={fp.id}
                onClick={() => {
                  const config = fp.config as any;
                  onModeChange(config?.mode || 'chronological');
                }}
                className="font-light"
              >
                {fp.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};

export default FeedControls;
