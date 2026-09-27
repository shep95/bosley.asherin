import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import EmptyState from "@/components/ui/empty-state";
import PageHeader from "@/components/layout/PageHeader";

const Drafts = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
      toast({ title: "draft deleted" });
    }
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase();
  };

  return (
    <DashboardLayout>
      <PageHeader title="drafts" subtitle="unfinished. saved on this device and your account." />

      {isLoading ? (
        <div className="stagger" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="row px-5 sm:px-8 py-5 space-y-2.5" style={{ "--i": i } as React.CSSProperties}>
              <div className="h-3 w-full rounded bg-foreground/[0.06] animate-pulse" />
              <div className="h-3 w-3/4 rounded bg-foreground/[0.06] animate-pulse" />
              <div className="h-3 w-16 rounded bg-foreground/[0.05] animate-pulse" />
            </div>
          ))}
        </div>
      ) : drafts && drafts.length > 0 ? (
        <div className="stagger">
          {drafts.map((draft, idx) => (
            <div key={draft.id} className="row px-5 sm:px-8 py-5 flex items-start justify-between gap-4" style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
              <button
                type="button"
                onClick={() => navigate("/dashboard", { state: { compose: true, draft: { id: draft.id, content: draft.content ?? "" } } })}
                className="flex-1 min-w-0 text-left group"
              >
                <p className={`text-[15px] font-light leading-relaxed line-clamp-3 whitespace-pre-wrap [overflow-wrap:anywhere] ${draft.content ? "text-foreground/90" : "text-foreground/35"}`}>
                  {draft.content || "empty"}
                </p>
                <p className="mt-2 text-[12px] font-light text-foreground/40 tabular-nums">
                  edited {formatDate(draft.updated_at)}
                  <span className="ml-3 text-foreground/40 group-hover:text-foreground transition-colors">continue →</span>
                </p>
              </button>
              <button
                onClick={() => deleteDraft.mutate(draft.id)}
                aria-label="delete draft"
                className="quiet p-2 -mr-2 rounded-md hover:text-destructive shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="nothing unfinished."
          description="anything you start and leave is kept here until you post it or let it go."
          actionLabel="start writing"
          actionTo="/dashboard"
        />
      )}
    </DashboardLayout>
  );
};

export default Drafts;
