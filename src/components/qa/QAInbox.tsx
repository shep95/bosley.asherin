import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2 } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";

interface Question {
  id: string;
  question_text: string;
  created_at: string;
  answered_at: string | null;
  answer_text: string | null;
  is_public: boolean;
  is_hidden: boolean;
}

const ANSWER_MAX = 1000;

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="px-5 sm:px-8 pt-6 pb-2 text-[10px] font-light uppercase tracking-[0.24em] text-foreground/35">
    {children}
  </p>
);

/**
 * Questions people asked you without a name attached. Unanswered ones come
 * first; answering happens in place, and "answer" is the only warm thing here.
 */
const QAInbox = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const { data: questions, isLoading } = useQuery({
    queryKey: ['anonymous-questions', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('anonymous_questions')
        .select('*')
        .eq('recipient_user_id', user.id)
        .eq('is_hidden', false)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user
  });

  const answerQuestion = useMutation({
    mutationFn: async () => {
      if (!selectedQuestion || !answer.trim()) throw new Error("Invalid");

      const { error } = await supabase
        .from('anonymous_questions')
        .update({
          answer_text: answer.trim(),
          answered_at: new Date().toISOString(),
          is_public: isPublic
        })
        .eq('id', selectedQuestion.id)
        .eq('recipient_user_id', user!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedQuestion(null);
      setAnswer("");
      queryClient.invalidateQueries({ queryKey: ['anonymous-questions'] });
      toast({ title: "answered" });
    },
    onError: () => {
      toast({ title: "could not post the answer", description: "check your connection and try again.", variant: "destructive" });
    }
  });

  const deleteQuestion = useMutation({
    mutationFn: async (questionId: string) => {
      const { error } = await supabase
        .from('anonymous_questions')
        .delete()
        .eq('id', questionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anonymous-questions'] });
      toast({ title: "question removed" });
    }
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) return 'now';
    if (hours < 24) return `${hours}h`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase();
  };

  if (isLoading) {
    return (
      <div className="stagger" aria-busy="true" aria-label="loading questions">
        {[0, 1, 2].map((i) => (
          <div key={i} className="row px-5 sm:px-8 py-5 space-y-2.5" style={{ "--i": i } as React.CSSProperties}>
            <div className="h-3 w-3/4 rounded bg-foreground/[0.06] animate-pulse" />
            <div className="h-3 w-1/4 rounded bg-foreground/[0.05] animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const unanswered = questions?.filter(q => !q.answered_at) || [];
  const answered = questions?.filter(q => q.answered_at) || [];

  if (unanswered.length === 0 && answered.length === 0) {
    return (
      <EmptyState
        title="no questions yet."
        description="anyone can ask you something from your profile without signing their name. what you answer in public shows up there."
      />
    );
  }

  const startAnswer = (q: Question) => {
    setSelectedQuestion(q);
    setAnswer("");
    setIsPublic(true);
  };

  const canAnswer = answer.trim().length > 0 && !answerQuestion.isPending;

  const deleteButton = (id: string) => (
    <button
      type="button"
      onClick={() => deleteQuestion.mutate(id)}
      disabled={deleteQuestion.isPending}
      aria-label="remove question"
      className="quiet hover:text-destructive p-2 -mr-2 rounded-md"
    >
      <Trash2 className="w-[15px] h-[15px]" />
    </button>
  );

  return (
    <div>
      {unanswered.length > 0 && (
        <>
          <SectionLabel>unanswered · {unanswered.length}</SectionLabel>
          <div className="stagger">
            {unanswered.map((q, idx) => {
              const isOpen = selectedQuestion?.id === q.id;
              return (
                <div key={q.id} className="row px-5 sm:px-8 py-4" style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-light leading-[1.65] text-foreground/90 [overflow-wrap:anywhere]">{q.question_text}</p>
                      <p className="mt-1 text-[12px] font-light text-foreground/35 tabular-nums">asked {formatDate(q.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!isOpen && (
                        <button type="button" onClick={() => startAnswer(q)} className="quiet h-9 px-2 rounded-md text-[13px]">
                          answer
                        </button>
                      )}
                      {deleteButton(q.id)}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-3 pl-0">
                      <label className="sr-only" htmlFor={`answer-${q.id}`}>your answer</label>
                      <textarea
                        id={`answer-${q.id}`}
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="your answer."
                        maxLength={ANSWER_MAX}
                        rows={3}
                        autoFocus
                        className="field w-full text-[15px] font-light leading-relaxed text-foreground placeholder:text-foreground/30 resize-none"
                      />
                      <div className="mt-3 flex items-center gap-3 flex-wrap">
                        <Button variant="signal" size="sm" onClick={() => answerQuestion.mutate()} disabled={!canAnswer}>
                          {answerQuestion.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          answer
                        </Button>
                        <button type="button" onClick={() => setSelectedQuestion(null)} className="quiet h-9 px-2 rounded-md text-[13px]">
                          cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsPublic((v) => !v)}
                          aria-pressed={isPublic}
                          className="quiet h-9 px-2 rounded-md text-[13px]"
                        >
                          {isPublic ? "shown on your profile" : "kept private"}
                        </button>
                        <span className="ml-auto text-[12px] font-light text-foreground/35 tabular-nums">
                          {answer.length}/{ANSWER_MAX}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {answered.length > 0 && (
        <>
          <SectionLabel>answered · {answered.length}</SectionLabel>
          <div className="stagger">
            {answered.map((q, idx) => (
              <div key={q.id} className="row px-5 sm:px-8 py-4" style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-light text-foreground/50 leading-relaxed [overflow-wrap:anywhere]">{q.question_text}</p>
                    <p className="mt-1.5 text-[15px] font-light leading-[1.65] text-foreground/90 whitespace-pre-wrap [overflow-wrap:anywhere]">{q.answer_text}</p>
                    <p className="mt-1.5 text-[12px] font-light text-foreground/35">
                      {q.is_public ? "on your profile" : "private"}
                      <span className="mx-1.5 text-foreground/20">·</span>
                      <span className="tabular-nums">{formatDate(q.answered_at || q.created_at)}</span>
                    </p>
                  </div>
                  {deleteButton(q.id)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default QAInbox;
