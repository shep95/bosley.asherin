import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, X, BarChart3 } from "lucide-react";

interface PollCreatorProps {
  onPollChange: (poll: PollData | null) => void;
  poll: PollData | null;
}

export interface PollData {
  question: string;
  options: string[];
  allowsMultiple: boolean;
  duration: string; // '1d', '3d', '7d', 'none'
}

const PollCreator = ({ onPollChange, poll }: PollCreatorProps) => {
  const [isExpanded, setIsExpanded] = useState(!!poll);
  const [question, setQuestion] = useState(poll?.question || "");
  const [options, setOptions] = useState<string[]>(poll?.options || ["", ""]);
  const [allowsMultiple, setAllowsMultiple] = useState(poll?.allowsMultiple || false);
  const [duration, setDuration] = useState(poll?.duration || "1d");

  const handleToggle = () => {
    if (isExpanded) {
      // Clear poll data
      onPollChange(null);
      setQuestion("");
      setOptions(["", ""]);
      setAllowsMultiple(false);
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
        allowsMultiple,
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
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleToggle}
        aria-pressed={isExpanded}
        className="quiet gap-1.5 h-8 px-2 text-[13px] font-light -ml-2"
      >
        <BarChart3 className="w-[15px] h-[15px]" />
        {isExpanded ? 'remove poll' : 'poll'}
      </Button>

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
            <div className="flex items-center gap-2">
              <Switch
                checked={allowsMultiple}
                onCheckedChange={(checked) => {
                  setAllowsMultiple(checked);
                  if (question.trim() && options.filter(o => o.trim()).length >= 2) {
                    onPollChange({
                      question: question.trim(),
                      options: options.filter(o => o.trim()),
                      allowsMultiple: checked,
                      duration
                    });
                  }
                }}
              />
              <Label className="text-[13px] font-light text-foreground/60">more than one answer</Label>
            </div>

            <select
              value={duration}
              onChange={(e) => {
                setDuration(e.target.value);
                if (question.trim() && options.filter(o => o.trim()).length >= 2) {
                  onPollChange({
                    question: question.trim(),
                    options: options.filter(o => o.trim()),
                    allowsMultiple,
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
