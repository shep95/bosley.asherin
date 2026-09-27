import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarClock, X } from "lucide-react";
import { format } from "date-fns";

interface ScheduleSelectorProps {
  scheduledDate: Date | null;
  onScheduleChange: (date: Date | null) => void;
}

const ScheduleSelector = ({ scheduledDate, onScheduleChange }: ScheduleSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(scheduledDate || undefined);
  const [time, setTime] = useState(scheduledDate ? format(scheduledDate, "HH:mm") : "12:00");

  const handleConfirm = () => {
    if (selectedDate) {
      const [hours, minutes] = time.split(':').map(Number);
      const finalDate = new Date(selectedDate);
      finalDate.setHours(hours, minutes, 0, 0);
      onScheduleChange(finalDate);
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    onScheduleChange(null);
    setSelectedDate(undefined);
    setTime("12:00");
    setIsOpen(false);
  };

  // Disable past dates
  const disabledDays = { before: new Date() };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`gap-2 ${scheduledDate ? 'text-primary' : 'text-foreground/60 hover:text-foreground'}`}
        >
          <CalendarClock className="w-5 h-5" />
          {scheduledDate ? (
            <span className="text-xs">{format(scheduledDate, "MMM d, h:mm a")}</span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 glass-panel border-border/30" align="start">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-light text-foreground">Schedule Post</h4>
            {scheduledDate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="text-foreground/40 hover:text-destructive h-6 px-2"
              >
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
          
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            disabled={disabledDays}
            className="rounded-md"
          />
          
          <div className="space-y-2">
            <Label className="text-foreground/70 font-light">Time</Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="bg-background/50 border-border/50 rounded-lg"
            />
          </div>
          
          <Button
            onClick={handleConfirm}
            disabled={!selectedDate}
            className="w-full rounded-lg bg-foreground text-background"
          >
            {scheduledDate ? 'Update Schedule' : 'Schedule Post'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ScheduleSelector;
