import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Filter, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const KeywordFiltersManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newPattern, setNewPattern] = useState("");
  const [scope, setScope] = useState("all");

  const { data: filters, isLoading } = useQuery({
    queryKey: ['keyword-filters', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('keyword_filters')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user
  });

  const addFilter = useMutation({
    mutationFn: async () => {
      if (!user || !newPattern.trim()) return;
      const { error } = await supabase.from('keyword_filters').insert({
        user_id: user.id,
        pattern: newPattern.trim(),
        scope
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewPattern("");
      queryClient.invalidateQueries({ queryKey: ['keyword-filters'] });
      toast({ title: "Filter added" });
    }
  });

  const deleteFilter = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('keyword_filters').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keyword-filters'] });
    }
  });

  const toggleFilter = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('keyword_filters').update({ is_active: active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['keyword-filters'] })
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={newPattern}
          onChange={(e) => setNewPattern(e.target.value)}
          placeholder="Keyword or pattern (e.g. crypto|NFT|drop)"
          className="glass-panel border rounded-lg font-light flex-1"
        />
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger className="glass-panel border rounded-lg font-light w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="glass-panel border">
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="timeline">Timeline</SelectItem>
            <SelectItem value="replies">Replies</SelectItem>
            <SelectItem value="notifications">Notifs</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={() => addFilter.mutate()}
          disabled={!newPattern.trim() || addFilter.isPending}
          size="icon"
          className="rounded-lg bg-foreground text-background hover:bg-foreground/90 shrink-0"
        >
          {addFilter.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-foreground/40" />
        </div>
      ) : filters && filters.length > 0 ? (
        <div className="space-y-2">
          {filters.map((f: any) => (
            <div key={f.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-accent/5 border border-border/10">
              <Filter className="w-4 h-4 text-foreground/40 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-light text-foreground/70 truncate font-mono">{f.pattern}</p>
                <p className="text-xs text-foreground/30 font-light capitalize">{f.scope}</p>
              </div>
              <Switch
                checked={f.is_active}
                onCheckedChange={(checked) => toggleFilter.mutate({ id: f.id, active: checked })}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive/60 hover:text-destructive shrink-0"
                onClick={() => deleteFilter.mutate(f.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-foreground/30 text-sm font-light text-center py-3">
          No keyword filters yet
        </p>
      )}
    </div>
  );
};

export default KeywordFiltersManager;
