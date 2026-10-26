import { useRef, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import { friendlyDbError, isUniqueViolation } from "@/lib/dbErrors";
import { FEED_QUERY_ROOTS } from "@/lib/postFeed";

const MAX = 500;

const ThreadComposer = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<string[]>(["", ""]);
  const [touched, setTouched] = useState(false);
  // Ids for the current text, reused on retry: if a previous attempt did land
  // but its response was lost, the retry hits a duplicate key instead of
  // posting the thread twice.
  const attemptRef = useRef<{ signature: string; ids: string[] } | null>(null);

  const updatePost = (idx: number, val: string) => {
    setPosts(p => p.map((x, i) => i === idx ? val : x));
  };

  const addPost = () => setPosts(p => [...p, ""]);
  const removePost = (idx: number) => setPosts(p => p.filter((_, i) => i !== idx));

  const publish = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("not signed in.");
      const filled = posts.map(p => p.trim()).filter(Boolean);
      if (filled.length < 2) throw new Error("a thread is at least two posts.");
      if (filled.some(p => p.length > MAX)) throw new Error(`each post fits in ${MAX} characters.`);

      const signature = JSON.stringify(filled);
      if (attemptRef.current?.signature !== signature) {
        attemptRef.current = { signature, ids: filled.map(() => crypto.randomUUID()) };
      }
      const ids = attemptRef.current.ids;
      const headId = ids[0];

      // One statement: every post of the thread lands, or none does. A rate
      // limit or any other failure leaves nothing half-posted.
      const { error } = await supabase.from('posts').insert(
        filled.map((content, i) => ({
          id: ids[i],
          content,
          user_id: user.id,
          is_thread: true,
          thread_id: headId,
          thread_position: i,
        }))
      );
      // Duplicate key on a retry means the earlier attempt went through.
      if (error && !isUniqueViolation(error)) throw error;
      return { id: headId, count: filled.length };
    },
    onSuccess: (head) => {
      attemptRef.current = null;
      for (const root of FEED_QUERY_ROOTS) qc.invalidateQueries({ queryKey: [root] });
      toast({ title: "thread posted", description: `${head.count} posts, in order.` });
      navigate(`/post/${head.id}`);
    },
    onError: (e) => toast({
      title: "could not post the thread",
      description: e instanceof Error && !('code' in e)
        ? e.message
        : friendlyDbError(e, "nothing was posted. try again."),
      variant: "destructive",
    })
  });

  const filledCount = posts.filter(p => p.trim()).length;
  const tooLong = posts.some(p => p.length > MAX);
  const valid = filledCount >= 2 && !tooLong;
  const hint = tooLong ? `each post fits in ${MAX} characters.` : filledCount < 2 ? "a thread is at least two posts." : null;

  return (
    <DashboardLayout>
      <PageHeader
        title="thread"
        subtitle="several posts, one line of thought. they go out together."
      />

      <div className="stagger">
        {posts.map((p, idx) => (
          <div key={idx} className="row px-5 sm:px-8 py-5 flex items-start gap-4" style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
            <span className="w-6 shrink-0 pt-1 text-[12px] font-light tabular-nums text-foreground/30 text-right">{idx + 1}</span>
            <div className="flex-1 min-w-0">
              <textarea
                value={p}
                onChange={(e) => updatePost(idx, e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder={idx === 0 ? "start here." : "and then."}
                rows={3}
                maxLength={MAX}
                aria-label={`post ${idx + 1}`}
                className="w-full bg-transparent resize-none text-[15.5px] font-light leading-[1.65] text-foreground placeholder:text-foreground/35 focus:outline-none"
              />
              <div className="mt-1 flex items-center justify-between text-[12px] font-light tabular-nums">
                <span className={p.length > MAX - 20 ? "text-foreground/80" : "text-foreground/30"}>{p.length > 0 ? `${p.length} / ${MAX}` : ""}</span>
                {posts.length > 2 && (
                  <button onClick={() => removePost(idx)} aria-label={`remove post ${idx + 1}`} className="quiet p-2 -mr-2 rounded-md">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 sm:px-8 py-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <button onClick={addPost} className="quiet text-[13px] h-10 px-2 -ml-2 rounded-md">add another</button>
          {touched && hint && <p className="mt-1 text-[12px] font-light text-foreground/50">{hint}</p>}
        </div>
        <Button variant="signal" onClick={() => publish.mutate()} disabled={!valid || publish.isPending}>
          {publish.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "post thread"}
        </Button>
      </div>
    </DashboardLayout>
  );
};

export default ThreadComposer;
