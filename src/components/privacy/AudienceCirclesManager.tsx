import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger 
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, X, Trash2, Loader2, UserPlus } from "lucide-react";
import UserAvatar from "@/components/UserAvatar";

interface Circle {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface CircleMember {
  id: string;
  member_user_id: string;
  profile?: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

const AudienceCirclesManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newCircleName, setNewCircleName] = useState("");
  const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [isAddingMember, setIsAddingMember] = useState(false);

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
      toast({ title: "Circle created" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message?.includes('duplicate') ? "Circle name already exists" : error.message,
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
      toast({ title: "Circle deleted" });
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
      setIsAddingMember(false);
      queryClient.invalidateQueries({ queryKey: ['circle-members'] });
      toast({ title: "Member added" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message?.includes('duplicate') ? "User already in circle" : error.message,
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
      toast({ title: "Member removed" });
    }
  });

  const handleCreateCircle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCircleName.trim()) return;
    createCircle.mutate(newCircleName.trim());
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-foreground/60" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Create new circle */}
      <form onSubmit={handleCreateCircle} className="flex gap-2">
        <Input
          value={newCircleName}
          onChange={(e) => setNewCircleName(e.target.value)}
          placeholder="New circle name (e.g., Close Friends, Work)"
          className="bg-background/50 border-border/50 rounded-lg font-light"
        />
        <Button 
          type="submit" 
          disabled={!newCircleName.trim() || createCircle.isPending}
          className="rounded-lg"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </form>

      {/* List of circles */}
      <div className="space-y-2">
        {circles?.map((circle) => (
          <div 
            key={circle.id}
            className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
              selectedCircle?.id === circle.id 
                ? 'border-foreground bg-accent/20' 
                : 'border-border/30 hover:border-border/50'
            }`}
            onClick={() => setSelectedCircle(selectedCircle?.id === circle.id ? null : circle)}
          >
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-foreground/60" />
              <span className="font-light">{circle.name}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                deleteCircle.mutate(circle.id);
              }}
              className="text-foreground/40 hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
        
        {circles?.length === 0 && (
          <p className="text-foreground/50 font-light text-sm text-center py-4">
            No circles yet. Create one to organize your audience.
          </p>
        )}
      </div>

      {/* Circle members */}
      {selectedCircle && (
        <div className="mt-4 p-4 rounded-lg bg-accent/10 border border-border/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-light">Members of {selectedCircle.name}</h3>
            <Dialog open={isAddingMember} onOpenChange={setIsAddingMember}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="rounded-lg font-light">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Member
                </Button>
              </DialogTrigger>
              <DialogContent className="glass-panel border-border/30">
                <DialogHeader>
                  <DialogTitle className="font-light">Add Member to {selectedCircle.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search by username..."
                    className="bg-background/50 border-border/50 rounded-lg font-light"
                  />
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {searchResults?.map((profile) => (
                      <div 
                        key={profile.user_id}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/20 cursor-pointer"
                        onClick={() => addMember.mutate(profile.user_id)}
                      >
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            avatarUrl={profile.avatar_url}
                            username={profile.username}
                            size="sm"
                          />
                          <div>
                            <p className="font-light">{profile.display_name || profile.username}</p>
                            <p className="text-foreground/50 text-sm">@{profile.username}</p>
                          </div>
                        </div>
                        <Plus className="w-4 h-4 text-foreground/60" />
                      </div>
                    ))}
                    {memberSearch.length >= 2 && searchResults?.length === 0 && (
                      <p className="text-foreground/50 text-sm text-center py-4">No users found</p>
                    )}
                    {memberSearch.length < 2 && memberSearch.length > 0 && (
                      <p className="text-foreground/50 text-sm text-center py-4">Type at least 2 characters</p>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="space-y-2">
            {members?.map((member) => (
              <div 
                key={member.id}
                className="flex items-center justify-between p-2 rounded-lg bg-background/30"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar
                    avatarUrl={member.profile?.avatar_url}
                    username={member.profile?.username}
                    size="sm"
                  />
                  <div>
                    <p className="font-light text-sm">{member.profile?.display_name || member.profile?.username}</p>
                    <p className="text-foreground/50 text-xs">@{member.profile?.username}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeMember.mutate(member.id)}
                  className="text-foreground/40 hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            {members?.length === 0 && (
              <p className="text-foreground/50 font-light text-sm text-center py-2">
                No members yet
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AudienceCirclesManager;
