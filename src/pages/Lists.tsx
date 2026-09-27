import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import PageHeader from "@/components/layout/PageHeader";

const Lists = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");
  const [newListPublic, setNewListPublic] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [touched, setTouched] = useState(false);

  const { data: lists, isLoading } = useQuery({
    queryKey: ['lists', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('lists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!data) return [];

      // Get member counts
      const listIds = data.map(l => l.id);
      const { data: members } = await supabase
        .from('list_members')
        .select('list_id')
        .in('list_id', listIds);

      const countMap = new Map<string, number>();
      members?.forEach(m => countMap.set(m.list_id, (countMap.get(m.list_id) || 0) + 1));

      return data.map(l => ({ ...l, memberCount: countMap.get(l.id) || 0 }));
    },
    enabled: !!user
  });

  const createList = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from('lists').insert({
        user_id: user.id,
        name: newListName.trim(),
        description: newListDesc.trim() || null,
        is_public: newListPublic,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lists'] });
      setNewListName("");
      setNewListDesc("");
      setNewListPublic(false);
      setDialogOpen(false);
      setTouched(false);
      toast({ title: "list created" });
    },
    onError: () => toast({ title: "could not create the list. try again.", variant: "destructive" })
  });

  const deleteList = useMutation({
    mutationFn: async (listId: string) => {
      const { error } = await supabase.from('lists').delete().eq('id', listId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lists'] });
      toast({ title: "list deleted" });
    }
  });

  const nameValid = newListName.trim().length > 0;
  const cancel = () => { setDialogOpen(false); setNewListName(""); setNewListDesc(""); setNewListPublic(false); setTouched(false); };

  return (
    <DashboardLayout>
      <PageHeader
        title="lists"
        subtitle="people you read on their own."
        actions={
          !dialogOpen && (
            <button onClick={() => setDialogOpen(true)} className="quiet text-[13px] h-10 px-2 rounded-md">
              new list
            </button>
          )
        }
      />

      {dialogOpen && (
        <form
          className="row px-5 sm:px-8 py-5 space-y-4"
          onSubmit={(e) => { e.preventDefault(); setTouched(true); if (nameValid && !createList.isPending) createList.mutate(); }}
        >
          <div>
            <input
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="name"
              maxLength={100}
              autoFocus
              aria-label="list name"
              aria-invalid={touched && !nameValid}
              className="field w-full text-[15px] font-light text-foreground placeholder:text-foreground/35"
            />
            {touched && !nameValid && <p className="mt-1.5 text-[12px] font-light text-foreground/50">give it a name.</p>}
          </div>
          <input
            value={newListDesc}
            onChange={e => setNewListDesc(e.target.value)}
            placeholder="what it is for (optional)"
            maxLength={500}
            aria-label="description"
            className="field w-full text-[15px] font-light text-foreground placeholder:text-foreground/35"
          />
          <div className="flex items-center justify-between gap-4 pt-1">
            <button
              type="button"
              role="switch"
              aria-checked={newListPublic}
              onClick={() => setNewListPublic(v => !v)}
              className="quiet text-[13px] h-10 px-2 -ml-2 rounded-md"
            >
              {newListPublic ? "public. anyone can see who is on it." : "private. only you see it."}
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={cancel} className="quiet text-[13px] h-10 px-3 rounded-md">cancel</button>
              <Button type="submit" variant="signal" size="sm" disabled={!nameValid || createList.isPending}>
                {createList.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "create"}
              </Button>
            </div>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="stagger" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="row px-5 sm:px-8 py-5 space-y-2.5" style={{ "--i": i } as React.CSSProperties}>
              <div className="h-3 w-32 rounded bg-foreground/[0.08] animate-pulse" />
              <div className="h-3 w-56 rounded bg-foreground/[0.06] animate-pulse" />
            </div>
          ))}
        </div>
      ) : lists && lists.length > 0 ? (
        <div className="stagger">
          {lists.map((list, idx) => (
            <div key={list.id} className="row px-5 sm:px-8 py-5 flex items-start justify-between gap-4" style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-light text-foreground truncate">{list.name}</p>
                {list.description && <p className="mt-1 text-[13px] font-light text-foreground/50 truncate">{list.description}</p>}
                <p className="mt-1.5 text-[12px] font-light text-foreground/40 tabular-nums">
                  {list.memberCount} {list.memberCount === 1 ? "person" : "people"} · {list.is_public ? "public" : "private"}
                </p>
              </div>
              <button
                onClick={() => deleteList.mutate(list.id)}
                aria-label={`delete ${list.name}`}
                className="quiet p-2 -mr-2 rounded-md hover:text-destructive shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="no lists yet."
          description="a list is a few accounts you want to read on their own, away from the feed."
          actionLabel="make one"
          onAction={() => setDialogOpen(true)}
        />
      )}
    </DashboardLayout>
  );
};

export default Lists;
