import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FileText, Trash2, Loader2, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import EmptyState from "@/components/ui/empty-state";

const Drafts = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: drafts, isLoading } = useQuery({
    queryKey: ['drafts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('post_drafts')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      return data || [];
    },
    enabled: !!user
  });

  const deleteDraft = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('post_drafts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
      toast({ title: "Draft deleted" });
    }
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          <FileText className="w-6 h-6 text-foreground/80" />
          <h1 className="text-2xl font-light text-foreground">Drafts</h1>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-foreground/60" /></div>
        ) : drafts && drafts.length > 0 ? (
          <div className="space-y-3">
            {drafts.map(draft => (
              <div key={draft.id} className="glass-card rounded-xl p-4 flex items-start justify-between gap-3 hover:bg-accent/10 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-light line-clamp-3">{draft.content || 'Empty draft'}</p>
                  <p className="text-foreground/40 text-xs font-light mt-2">Last edited {formatDate(draft.updated_at)}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => deleteDraft.mutate(draft.id)} className="text-foreground/40 hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="No drafts yet"
            description="Anything you start writing and leave unfinished is saved here automatically."
            actionLabel="Start writing"
            actionTo="/dashboard"
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default Drafts;
