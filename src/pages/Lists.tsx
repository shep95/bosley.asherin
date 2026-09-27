import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { List, Plus, Trash2, Users, Globe, Lock, Loader2 } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";

const Lists = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");
  const [newListPublic, setNewListPublic] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

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
      toast({ title: "List created" });
    },
    onError: () => toast({ title: "Error creating list", variant: "destructive" })
  });

  const deleteList = useMutation({
    mutationFn: async (listId: string) => {
      const { error } = await supabase.from('lists').delete().eq('id', listId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lists'] });
      toast({ title: "List deleted" });
    }
  });

  return (
    <DashboardLayout>
      <PageHeader
        title="Lists"
        statusDot="bg-emerald-500"
        statusLabel={`${lists?.length ?? 0} saved lists — choose who shows in your timeline`}
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-lg font-medium bg-foreground text-background hover:bg-foreground/90 h-8">
                <Plus className="w-4 h-4 mr-2" /> New List
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-panel border">
              <DialogHeader>
                <DialogTitle className="font-light">Create List</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="List name"
                  value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  className="bg-background/50 border-border/30 font-light"
                  maxLength={100}
                />
                <Textarea
                  placeholder="Description (optional)"
                  value={newListDesc}
                  onChange={e => setNewListDesc(e.target.value)}
                  className="bg-background/50 border-border/30 font-light"
                  maxLength={500}
                />
                <div className="flex items-center justify-between">
                  <span className="text-foreground/70 font-light">Public list</span>
                  <Switch checked={newListPublic} onCheckedChange={setNewListPublic} />
                </div>
                <Button
                  onClick={() => createList.mutate()}
                  disabled={!newListName.trim() || createList.isPending}
                  className="w-full rounded-lg font-light bg-foreground text-background"
                >
                  {createList.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="max-w-2xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-foreground/60" /></div>
        ) : lists && lists.length > 0 ? (
          <div className="space-y-3">
            {lists.map(list => (
              <div key={list.id} className="glass-card rounded-xl p-4 flex items-center justify-between hover:bg-accent/10 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-foreground font-normal">{list.name}</h3>
                    {list.is_public ? <Globe className="w-3.5 h-3.5 text-foreground/40" /> : <Lock className="w-3.5 h-3.5 text-foreground/40" />}
                  </div>
                  {list.description && <p className="text-foreground/50 text-sm font-light mt-1">{list.description}</p>}
                  <div className="flex items-center gap-1 mt-2 text-foreground/40 text-xs font-light">
                    <Users className="w-3 h-3" />
                    <span>{list.memberCount} members</span>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => deleteList.mutate(list.id)} className="text-foreground/40 hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={List}
            title="No lists yet"
            description="A list is a small group of accounts you want to read on their own, away from the main feed."
            actionLabel="Find people to add"
            actionTo="/search"
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default Lists;
