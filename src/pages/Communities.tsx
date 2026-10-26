import { useState } from "react";
import EmptyState from "@/components/ui/empty-state";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PageHeader from "@/components/layout/PageHeader";
import { useDebouncedValue, escapeLike } from "@/lib/useDebouncedValue";
import { friendlyDbError, isUniqueViolation } from "@/lib/dbErrors";

type Community = { id: string; name: string; slug?: string; description: string | null; is_private: boolean; member_count: number; created_by?: string | null };

const CommunityRow = ({ c, idx, action }: { c: Community; idx: number; action?: React.ReactNode }) => (
  <div className="row px-5 sm:px-8 py-5 flex items-start justify-between gap-4" style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
    <div className="flex-1 min-w-0">
      <p className="text-[15px] font-light text-foreground truncate">{c.name}</p>
      {c.description && <p className="mt-1 text-[13px] font-light text-foreground/50 line-clamp-2">{c.description}</p>}
      <p className="mt-1.5 text-[12px] font-light text-foreground/40 tabular-nums">
        {c.member_count} {c.member_count === 1 ? "member" : "members"} · {c.is_private ? "private" : "open"}
      </p>
    </div>
    {action}
  </div>
);

const RowSkeleton = () => (
  <div className="stagger" aria-busy="true">
    {[0, 1, 2].map((i) => (
      <div key={i} className="row px-5 sm:px-8 py-5 space-y-2.5" style={{ "--i": i } as React.CSSProperties}>
        <div className="h-3 w-36 rounded bg-foreground/[0.08] animate-pulse" />
        <div className="h-3 w-60 rounded bg-foreground/[0.06] animate-pulse" />
      </div>
    ))}
  </div>
);

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
  const [touched, setTouched] = useState(false);
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 300);

  // My communities
  const { data: myCommunities, isLoading } = useQuery({
    queryKey: ['my-communities', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: memberships, error: membershipsError } = await supabase
        .from('community_members')
        .select('community_id')
        .eq('user_id', user.id)
        .limit(200);
      if (membershipsError) throw membershipsError;
      if (!memberships?.length) return [];
      const ids = memberships.map(m => m.community_id);
      const { data, error } = await supabase
        .from('communities')
        .select('*')
        .in('id', ids)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user
  });

  // Discover communities
  const { data: discoverCommunities, isLoading: discoverLoading } = useQuery({
    queryKey: ['discover-communities', debouncedSearch],
    queryFn: async () => {
      const base = () =>
        supabase.from('communities').select('*').eq('is_private', false).order('member_count', { ascending: false }).limit(20);
      const term = escapeLike(debouncedSearch);
      if (!term) {
        const { data, error } = await base();
        if (error) throw error;
        return data || [];
      }
      // Two plain ilike filters instead of interpolating raw input into
      // .or(), where commas and parentheses would change the filter itself.
      const pattern = `%${term}%`;
      const [byName, byDescription] = await Promise.all([
        base().ilike('name', pattern),
        base().ilike('description', pattern),
      ]);
      if (byName.error) throw byName.error;
      if (byDescription.error) throw byDescription.error;
      const merged = new Map<string, Community>();
      for (const c of [...(byName.data ?? []), ...(byDescription.data ?? [])]) merged.set(c.id, c);
      return [...merged.values()].sort((a, b) => b.member_count - a.member_count).slice(0, 20);
    },
    // Keep the last results on screen while the next search loads.
    placeholderData: (prev) => prev
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
      // Add creator as owner (allowed only because they created it).
      const { error: ownerError } = await supabase.from('community_members').insert({
        community_id: community.id,
        user_id: user.id,
        role: 'owner',
      });
      if (ownerError && !isUniqueViolation(ownerError)) throw ownerError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      queryClient.invalidateQueries({ queryKey: ['discover-communities'] });
      setDialogOpen(false);
      setName(""); setSlug(""); setDescription("");
      setTouched(false);
      toast({ title: "community created" });
    },
    onError: (e) => toast({
      title: isUniqueViolation(e) ? "that address is taken. try another." : friendlyDbError(e, "could not create it. try again."),
      variant: "destructive",
    })
  });

  const joinCommunity = useMutation({
    mutationFn: async (communityId: string) => {
      if (!user) throw new Error("Not authenticated");
      // The database only accepts role 'member' for a join.
      const { error } = await supabase.from('community_members').insert({
        community_id: communityId,
        user_id: user.id,
        role: 'member',
      });
      // Already a member (double tap, another tab): the end state is right.
      if (error && !isUniqueViolation(error)) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      queryClient.invalidateQueries({ queryKey: ['discover-communities'] });
      toast({ title: "joined" });
    },
    onError: (e) => toast({ title: friendlyDbError(e, "could not join. try again."), variant: "destructive" }),
  });

  const leaveCommunity = useMutation({
    mutationFn: async (communityId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from('community_members')
        .delete()
        .eq('community_id', communityId)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-communities'] });
      queryClient.invalidateQueries({ queryKey: ['discover-communities'] });
      toast({ title: "left" });
    },
    onError: (e) => toast({ title: friendlyDbError(e, "could not leave. try again."), variant: "destructive" }),
  });

  const myIds = new Set(myCommunities?.map(c => c.id) || []);
  const nameValid = name.trim().length > 0;
  const slugValid = slug.trim().length > 0;
  const cancel = () => { setDialogOpen(false); setName(""); setSlug(""); setDescription(""); setTouched(false); };

  return (
    <DashboardLayout>
      <PageHeader
        title="communities"
        subtitle="small rooms around one subject."
        actions={
          !dialogOpen && (
            <button onClick={() => setDialogOpen(true)} className="quiet text-[13px] h-10 px-2 rounded-md">
              new community
            </button>
          )
        }
        belowRow={
          <div role="tablist" aria-label="communities" className="flex items-center gap-6 border-b border-foreground/10">
            {([["my", "mine"], ["discover", "discover"]] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="text-tab text-[14px]">
                {label}
              </button>
            ))}
          </div>
        }
      />

      {dialogOpen && (
        <form
          className="row px-5 sm:px-8 py-5 space-y-4"
          onSubmit={(e) => { e.preventDefault(); setTouched(true); if (nameValid && slugValid && !createCommunity.isPending) createCommunity.mutate(); }}
        >
          <div>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-')); }}
              onBlur={() => setTouched(true)}
              placeholder="name"
              maxLength={100}
              autoFocus
              aria-label="community name"
              aria-invalid={touched && !nameValid}
              className="field w-full text-[15px] font-light text-foreground placeholder:text-foreground/35"
            />
            {touched && !nameValid && <p className="mt-1.5 text-[12px] font-light text-foreground/50">give it a name.</p>}
          </div>
          <div>
            <label className="field flex items-baseline gap-1 text-[15px] font-light">
              <span className="text-foreground/35">/c/</span>
              <input
                value={slug}
                onChange={e => setSlug(e.target.value)}
                placeholder="address"
                maxLength={100}
                aria-label="address"
                aria-invalid={touched && !slugValid}
                className="w-full bg-transparent text-foreground placeholder:text-foreground/35 focus:outline-none"
              />
            </label>
            {touched && !slugValid && <p className="mt-1.5 text-[12px] font-light text-foreground/50">it needs an address. letters, numbers and dashes.</p>}
          </div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="what it is about (optional)"
            maxLength={500}
            rows={2}
            aria-label="description"
            className="w-full bg-transparent resize-none text-[15px] font-light leading-relaxed text-foreground placeholder:text-foreground/35 focus:outline-none"
          />
          <div className="flex items-center justify-end gap-1 pt-1">
            <button type="button" onClick={cancel} className="quiet text-[13px] h-10 px-3 rounded-md">cancel</button>
            <Button type="submit" variant="signal" size="sm" disabled={!nameValid || !slugValid || createCommunity.isPending}>
              {createCommunity.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "create"}
            </Button>
          </div>
        </form>
      )}

      {tab === "my" && (
        isLoading ? (
          <RowSkeleton />
        ) : myCommunities && myCommunities.length > 0 ? (
          <div className="stagger">
            {myCommunities.map((c, idx) => (
              <CommunityRow
                key={c.id}
                c={c}
                idx={idx}
                action={
                  c.created_by === user?.id ? (
                    <span className="text-[13px] font-light text-foreground/40 h-10 inline-flex items-center shrink-0">yours</span>
                  ) : (
                    <button
                      onClick={() => leaveCommunity.mutate(c.id)}
                      disabled={leaveCommunity.isPending}
                      className="quiet text-[13px] h-10 px-2 -mr-2 rounded-md shrink-0 disabled:opacity-50"
                    >
                      leave
                    </button>
                  )
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="you have not joined one yet."
            description="a community is a small room around one subject. join one to see its posts here."
            actionLabel="discover"
            onAction={() => setTab("discover")}
          />
        )
      )}

      {tab === "discover" && (
        <>
          <div className="px-5 sm:px-8 pt-2 pb-4">
            <label className="field flex items-center gap-3">
              <Search className="w-4 h-4 text-foreground/40 shrink-0" aria-hidden />
              <input
                type="search"
                placeholder="a subject or a name"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label="search communities"
                className="w-full bg-transparent text-[15px] font-light text-foreground placeholder:text-foreground/35 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
            </label>
          </div>
          {discoverLoading ? (
            <RowSkeleton />
          ) : discoverCommunities && discoverCommunities.length > 0 ? (
            <div className="stagger">
              {discoverCommunities.map((c, idx) => (
                <CommunityRow
                  key={c.id}
                  c={c}
                  idx={idx}
                  action={
                    myIds.has(c.id) ? (
                      <span className="text-[13px] font-light text-foreground/40 h-10 inline-flex items-center shrink-0">joined</span>
                    ) : (
                      <button
                        onClick={() => joinCommunity.mutate(c.id)}
                        disabled={joinCommunity.isPending}
                        className="quiet text-[13px] h-10 px-2 -mr-2 rounded-md shrink-0 disabled:opacity-50"
                      >
                        join
                      </button>
                    )
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={debouncedSearch ? "nothing by that name." : "no open communities yet."}
              description={debouncedSearch ? `no community matches "${debouncedSearch}". start it, and it is yours.` : "be the first to start one."}
              actionLabel="start one"
              onAction={() => setDialogOpen(true)}
            />
          )}
        </>
      )}
    </DashboardLayout>
  );
};

export default Communities;
