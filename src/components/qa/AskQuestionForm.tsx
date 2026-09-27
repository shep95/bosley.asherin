import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { HelpCircle, Send, Loader2 } from "lucide-react";

interface AskQuestionFormProps {
  recipientUserId: string;
  recipientUsername: string;
}

const AskQuestionForm = ({ recipientUserId, recipientUsername }: AskQuestionFormProps) => {
  const [question, setQuestion] = useState("");
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
        title: "Question sent!", 
        description: `Your anonymous question was sent to @${recipientUsername}` 
      });
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  if (!user || user.id === recipientUserId) return null;

  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-foreground/70">
        <HelpCircle className="w-4 h-4" />
        <span className="text-sm font-light">Ask anonymously</span>
      </div>
      
      <Textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder={`Ask @${recipientUsername} anything...`}
        className="bg-background/50 border-border/50 rounded-lg font-light resize-none min-h-[80px]"
        maxLength={500}
      />
      
      <div className="flex items-center justify-between">
        <span className="text-xs text-foreground/40">
          {question.length}/500 • Your identity is hidden
        </span>
        <Button
          onClick={() => submitQuestion.mutate()}
          disabled={!question.trim() || submitQuestion.isPending}
          size="sm"
          className="rounded-lg bg-foreground text-background"
        >
          {submitQuestion.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4 mr-1" />
              Send
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default AskQuestionForm;
