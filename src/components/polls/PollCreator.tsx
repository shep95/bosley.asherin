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
        className={`gap-2 ${isExpanded ? 'text-primary' : 'text-foreground/60 hover:text-foreground'}`}
      >
        <BarChart3 className="w-5 h-5" />
        {isExpanded ? 'Remove Poll' : 'Add Poll'}
      </Button>

      {isExpanded && (
        <div className="p-4 rounded-lg border border-border/30 bg-accent/5 space-y-4">
          <Input
            value={question}
            onChange={(e) => updatePoll(e.target.value, options)}
            placeholder="Ask a question..."
            className="bg-background/50 border-border/50 rounded-lg font-light"
          />

          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-foreground/40 text-sm w-6">{index + 1}.</span>
                <Input
                  value={option}
                  onChange={(e) => updateOption(index, e.target.value)}
                  placeholder={`Option ${index + 1}`}
                  className="bg-background/50 border-border/50 rounded-lg font-light flex-1"
                />
                {options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOption(index)}
                    className="text-foreground/40 hover:text-destructive p-1 h-8 w-8"
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
              className="text-foreground/60 hover:text-foreground"
            >
              <Plus className="w-4 h-4 mr-1" /> Add option
            </Button>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border/20">
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
              <Label className="text-sm font-light text-foreground/70">Allow multiple selections</Label>
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
              className="bg-background/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm font-light"
            >
              <option value="1d">1 day</option>
              <option value="3d">3 days</option>
              <option value="7d">7 days</option>
              <option value="none">No limit</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

export default PollCreator;
