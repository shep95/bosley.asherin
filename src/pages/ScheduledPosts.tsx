import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";

interface ScheduledPost {
  id: string;
  content: string;
  scheduled_for: string;
  status: string;
  media_urls: string[];
  visibility: string;
}

const ScheduledPosts = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: scheduledPosts, isLoading } = useQuery({
    queryKey: ['scheduled-posts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('scheduled_posts')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('scheduled_for', { ascending: true });
      return data || [];
    },
    enabled: !!user
  });

  const cancelScheduled = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from('scheduled_posts')
        .update({ status: 'cancelled' })
        .eq('id', postId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] });
      toast({ title: "cancelled. it will not send." });
    }
  });

  const publishNow = useMutation({
    mutationFn: async (scheduledPost: ScheduledPost) => {
      if (!user) throw new Error("Not authenticated");

      // Create the actual post
      const { error: postError } = await supabase.from('posts').insert({
        content: scheduledPost.content,
        user_id: user.id,
        media_urls: scheduledPost.media_urls,
        visibility: scheduledPost.visibility
      });

      if (postError) throw postError;

      // Mark scheduled post as published
      const { error: updateError } = await supabase
        .from('scheduled_posts')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', scheduledPost.id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast({ title: "sent" });
    }
  });

  const count = scheduledPosts?.length ?? 0;

  return (
    <DashboardLayout>
      <PageHeader
        title="scheduled"
        subtitle={count > 0 ? `posts waiting for their time. ${count} in the queue.` : "posts waiting for their time."}
      />

      {isLoading ? (
        <div className="stagger" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="row px-5 sm:px-8 py-5 space-y-2.5" style={{ "--i": i } as React.CSSProperties}>
              <div className="h-3 w-40 rounded bg-foreground/[0.05] animate-pulse" />
              <div className="h-3 w-full rounded bg-foreground/[0.06] animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-foreground/[0.06] animate-pulse" />
            </div>
          ))}
        </div>
      ) : scheduledPosts && scheduledPosts.length > 0 ? (
        <div className="stagger">
          {(scheduledPosts as ScheduledPost[]).map((post, idx) => {
            const sending = publishNow.isPending && publishNow.variables?.id === post.id;
            return (
              <div key={post.id} className="row px-5 sm:px-8 py-5" style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
                <p className="text-[12px] font-light text-foreground/40 tabular-nums">
                  sends {format(new Date(post.scheduled_for), "EEE d MMM · HH:mm").toLowerCase()}
                  {post.media_urls && post.media_urls.length > 0 && (
                    <> · {post.media_urls.length} {post.media_urls.length === 1 ? "attachment" : "attachments"}</>
                  )}
                </p>
                <p className="mt-2 text-[15.5px] font-light leading-[1.65] text-foreground/90 whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {post.content}
                </p>
                <div className="mt-3 -ml-2 flex items-center gap-1 text-[13px]">
                  <button
                    onClick={() => publishNow.mutate(post)}
                    disabled={publishNow.isPending}
                    className="quiet h-10 px-2 rounded-md inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    send now
                  </button>
                  <button
                    onClick={() => cancelScheduled.mutate(post.id)}
                    disabled={cancelScheduled.isPending}
                    aria-label="cancel scheduled post"
                    className="quiet h-10 px-2 rounded-md hover:text-destructive ml-auto -mr-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="nothing scheduled."
          description="write a post and pick a time from the composer. it waits here until then."
          actionLabel="write something"
          actionTo="/dashboard"
        />
      )}
    </DashboardLayout>
  );
};

export default ScheduledPosts;
