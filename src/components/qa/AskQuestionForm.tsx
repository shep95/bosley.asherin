import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface AskQuestionFormProps {
  recipientUserId: string;
  recipientUsername: string;
}

const QUESTION_MAX = 500;

/**
 * One line that opens when you touch it. The only accent on this tab is the
 * "ask" button, and it stays dim until there is something to send.
 */
const AskQuestionForm = ({ recipientUserId, recipientUsername }: AskQuestionFormProps) => {
  const [question, setQuestion] = useState("");
  const [focused, setFocused] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const submitQuestion = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!question.trim()) throw new Error("Question is empty");

      const { error } = await supabase
        .from('anonymous_questions')
        .insert({
          recipient_user_id: recipientUserId,
          question_text: question.trim()
        });

      if (error) throw error;
    },
    onSuccess: () => {
      setQuestion("");
      toast({
        title: "question sent",
        description: `@${recipientUsername} will not see who asked.`
      });
    },
    onError: () => {
      toast({
        title: "could not send",
        description: "check your connection and try again.",
        variant: "destructive"
      });
    }
  });

  if (!user || user.id === recipientUserId) return null;

  const open = focused || question.length > 0;
  const canSend = question.trim().length > 0 && !submitQuestion.isPending;

  return (
    <div className="row px-5 sm:px-8 py-4">
      <label className="sr-only" htmlFor="ask-question">ask a question</label>
      <textarea
        id="ask-question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={`ask @${recipientUsername} anything. they will not see who asked.`}
        maxLength={QUESTION_MAX}
        rows={open ? 3 : 1}
        className="field w-full text-[15px] font-light leading-relaxed text-foreground placeholder:text-foreground/30 resize-none transition-[height] duration-200 ease-soft"
      />
      {open && (
        <div className="mt-3 flex items-center gap-3">
          <Button
            variant="signal"
            size="sm"
            onClick={() => submitQuestion.mutate()}
            disabled={!canSend}
          >
            {submitQuestion.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            ask
          </Button>
          <span className="text-[12px] font-light text-foreground/40">anonymous.</span>
          <span className="ml-auto text-[12px] font-light text-foreground/35 tabular-nums">
            {question.length}/{QUESTION_MAX}
          </span>
        </div>
      )}
    </div>
  );
};

export default AskQuestionForm;
