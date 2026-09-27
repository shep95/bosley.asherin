import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, Layers } from "lucide-react";

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
      toast({ title: "Feed profile created" });
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

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Profile name (e.g. Friends Only, News)"
          className="glass-panel border rounded-lg font-light flex-1"
        />
        <Button
          onClick={() => createProfile.mutate()}
          disabled={!newName.trim() || createProfile.isPending}
          size="icon"
          className="rounded-lg bg-foreground text-background hover:bg-foreground/90 shrink-0"
        >
          {createProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-foreground/40" />
        </div>
      ) : profiles && profiles.length > 0 ? (
        <div className="space-y-2">
          {profiles.map((p: any) => (
            <div key={p.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-accent/5 border border-border/10">
              <Layers className="w-4 h-4 text-foreground/40 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-light text-foreground/70">{p.name}</p>
                <p className="text-xs text-foreground/30 font-light capitalize">
                  {(p.config as any)?.mode || 'chronological'} · {(p.config as any)?.timeWindow || 'all time'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive/60 hover:text-destructive shrink-0"
                onClick={() => deleteProfile.mutate(p.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-foreground/30 text-sm font-light text-center py-3">
          No saved feed profiles yet. Try "Friends Only" or "News Sources".
        </p>
      )}
    </div>
  );
};

export default FeedProfilesManager;
