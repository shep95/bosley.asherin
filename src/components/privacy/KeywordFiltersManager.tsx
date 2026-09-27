import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SCOPES: Record<string, string> = {
  all: "everywhere",
  timeline: "timeline",
  replies: "replies",
  notifications: "notifications",
};

/** Words and patterns to hide. Rows inside the settings document. */
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
      toast({ title: "filter added" });
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

  const canAdd = !!newPattern.trim() && !addFilter.isPending;

  return (
    <>
      <div className="row px-5 sm:px-8 py-4">
        <p className="text-[15px] font-light text-foreground">keyword filters</p>
        <p className="mt-0.5 text-[13px] font-light text-foreground/50">
          hide posts that contain a word or a pattern. regex works: crypto|nft|drop
        </p>
        <form
          className="mt-3 flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4"
          onSubmit={(e) => { e.preventDefault(); if (canAdd) addFilter.mutate(); }}
        >
          <Input
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            placeholder="word or pattern"
            aria-label="word or pattern"
            className="w-full sm:flex-1 sm:min-w-0 h-9"
            maxLength={200}
          />
          <div className="flex items-end gap-3 sm:gap-4 sm:contents">
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="h-9 flex-1 sm:flex-none sm:w-[140px] text-[14px]" aria-label="where">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SCOPES).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" variant="signal" size="sm" disabled={!canAdd} className="shrink-0">
              {addFilter.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "add"}
            </Button>
          </div>
        </form>
      </div>

      {isLoading ? (
        <div className="row px-5 sm:px-8 py-4" aria-hidden>
          <div className="h-3.5 w-1/3 rounded bg-foreground/[0.06] animate-pulse" />
        </div>
      ) : filters && filters.length > 0 ? (
        <div className="stagger">
          {filters.map((f: any, i: number) => (
            <div
              key={f.id}
              style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
              className="row px-5 sm:px-8 py-3 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-light text-foreground truncate font-mono">{f.pattern ?? f.keyword}</p>
                <p className="text-[12px] font-light text-foreground/40">{SCOPES[f.scope] ?? f.scope ?? "everywhere"}</p>
              </div>
              <Switch
                aria-label={`filter ${f.pattern ?? f.keyword} on`}
                checked={f.is_active}
                onCheckedChange={(checked) => toggleFilter.mutate({ id: f.id, active: checked })}
              />
              <button
                type="button"
                onClick={() => deleteFilter.mutate(f.id)}
                className="quiet h-10 px-2 -mr-2 rounded-md text-[13px] shrink-0"
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

export default KeywordFiltersManager;
