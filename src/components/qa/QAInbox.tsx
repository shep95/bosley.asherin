import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { 
  HelpCircle, Loader2, Trash2, Send, Eye, EyeOff, 
  MessageSquare, Clock 
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Question {
  id: string;
  question_text: string;
  created_at: string;
  answered_at: string | null;
  answer_text: string | null;
  is_public: boolean;
  is_hidden: boolean;
}

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
      toast({ title: "Answer posted!" });
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
      toast({ title: "Question deleted" });
    }
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-foreground/60" />
      </div>
    );
  }

  const unanswered = questions?.filter(q => !q.answered_at) || [];
  const answered = questions?.filter(q => q.answered_at) || [];

  return (
    <div className="space-y-6">
      {/* Unanswered questions */}
      <div>
        <h3 className="text-lg font-light text-foreground mb-4 flex items-center gap-2">
          <HelpCircle className="w-5 h-5" />
          Unanswered ({unanswered.length})
        </h3>
        
        {unanswered.length > 0 ? (
          <div className="space-y-3">
            {unanswered.map((q) => (
              <div key={q.id} className="glass-card rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-foreground font-light flex-1">{q.question_text}</p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedQuestion(q);
                        setAnswer("");
                        setIsPublic(true);
                      }}
                      className="text-primary"
                    >
                      <MessageSquare className="w-4 h-4 mr-1" />
                      Answer
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteQuestion.mutate(q.id)}
                      className="text-foreground/40 hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 text-foreground/40 text-xs">
                  <Clock className="w-3 h-3" />
                  {formatDate(q.created_at)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-foreground/50 font-light text-sm text-center py-4">
            No unanswered questions
          </p>
        )}
      </div>

      {/* Answered questions */}
      {answered.length > 0 && (
        <div>
          <h3 className="text-lg font-light text-foreground mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Answered ({answered.length})
          </h3>
          
          <div className="space-y-3">
            {answered.map((q) => (
              <div key={q.id} className="glass-card rounded-xl p-4">
                <p className="text-foreground/70 font-light text-sm mb-2">{q.question_text}</p>
                <p className="text-foreground font-light">{q.answer_text}</p>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2 text-foreground/40 text-xs">
                    {q.is_public ? (
                      <><Eye className="w-3 h-3" /> Public</>
                    ) : (
                      <><EyeOff className="w-3 h-3" /> Private</>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteQuestion.mutate(q.id)}
                    className="text-foreground/40 hover:text-destructive h-6 px-2"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Answer dialog */}
      <Dialog open={!!selectedQuestion} onOpenChange={() => setSelectedQuestion(null)}>
        <DialogContent className="glass-panel border-border/30">
          <DialogHeader>
            <DialogTitle className="font-light">Answer Question</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-accent/10 border border-border/20">
              <p className="text-foreground font-light">{selectedQuestion?.question_text}</p>
            </div>
            
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Write your answer..."
              className="bg-background/50 border-border/50 rounded-lg font-light resize-none min-h-[100px]"
              maxLength={1000}
            />
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                <Label className="text-sm font-light text-foreground/70">
                  {isPublic ? "Show on my profile" : "Keep private"}
                </Label>
              </div>
              
              <Button
                onClick={() => answerQuestion.mutate()}
                disabled={!answer.trim() || answerQuestion.isPending}
                className="rounded-lg bg-foreground text-background"
              >
                {answerQuestion.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-1" />
                    Post Answer
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QAInbox;
