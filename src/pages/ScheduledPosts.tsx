import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { 
  Calendar, Clock, Loader2, Trash2, Send, Edit2 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

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
      toast({ title: "Scheduled post cancelled" });
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
      toast({ title: "Post published!" });
    }
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/60" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          <Calendar className="w-6 h-6 text-foreground/80" />
          <h1 className="text-2xl font-light text-foreground">Scheduled Posts</h1>
        </div>

        {scheduledPosts && scheduledPosts.length > 0 ? (
          <div className="space-y-4">
            {scheduledPosts.map((post: ScheduledPost) => (
              <div 
                key={post.id}
                className="glass-card rounded-xl p-4 sm:p-6"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2 text-foreground/60">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-light">
                      Scheduled for {format(new Date(post.scheduled_for), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => publishNow.mutate(post)}
                      disabled={publishNow.isPending}
                      className="text-foreground/60 hover:text-foreground"
                    >
                      <Send className="w-4 h-4 mr-1" />
                      Publish Now
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelScheduled.mutate(post.id)}
                      className="text-foreground/40 hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                <p className="text-foreground font-light leading-relaxed whitespace-pre-wrap">
                  {post.content}
                </p>
                
                {post.media_urls && post.media_urls.length > 0 && (
                  <div className="mt-3 text-foreground/50 text-sm">
                    {post.media_urls.length} media file{post.media_urls.length > 1 ? 's' : ''} attached
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-xl p-8 text-center">
            <Calendar className="w-12 h-12 mx-auto text-foreground/30 mb-4" />
            <h2 className="text-lg font-light text-foreground mb-2">No scheduled posts</h2>
            <p className="text-foreground/60 font-light text-sm">
              Schedule posts from the composer on your dashboard
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ScheduledPosts;
