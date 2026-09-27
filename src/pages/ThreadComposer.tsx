import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, GitBranch, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ThreadComposer = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<string[]>(["", ""]);

  const updatePost = (idx: number, val: string) => {
    setPosts(p => p.map((x, i) => i === idx ? val : x));
  };

  const addPost = () => setPosts(p => [...p, ""]);
  const removePost = (idx: number) => setPosts(p => p.filter((_, i) => i !== idx));

  const publish = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const filled = posts.map(p => p.trim()).filter(Boolean);
      if (filled.length < 2) throw new Error("Thread needs at least 2 posts");
      if (filled.some(p => p.length > 500)) throw new Error("Each post max 500 chars");

      // Insert first post as the head of thread
      const { data: head, error: e1 } = await supabase.from('posts').insert({
        content: filled[0],
        user_id: user.id,
        is_thread: true,
        thread_position: 0,
      }).select().single();
      if (e1) throw e1;

      // Set thread_id to head's id
      await supabase.from('posts').update({ thread_id: head.id }).eq('id', head.id);

      // Insert subsequent posts referencing the head id
      for (let i = 1; i < filled.length; i++) {
        const { error } = await supabase.from('posts').insert({
          content: filled[i],
          user_id: user.id,
          is_thread: true,
          thread_id: head.id,
          thread_position: i,
        });
        if (error) throw error;
      }
      return head;
    },
    onSuccess: (head) => {
      qc.invalidateQueries({ queryKey: ['posts'] });
      toast({ title: "Thread published", description: `${posts.filter(p => p.trim()).length} posts in your thread.` });
      navigate(`/post/${head.id}`);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" })
  });

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          <GitBranch className="w-6 h-6 text-foreground/80" />
          <h1 className="text-2xl font-light text-foreground">Thread Composer</h1>
        </div>

        <div className="space-y-3">
          {posts.map((p, idx) => (
            <div key={idx} className="glass-card rounded-xl p-4 relative">
              <div className="absolute -left-3 top-6 w-6 h-6 rounded-full bg-foreground/10 border border-foreground/20 flex items-center justify-center text-xs font-medium">
                {idx + 1}
              </div>
              <Textarea
                value={p}
                onChange={(e) => updatePost(idx, e.target.value)}
                placeholder={idx === 0 ? "Start your thread..." : "Continue the thread..."}
                className="bg-transparent border-none resize-none min-h-[80px] focus-visible:ring-0 p-0"
                maxLength={500}
              />
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs font-light ${p.length > 480 ? 'text-destructive' : 'text-foreground/40'}`}>
                  {p.length}/500
                </span>
                {posts.length > 2 && (
                  <Button variant="ghost" size="sm" onClick={() => removePost(idx)} className="text-foreground/40 hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={addPost} className="flex-1">
            <Plus className="w-4 h-4 mr-1" /> Add post
          </Button>
          <Button onClick={() => publish.mutate()} disabled={publish.isPending} className="flex-1">
            {publish.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-1" /> Publish thread</>}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ThreadComposer;
