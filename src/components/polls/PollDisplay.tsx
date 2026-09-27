import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, BarChart3 } from "lucide-react";

interface PollDisplayProps {
  postId: string;
}

interface PollOption {
  id: string;
  option_text: string;
  position: number;
}

interface Poll {
  id: string;
  question: string;
  ends_at: string | null;
  allows_multiple: boolean;
}

const PollDisplay = ({ postId }: PollDisplayProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch poll data
  const { data: pollData, isLoading } = useQuery({
    queryKey: ['poll', postId],
    // Polls are readable by signed-in users only; do not fire with the anon key
    // while the session is still hydrating.
    enabled: !!user,
    queryFn: async () => {
      const { data: poll } = await supabase
        .from('polls')
        .select('*')
        .eq('post_id', postId)
        .maybeSingle();
      
      if (!poll) return null;

      const { data: options } = await supabase
        .from('poll_options')
        .select('*')
        .eq('poll_id', poll.id)
        .order('position', { ascending: true });

      const { data: votes } = await supabase
        .from('poll_votes')
        .select('option_id')
        .eq('poll_id', poll.id);

      const { data: userVotes } = user ? await supabase
        .from('poll_votes')
        .select('option_id')
        .eq('poll_id', poll.id)
        .eq('user_id', user.id) : { data: [] };

      return {
        poll,
        options: options || [],
        votes: votes || [],
        userVotes: new Set(userVotes?.map(v => v.option_id) || [])
      };
    }
  });

  const vote = useMutation({
    mutationFn: async (optionId: string) => {
      if (!user || !pollData) throw new Error("Not authenticated");
      
      const hasVoted = pollData.userVotes.has(optionId);
      
      if (hasVoted) {
        // Remove vote
        await supabase
          .from('poll_votes')
          .delete()
          .match({ poll_id: pollData.poll.id, option_id: optionId, user_id: user.id });
      } else {
        // If not multi-select, remove existing votes first
        if (!pollData.poll.allows_multiple) {
          await supabase
            .from('poll_votes')
            .delete()
            .match({ poll_id: pollData.poll.id, user_id: user.id });
        }
        // Add new vote
        await supabase
          .from('poll_votes')
          .insert({ poll_id: pollData.poll.id, option_id: optionId, user_id: user.id });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poll', postId] });
    }
  });

  if (isLoading || !pollData) return null;

  const { poll, options, votes, userVotes } = pollData;
  // Use total selections as the denominator. We intentionally do not fetch
  // voter user_ids to the client (vote privacy).
  const totalVotes = votes.length;
  const hasVoted = userVotes.size > 0;
  const isExpired = poll.ends_at && new Date(poll.ends_at) < new Date();

  const getVoteCount = (optionId: string) => {
    return votes.filter(v => v.option_id === optionId).length;
  };

  const getPercentage = (optionId: string) => {
    if (votes.length === 0) return 0;
    return Math.round((getVoteCount(optionId) / votes.length) * 100);
  };

  return (
    <div 
      className="p-4 rounded-lg border border-border/30 bg-accent/5 space-y-4"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[15px] font-light text-foreground mb-3">{poll.question}</p>

      <div className="space-y-2">
        {options.map((option: PollOption) => {
          const isSelected = userVotes.has(option.id);
          const percentage = getPercentage(option.id);
          const voteCount = getVoteCount(option.id);
          const showResults = hasVoted || isExpired;

          return (
            <button
              key={option.id}
              onClick={() => !isExpired && vote.mutate(option.id)}
              disabled={isExpired || vote.isPending}
              className={`w-full text-left px-3 py-2.5 rounded-md border transition-colors relative overflow-hidden text-[14px] font-light ${
                isSelected ? 'border-foreground/60' : 'border-foreground/15 hover:border-foreground/35'
              } ${isExpired ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {showResults && (
                <div 
                  className="absolute inset-y-0 left-0 bg-foreground/[0.08] transition-[width] duration-500 ease-soft"
                  style={{ width: `${percentage}%` }}
                />
              )}
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isSelected && <Check className="w-3.5 h-3.5 text-foreground" />}
                  <span>{option.option_text}</span>
                </div>
                {showResults && (
                  <div className="flex items-center gap-2 text-[12px] text-foreground/50 tabular-nums">
                    <span>{voteCount}</span>
                    <span>({percentage}%)</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[12px] font-light text-foreground/40">
        <span>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</span>
        {poll.allows_multiple && <span>pick more than one</span>}
        {poll.ends_at && (
          <span>
            {isExpired 
              ? 'closed'
              : `closes ${new Date(poll.ends_at).toLocaleDateString()}`
            }
          </span>
        )}
      </div>
    </div>
  );
};

export default PollDisplay;
