import { useState } from "react";
import EmptyState from "@/components/ui/empty-state";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users2, Plus, Loader2, Lock, Globe, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import { pillTabsListClass, pillTabsTriggerClass } from "@/components/layout/PillTabs";

const Communities = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState("my");

  // My communities
  const { data: myCommunities, isLoading } = useQuery({
    queryKey: ['my-communities', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: memberships } = await supabase
        .from('community_members')
        .select('community_id')
        .eq('user_id', user.id);
      if (!memberships?.length) return [];
      const ids = memberships.map(m => m.community_id);
      const { data } = await supabase
        .from('communities')
        .select('*')
        .in('id', ids)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user
  });

  // Discover communities
  const { data: discoverCommunities } = useQuery({
    queryKey: ['discover-communities', searchQuery],
    queryFn: async () => {
      let query = supabase.from('communities').select('*').eq('is_private', false).order('member_count', { ascending: false }).limit(20);
      if (searchQuery.trim()) {
        query = query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
      }
      const { data } = await query;
      return data || [];
    }
  });

  const createCommunity = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { data: community, error } = await supabase.from('communities').insert({
        name: name.trim(),
        slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        description: description.trim() || null,
        created_by: user.id,
      }).select().single();
      if (error) throw error;
      // Add creator as owner
      await supabase.from('community_members').insert({
        community_id: community.id,
        user_id: user.id,
        role: 'owner',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      queryClient.invalidateQueries({ queryKey: ['discover-communities'] });
      setDialogOpen(false);
      setName(""); setSlug(""); setDescription("");
      toast({ title: "Community created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" })
  });

  const joinCommunity = useMutation({
    mutationFn: async (communityId: string) => {
      if (!user) throw new Error("Not authenticated");
      await supabase.from('community_members').insert({
        community_id: communityId,
        user_id: user.id,
        role: 'member',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      toast({ title: "Joined community" });
    }
  });

  const myIds = new Set(myCommunities?.map(c => c.id) || []);

  return (
    <DashboardLayout>
      <PageHeader
        title="Communities"
        statusDot="bg-emerald-500"
        statusLabel={`${myCommunities?.length ?? 0} communities joined — anyone can start one`}
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-lg font-medium bg-foreground text-background hover:bg-foreground/90 h-8">
                <Plus className="w-4 h-4 mr-2" /> Create
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-panel border">
              <DialogHeader>
                <DialogTitle className="font-light">Create Community</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Input placeholder="Community name" value={name} onChange={e => { setName(e.target.value); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-')); }} className="bg-background/50 border-border/30 font-light" maxLength={100} />
                <Input placeholder="slug-url" value={slug} onChange={e => setSlug(e.target.value)} className="bg-background/50 border-border/30 font-light text-foreground/60" maxLength={100} />
                <Textarea placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} className="bg-background/50 border-border/30 font-light" maxLength={500} />
                <Button onClick={() => createCommunity.mutate()} disabled={!name.trim() || !slug.trim() || createCommunity.isPending} className="w-full rounded-lg font-light bg-foreground text-background">
                  {createCommunity.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className={`${pillTabsListClass} mb-6`}>
            <TabsTrigger value="my" className={pillTabsTriggerClass}>My Communities</TabsTrigger>
            <TabsTrigger value="discover" className={pillTabsTriggerClass}>Discover</TabsTrigger>
          </TabsList>

          <TabsContent value="my">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-foreground/60" /></div>
            ) : myCommunities && myCommunities.length > 0 ? (
              <div className="space-y-3">
                {myCommunities.map(c => (
                  <div key={c.id} className="glass-card rounded-xl p-4 hover:bg-accent/10 transition-colors">
                    <div className="flex items-center gap-2">
                      <h3 className="text-foreground font-normal">{c.name}</h3>
                      {c.is_private ? <Lock className="w-3.5 h-3.5 text-foreground/40" /> : <Globe className="w-3.5 h-3.5 text-foreground/40" />}
                    </div>
                    {c.description && <p className="text-foreground/50 text-sm font-light mt-1">{c.description}</p>}
                    <p className="text-foreground/40 text-xs font-light mt-2">{c.member_count} members</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Users2}
                title="You haven't joined a community yet"
                description="Communities are small rooms around one subject. Join one to see its posts here."
                actionLabel="Discover communities"
                onAction={() => setTab("discover")}
              />
            )}
          </TabsContent>

          <TabsContent value="discover">
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-foreground/40" />
              <Input placeholder="Search communities..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 bg-background/50 border-border/30 rounded-lg font-light h-12" />
            </div>
            <div className="space-y-3">
              {discoverCommunities?.map(c => (
                <div key={c.id} className="glass-card rounded-xl p-4 flex items-center justify-between hover:bg-accent/10 transition-colors">
                  <div>
                    <h3 className="text-foreground font-normal">{c.name}</h3>
                    {c.description && <p className="text-foreground/50 text-sm font-light mt-1 line-clamp-2">{c.description}</p>}
                    <p className="text-foreground/40 text-xs font-light mt-2">{c.member_count} members</p>
                  </div>
                  {!myIds.has(c.id) && (
                    <Button variant="outline" size="sm" onClick={() => joinCommunity.mutate(c.id)} disabled={joinCommunity.isPending} className="rounded-lg font-light">
                      Join
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Communities;
