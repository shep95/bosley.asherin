import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, BarChart3 } from "lucide-react";

interface PollCreatorProps {
  onPollChange: (poll: PollData | null) => void;
  poll: PollData | null;
  /** When set, the poll cannot be added and this one line says why. */
  disabledReason?: string | null;
}

/**
 * One answer per voter: poll_votes is unique on (poll_id, user_id), so a
 * "more than one answer" poll could never record a second choice.
 */
export interface PollData {
  question: string;
  options: string[];
  duration: string; // '1d', '3d', '7d', 'none'
}

const PollCreator = ({ onPollChange, poll, disabledReason }: PollCreatorProps) => {
  const [isExpanded, setIsExpanded] = useState(!!poll);
  const [question, setQuestion] = useState(poll?.question || "");
  const [options, setOptions] = useState<string[]>(poll?.options || ["", ""]);
  const [duration, setDuration] = useState(poll?.duration || "1d");

  const handleToggle = () => {
    if (isExpanded) {
      // Clear poll data
      onPollChange(null);
      setQuestion("");
      setOptions(["", ""]);
      setDuration("1d");
    }
    setIsExpanded(!isExpanded);
  };

  const updatePoll = (newQuestion: string, newOptions: string[]) => {
    setQuestion(newQuestion);
    setOptions(newOptions);
    
    // Only emit valid poll data
    const validOptions = newOptions.filter(o => o.trim());
    if (newQuestion.trim() && validOptions.length >= 2) {
      onPollChange({
        question: newQuestion.trim(),
        options: validOptions,
        duration
      });
    } else {
      onPollChange(null);
    }
  };

  const addOption = () => {
    if (options.length < 6) {
      const newOptions = [...options, ""];
      setOptions(newOptions);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      const newOptions = options.filter((_, i) => i !== index);
      updatePoll(question, newOptions);
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    updatePoll(question, newOptions);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleToggle}
          aria-pressed={isExpanded}
          disabled={!isExpanded && !!disabledReason}
          className="quiet gap-1.5 h-8 px-2 text-[13px] font-light -ml-2"
        >
          <BarChart3 className="w-[15px] h-[15px]" />
          {isExpanded ? 'remove poll' : 'poll'}
        </Button>
        {disabledReason && <span className="text-[12px] font-light text-foreground/40">{disabledReason}</span>}
      </div>

      {isExpanded && (
        <div className="mt-2 pl-4 border-l border-foreground/15 space-y-3">
          <Input
            value={question}
            onChange={(e) => updatePoll(e.target.value, options)}
            placeholder="ask a question."
            className="field text-[15px]"
          />

          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-foreground/30 text-[12px] tabular-nums w-5">{String(index + 1).padStart(2, "0")}</span>
                <Input
                  value={option}
                  onChange={(e) => updateOption(index, e.target.value)}
                  placeholder={`option ${index + 1}`}
                  className="field flex-1 text-[14px]"
                />
                {options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOption(index)}
                    className="quiet p-1 h-8 w-8"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {options.length < 6 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addOption}
              className="quiet -ml-2 text-[13px] font-light"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> add option
            </Button>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-foreground/10">
            <span className="text-[13px] font-light text-foreground/50">one answer each</span>

            <select
              value={duration}
              onChange={(e) => {
                setDuration(e.target.value);
                if (question.trim() && options.filter(o => o.trim()).length >= 2) {
                  onPollChange({
                    question: question.trim(),
                    options: options.filter(o => o.trim()),
                    duration: e.target.value
                  });
                }
              }}
              className="bg-transparent border-0 border-b border-foreground/20 px-1 py-1 text-[13px] font-light text-foreground/70 focus:outline-none"
            >
              <option value="1d">closes in a day</option>
              <option value="3d">closes in 3 days</option>
              <option value="7d">closes in a week</option>
              <option value="none">stays open</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

export default PollCreator;
