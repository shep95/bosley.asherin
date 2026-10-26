import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { friendlyDbError } from "@/lib/dbErrors";

interface PollDisplayProps {
  postId: string;
}

type PollResultRow = {
  poll_id: string;
  question: string;
  ends_at: string | null;
  option_id: string;
  option_text: string;
  position: number;
  votes: number;
  total_votes: number;
  my_option_id: string | null;
};

type PollState = {
  pollId: string;
  question: string;
  endsAt: string | null;
  options: { id: string; text: string; votes: number }[];
  total: number;
  myOptionId: string | null;
};

const toPollState = (rows: PollResultRow[]): PollState | null => {
  if (rows.length === 0) return null;
  const first = rows[0];
  return {
    pollId: first.poll_id,
    question: first.question,
    endsAt: first.ends_at,
    options: rows.map((r) => ({ id: r.option_id, text: r.option_text, votes: Number(r.votes) || 0 })),
    total: Number(first.total_votes) || 0,
    myOptionId: first.my_option_id,
  };
};

/**
 * A poll under a post. Real totals come from get_poll_results (votes are not
 * readable row by row, which is why counting visible rows always said
 * "1 vote, 100%"). Mount this only for posts that have a poll — the feed knows
 * from its page-level polls lookup — so a card without a poll costs nothing.
 */
const PollDisplay = ({ postId }: PollDisplayProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["poll", postId, user?.id] as const;

  const { data: poll } = useQuery({
    queryKey,
    // Not callable with the anon key; do not fire while the session hydrates.
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_poll_results", { _post_id: postId });
      if (error) throw error;
      return toPollState((data ?? []) as PollResultRow[]);
    },
  });

  const vote = useMutation({
    mutationFn: async (optionId: string) => {
      if (!user || !poll) throw new Error("not signed in");
      // One row per (poll, voter): a first vote inserts, a changed vote updates.
      const { error } = await supabase
        .from("poll_votes")
        .upsert({ poll_id: poll.pollId, option_id: optionId, user_id: user.id }, { onConflict: "poll_id,user_id" });
      if (error) throw error;
    },
    onMutate: async (optionId: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PollState | null>(queryKey);
      if (previous) {
        const prevChoice = previous.myOptionId;
        queryClient.setQueryData<PollState | null>(queryKey, {
          ...previous,
          myOptionId: optionId,
          total: prevChoice ? previous.total : previous.total + 1,
          options: previous.options.map((o) => ({
            ...o,
            votes: o.votes + (o.id === optionId ? 1 : 0) - (o.id === prevChoice ? 1 : 0),
          })),
        });
      }
      return { previous };
    },
    onError: (error, _optionId, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(queryKey, context.previous);
      toast({ title: friendlyDbError(error, "your vote did not count. try again."), variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["poll", postId] });
    },
  });

  if (!poll) return null;

  const isClosed = !!poll.endsAt && new Date(poll.endsAt) < new Date();
  const showResults = !!poll.myOptionId || isClosed;
  const percent = (votes: number) => (poll.total > 0 ? Math.round((votes / poll.total) * 100) : 0);

  return (
    <div
      className="p-4 rounded-lg border border-border/30 bg-accent/5 space-y-4"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[15px] font-light text-foreground mb-3">{poll.question}</p>

      <div className="space-y-2">
        {poll.options.map((option) => {
          const isSelected = poll.myOptionId === option.id;
          const pct = percent(option.votes);

          return (
            <button
              key={option.id}
              onClick={() => {
                if (!isClosed && !isSelected && !vote.isPending) vote.mutate(option.id);
              }}
              disabled={isClosed || vote.isPending}
              aria-pressed={isSelected}
              className={`w-full text-left px-3 py-2.5 rounded-md border transition-colors relative overflow-hidden text-[14px] font-light ${
                isSelected ? "border-foreground/60" : "border-foreground/15 hover:border-foreground/35"
              } ${isClosed ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {showResults && (
                <div
                  className="absolute inset-y-0 left-0 bg-foreground/[0.08] transition-[width] duration-500 ease-soft"
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isSelected && <Check className="w-3.5 h-3.5 text-foreground" />}
                  <span>{option.text}</span>
                </div>
                {showResults && (
                  <div className="flex items-center gap-2 text-[12px] text-foreground/50 tabular-nums">
                    <span>{option.votes}</span>
                    <span>({pct}%)</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[12px] font-light text-foreground/40">
        <span>{showResults ? `${poll.total} vote${poll.total !== 1 ? "s" : ""}` : "vote to see results"}</span>
        {poll.myOptionId && !isClosed && <span>tap another answer to change your vote</span>}
        {poll.endsAt && (
          <span>{isClosed ? "closed" : `closes ${new Date(poll.endsAt).toLocaleDateString()}`}</span>
        )}
      </div>
    </div>
  );
};

export default PollDisplay;
