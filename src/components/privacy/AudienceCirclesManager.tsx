import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, Loader2 } from "lucide-react";
import UserAvatar from "@/components/UserAvatar";

interface Circle {
  id: string;
  name: string;
  icon: string;
  color: string;
}

/**
 * Circles: small named audiences for a post. Rows inside the settings
 * document. Open a circle and its people appear underneath it, with a field
 * to add someone right there; no dialog.
 */
const AudienceCirclesManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newCircleName, setNewCircleName] = useState("");
  const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
  const [memberSearch, setMemberSearch] = useState("");

  // Fetch user's circles
  const { data: circles, isLoading } = useQuery({
    queryKey: ['audience-circles', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('audience_circles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      return data || [];
    },
    enabled: !!user
  });

  // Fetch circle members
  const { data: members } = useQuery({
    queryKey: ['circle-members', selectedCircle?.id],
    queryFn: async () => {
      if (!selectedCircle) return [];
      const { data: membersData } = await supabase
        .from('circle_members')
        .select('id, member_user_id')
        .eq('circle_id', selectedCircle.id);

      if (!membersData || membersData.length === 0) return [];

      // Fetch profiles for members
      const userIds = membersData.map(m => m.member_user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', userIds);

      const profilesMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      return membersData.map(m => ({
        ...m,
        profile: profilesMap.get(m.member_user_id)
      }));
    },
    enabled: !!selectedCircle
  });

  // Search for users to add
  const { data: searchResults } = useQuery({
    queryKey: ['user-search', memberSearch],
    queryFn: async () => {
      if (!memberSearch || memberSearch.length < 2) return [];
      const { data } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .ilike('username', `%${memberSearch}%`)
        .neq('user_id', user?.id)
        .limit(5);
      return data || [];
    },
    enabled: memberSearch.length >= 2
  });

  // Create circle
  const createCircle = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from('audience_circles')
        .insert({ user_id: user.id, name });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewCircleName("");
      queryClient.invalidateQueries({ queryKey: ['audience-circles'] });
      toast({ title: "circle created" });
    },
    onError: (error: any) => {
      toast({
        title: "could not create the circle",
        description: error.message?.includes('duplicate') ? "you already have a circle with that name." : error.message,
        variant: "destructive"
      });
    }
  });

  // Delete circle
  const deleteCircle = useMutation({
    mutationFn: async (circleId: string) => {
      const { error } = await supabase
        .from('audience_circles')
        .delete()
        .eq('id', circleId);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedCircle(null);
      queryClient.invalidateQueries({ queryKey: ['audience-circles'] });
      toast({ title: "circle removed" });
    }
  });

  // Add member to circle
  const addMember = useMutation({
    mutationFn: async (memberUserId: string) => {
      if (!selectedCircle) throw new Error("No circle selected");
      const { error } = await supabase
        .from('circle_members')
        .insert({ circle_id: selectedCircle.id, member_user_id: memberUserId });
      if (error) throw error;
    },
    onSuccess: () => {
      setMemberSearch("");
      queryClient.invalidateQueries({ queryKey: ['circle-members'] });
      toast({ title: "added" });
    },
    onError: (error: any) => {
      toast({
        title: "could not add them",
        description: error.message?.includes('duplicate') ? "they are already in this circle." : error.message,
        variant: "destructive"
      });
    }
  });

  // Remove member from circle
  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('circle_members')
        .delete()
        .eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circle-members'] });
      toast({ title: "removed" });
    }
  });

  const canCreate = !!newCircleName.trim() && !createCircle.isPending;

  const handleCreateCircle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    createCircle.mutate(newCircleName.trim());
  };

  const toggleCircle = (circle: Circle) => {
    setMemberSearch("");
    setSelectedCircle(selectedCircle?.id === circle.id ? null : circle);
  };

  return (
    <>
      <div className="row px-5 sm:px-8 py-4">
        <p className="text-[15px] font-light text-foreground">circles</p>
        <p className="mt-0.5 text-[13px] font-light text-foreground/50">
          small named audiences. when you post, pick a circle and only they see it.
        </p>
        <form onSubmit={handleCreateCircle} className="mt-3 flex items-end gap-4">
          <Input
            value={newCircleName}
            onChange={(e) => setNewCircleName(e.target.value)}
            placeholder="new circle, e.g. close friends"
            aria-label="circle name"
            className="flex-1 h-9"
            maxLength={40}
          />
          <Button type="submit" variant="signal" size="sm" disabled={!canCreate} className="shrink-0">
            {createCircle.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "create"}
          </Button>
        </form>
      </div>

      {isLoading ? (
        <div className="row px-5 sm:px-8 py-4" aria-hidden>
          <div className="h-3.5 w-1/3 rounded bg-foreground/[0.06] animate-pulse" />
        </div>
      ) : (
        <div className="stagger">
          {circles?.map((circle, i) => {
            const open = selectedCircle?.id === circle.id;
            return (
              <div key={circle.id} style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
                <div className="row px-5 sm:px-8 py-3 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => toggleCircle(circle)}
                    aria-expanded={open}
                    aria-controls={`circle-${circle.id}`}
                    className="flex-1 min-w-0 text-left h-10 flex items-center gap-3"
                  >
                    <ChevronRight
                      className={`w-[15px] h-[15px] text-foreground/40 shrink-0 transition-transform duration-200 ease-soft ${open ? "rotate-90" : ""}`}
                      aria-hidden
                    />
                    <span className="text-[14px] font-light text-foreground truncate">{circle.name}</span>
                    <span className="text-[12px] font-light text-foreground/40">{open ? "" : "people"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCircle.mutate(circle.id)}
                    className="quiet h-10 px-2 -mr-2 rounded-md text-[13px] shrink-0"
                  >
                    remove
                  </button>
                </div>

                {open && (
                  <div id={`circle-${circle.id}`} className="border-l border-foreground/15 ml-5 sm:ml-8">
                    {members?.map((member) => (
                      <div key={member.id} className="row pl-4 pr-5 sm:pr-8 py-2.5 flex items-center gap-3">
                        <UserAvatar
                          avatarUrl={member.profile?.avatar_url}
                          username={member.profile?.username}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0 leading-tight">
                          <p className="text-[14px] font-light text-foreground truncate">
                            {member.profile?.display_name || member.profile?.username}
                          </p>
                          <p className="text-[12px] font-light text-foreground/40 truncate">@{member.profile?.username}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMember.mutate(member.id)}
                          className="quiet h-10 px-2 -mr-2 rounded-md text-[13px] shrink-0"
                        >
                          remove
                        </button>
                      </div>
                    ))}
                    {members?.length === 0 && (
                      <p className="pl-4 pr-5 sm:pr-8 py-2.5 text-[13px] font-light text-foreground/40">
                        nobody in here yet.
                      </p>
                    )}

                    <div className="row pl-4 pr-5 sm:pr-8 py-3">
                      <Input
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="add someone by username"
                        aria-label={`add someone to ${circle.name}`}
                        className="h-9 text-[14px]"
                        maxLength={30}
                      />
                      {memberSearch.length > 0 && memberSearch.length < 2 && (
                        <p className="mt-2 text-[12px] font-light text-foreground/40">type at least two letters.</p>
                      )}
                      {memberSearch.length >= 2 && searchResults?.length === 0 && (
                        <p className="mt-2 text-[12px] font-light text-foreground/40">nobody by that name.</p>
                      )}
                      {searchResults && searchResults.length > 0 && (
                        <ul className="mt-1">
                          {searchResults.map((profile) => (
                            <li key={profile.user_id}>
                              <button
                                type="button"
                                onClick={() => addMember.mutate(profile.user_id)}
                                disabled={addMember.isPending}
                                className="w-full flex items-center gap-3 py-2 text-left rounded-md hover:bg-foreground/[0.04] transition-colors duration-150 ease-soft"
                              >
                                <UserAvatar avatarUrl={profile.avatar_url} username={profile.username} size="sm" />
                                <span className="flex-1 min-w-0 leading-tight">
                                  <span className="block text-[14px] font-light text-foreground truncate">
                                    {profile.display_name || profile.username}
                                  </span>
                                  <span className="block text-[12px] font-light text-foreground/40 truncate">@{profile.username}</span>
                                </span>
                                <span className="text-[13px] font-light text-foreground/60 pr-1">add</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

export default AudienceCirclesManager;
