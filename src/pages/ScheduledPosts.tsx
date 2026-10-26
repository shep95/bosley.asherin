import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";
import { friendlyDbError } from "@/lib/dbErrors";
import { FEED_QUERY_ROOTS } from "@/lib/postFeed";
import type { Tables } from "@/integrations/supabase/types";

type ScheduledPost = Tables<"scheduled_posts">;

const ScheduledPosts = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: scheduledPosts, isLoading } = useQuery({
    queryKey: ['scheduled-posts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('scheduled_posts')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('scheduled_for', { ascending: true })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user
  });

  const cancelScheduled = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from('scheduled_posts')
        .update({ status: 'cancelled' })
        .eq('id', postId)
        .eq('status', 'pending');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] });
      queryClient.invalidateQueries({ queryKey: ['room-rail'] });
      toast({ title: "cancelled. it will not send." });
    },
    onError: (e) => toast({ title: friendlyDbError(e, "could not cancel it. try again."), variant: "destructive" }),
  });

  const publishNow = useMutation({
    mutationFn: async (scheduledPost: ScheduledPost) => {
      if (!user) throw new Error("Not authenticated");

      // Claim it first, so the scheduled job (which publishes due posts on
      // its own) and this button can never both send it.
      const { data: claimed, error: claimError } = await supabase
        .from('scheduled_posts')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', scheduledPost.id)
        .eq('status', 'pending')
        .select('id');
      if (claimError) throw claimError;
      if (!claimed || claimed.length === 0) return 'already';

      // Every column the two tables share, so nothing (circles, expiry) is lost.
      const { error: postError } = await supabase.from('posts').insert({
        user_id: user.id,
        content: scheduledPost.content,
        media_urls: scheduledPost.media_urls ?? [],
        visibility: scheduledPost.visibility === 'circles' ? 'circle' : (scheduledPost.visibility ?? 'public'),
        circle_ids: scheduledPost.circle_ids ?? [],
        expires_at: scheduledPost.expires_at,
      });

      if (postError) {
        // Put it back in the queue; it was never posted.
        await supabase
          .from('scheduled_posts')
          .update({ status: 'pending', published_at: null })
          .eq('id', scheduledPost.id);
        throw postError;
      }
      return 'sent';
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] });
      queryClient.invalidateQueries({ queryKey: ['room-rail'] });
      for (const root of FEED_QUERY_ROOTS) queryClient.invalidateQueries({ queryKey: [root] });
      toast({ title: result === 'already' ? "it already went out." : "sent" });
    },
    onError: (e) => toast({ title: friendlyDbError(e, "could not send it. try again."), variant: "destructive" }),
  });

  const count = scheduledPosts?.length ?? 0;

  return (
    <DashboardLayout>
      <PageHeader
        title="scheduled"
        subtitle={count > 0 ? `posts waiting for their time. they go out on their own. ${count} in the queue.` : "posts waiting for their time. they go out on their own."}
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
          {scheduledPosts.map((post, idx) => {
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
          description="write a post and pick a time from the composer. it waits here, then goes out on its own."
          actionLabel="write something"
          actionTo="/dashboard"
        />
      )}
    </DashboardLayout>
  );
};

export default ScheduledPosts;
