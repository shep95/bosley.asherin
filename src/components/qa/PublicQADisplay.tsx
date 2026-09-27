import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, MessageSquare, Loader2 } from "lucide-react";

interface PublicQADisplayProps {
  userId: string;
}

const PublicQADisplay = ({ userId }: PublicQADisplayProps) => {
  const { user } = useAuth();

  const { data: publicQA, isLoading } = useQuery({
    queryKey: ['public-qa', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('anonymous_questions')
        .select('*')
        .eq('recipient_user_id', userId)
        .eq('is_public', true)
        .not('answered_at', 'is', null)
        .order('answered_at', { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!user
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-foreground/60" />
      </div>
    );
  }

  if (!publicQA || publicQA.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <HelpCircle className="w-5 h-5 text-foreground/60" />
        <h3 className="text-lg font-light text-foreground">Q&A</h3>
      </div>
      
      <div className="space-y-3">
        {publicQA.map((qa) => (
          <div key={qa.id} className="glass-card rounded-xl p-4 space-y-2">
            <div className="flex items-start gap-2">
              <MessageSquare className="w-4 h-4 text-foreground/40 mt-0.5 shrink-0" />
              <p className="text-foreground/60 font-light text-sm">{qa.question_text}</p>
            </div>
            <p className="text-foreground font-light pl-6">{qa.answer_text}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PublicQADisplay;
