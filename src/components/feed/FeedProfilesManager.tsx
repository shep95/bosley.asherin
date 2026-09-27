import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

/**
 * Saved feed set-ups. Rendered as rows inside the settings document: one row
 * carries the name and the form, then one row per saved profile.
 */
const FeedProfilesManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");

  const { data: profiles, isLoading } = useQuery({
    queryKey: ['feed-profiles', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('feed_profiles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      return data || [];
    },
    enabled: !!user
  });

  const createProfile = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!newName.trim()) throw new Error("Name required");

      const configPresets: Record<string, Record<string, string | null>> = {
        "Friends Only": { mode: "friends", sort: "chronological", timeWindow: "" },
        "News Sources": { mode: "chronological", sort: "chronological", timeWindow: "24h" },
        "Trending": { mode: "interest", sort: "engagement", timeWindow: "" },
      };

      const config = configPresets[newName.trim()] || { mode: "chronological", sort: "chronological", timeWindow: "" };

      const { error } = await supabase.from('feed_profiles').insert([{
        user_id: user.id,
        name: newName.trim(),
        config: config as any
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      setNewName("");
      queryClient.invalidateQueries({ queryKey: ['feed-profiles'] });
      toast({ title: "feed saved" });
    }
  });

  const deleteProfile = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('feed_profiles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed-profiles'] });
    }
  });

  const canSave = !!newName.trim() && !createProfile.isPending;

  return (
    <>
      <div className="row px-5 sm:px-8 py-4">
        <p className="text-[15px] font-light text-foreground">saved feeds</p>
        <p className="mt-0.5 text-[13px] font-light text-foreground/50">
          keep a few set-ups and switch between them. try "Friends Only" or "News Sources".
        </p>
        <form
          className="mt-3 flex items-end gap-4"
          onSubmit={(e) => { e.preventDefault(); if (canSave) createProfile.mutate(); }}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="name this feed"
            aria-label="feed name"
            className="flex-1 h-9"
            maxLength={40}
          />
          <Button type="submit" variant="signal" size="sm" disabled={!canSave} className="shrink-0">
            {createProfile.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "save"}
          </Button>
        </form>
      </div>

      {isLoading ? (
        <div className="row px-5 sm:px-8 py-4" aria-hidden>
          <div className="h-3.5 w-1/3 rounded bg-foreground/[0.06] animate-pulse" />
        </div>
      ) : profiles && profiles.length > 0 ? (
        <div className="stagger">
          {profiles.map((p: any, i: number) => (
            <div
              key={p.id}
              style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
              className="row px-5 sm:px-8 py-3 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-light text-foreground truncate">{p.name}</p>
                <p className="text-[12px] font-light text-foreground/40">
                  {(p.config as any)?.mode || 'chronological'} · {(p.config as any)?.timeWindow || 'all time'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => deleteProfile.mutate(p.id)}
                className="quiet h-10 px-2 rounded-md text-[13px] shrink-0"
              >
                remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
};

export default FeedProfilesManager;
