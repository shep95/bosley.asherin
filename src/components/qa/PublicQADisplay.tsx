import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import EmptyState from "@/components/ui/empty-state";

interface PublicQADisplayProps {
  userId: string;
}

/** Questions this person chose to answer in public. Rows, no boxes. */
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
      <div className="stagger" aria-busy="true" aria-label="loading answers">
        {[0, 1].map((i) => (
          <div key={i} className="row px-5 sm:px-8 py-5 space-y-2.5" style={{ "--i": i } as React.CSSProperties}>
            <div className="h-3 w-1/2 rounded bg-foreground/[0.05] animate-pulse" />
            <div className="h-3 w-full rounded bg-foreground/[0.06] animate-pulse" />
            <div className="h-3 w-3/4 rounded bg-foreground/[0.06] animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!publicQA || publicQA.length === 0) {
    return (
      <EmptyState
        title="no answers yet."
        description="questions they answer in public show up here."
      />
    );
  }

  return (
    <div className="stagger">
      {publicQA.map((qa, idx) => (
        <div key={qa.id} className="row px-5 sm:px-8 py-5" style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
          <p className="text-[13px] font-light text-foreground/50 leading-relaxed [overflow-wrap:anywhere]">
            <span className="text-foreground/30">asked anonymously · </span>
            {qa.question_text}
          </p>
          <p className="mt-2 text-[15px] font-light leading-[1.65] text-foreground/90 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {qa.answer_text}
          </p>
        </div>
      ))}
    </div>
  );
};

export default PublicQADisplay;
