import { useState, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronLeft, ChevronRight, Upload, Loader2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths,
  format, isSameMonth, isSameDay, parseISO, isValid
} from "date-fns";

interface ScheduledPost {
  id: string;
  content: string;
  scheduled_for: string;
  status: string;
}

const Calendar = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cursor, setCursor] = useState(new Date());
  const [dragId, setDragId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);

  const { data: scheduled, isLoading } = useQuery({
    queryKey: ['scheduled-calendar', user?.id, cursor.getMonth(), cursor.getFullYear()],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('scheduled_posts')
        .select('id, content, scheduled_for, status')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .gte('scheduled_for', gridStart.toISOString())
        .lte('scheduled_for', gridEnd.toISOString())
        .order('scheduled_for');
      return (data || []) as ScheduledPost[];
    },
    enabled: !!user
  });

  const reschedule = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: Date }) => {
      const { error } = await supabase.from('scheduled_posts')
        .update({ scheduled_for: date.toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduled-calendar'] });
      toast({ title: "Rescheduled" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" })
  });

  const days: Date[] = [];
  let d = gridStart;
  while (d <= gridEnd) { days.push(d); d = addDays(d, 1); }

  const postsByDay = new Map<string, ScheduledPost[]>();
  scheduled?.forEach(p => {
    const key = format(parseISO(p.scheduled_for), 'yyyy-MM-dd');
    if (!postsByDay.has(key)) postsByDay.set(key, []);
    postsByDay.get(key)!.push(p);
  });

  const onDropDay = (day: Date, e: React.DragEvent) => {
    e.preventDefault();
    if (!dragId) return;
    // Keep original time of day, change date
    const orig = scheduled?.find(s => s.id === dragId);
    if (!orig) return;
    const origDate = parseISO(orig.scheduled_for);
    const newDate = new Date(day);
    newDate.setHours(origDate.getHours(), origDate.getMinutes(), 0, 0);
    if (newDate < new Date()) {
      toast({ title: "Can't reschedule to the past", variant: "destructive" });
      setDragId(null);
      return;
    }
    reschedule.mutate({ id: dragId, date: newDate });
    setDragId(null);
  };

  const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    // Expect header: content,scheduled_for
    const rows = lines.slice(1).map(l => {
      // simple CSV (no embedded quoted commas)
      const [content, scheduled_for] = l.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      return { content, scheduled_for };
    }).filter(r => r.content && r.scheduled_for && isValid(parseISO(r.scheduled_for)));

    if (!rows.length) {
      toast({ title: "No valid rows", description: "CSV must have header content,scheduled_for", variant: "destructive" });
      e.target.value = "";
      return;
    }

    const inserts = rows.map(r => ({
      user_id: user.id,
      content: r.content,
      scheduled_for: parseISO(r.scheduled_for).toISOString(),
      status: 'pending' as const,
      visibility: 'public',
    }));
    const { error } = await supabase.from('scheduled_posts').insert(inserts);
    if (error) {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Imported ${inserts.length} posts` });
      qc.invalidateQueries({ queryKey: ['scheduled-calendar'] });
    }
    e.target.value = "";
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-foreground/80" />
            <h1 className="text-2xl font-light text-foreground">Content Calendar</h1>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCSV} className="hidden" />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-1" /> CSV import
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setCursor(addMonths(cursor, -1))}><ChevronLeft className="w-4 h-4" /></Button>
            <div className="font-medium min-w-[140px] text-center">{format(cursor, 'MMMM yyyy')}</div>
            <Button variant="ghost" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>

        <p className="text-xs text-foreground/40 font-light mb-3">
          Tip: drag a scheduled post to a new day to reschedule. CSV format: <code className="bg-foreground/10 px-1 rounded">content,scheduled_for</code> (ISO date).
        </p>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-foreground/60" /></div>
        ) : (
          <div className="glass-card rounded-lg overflow-hidden">
            <div className="grid grid-cols-7 border-b border-foreground/10">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} className="p-2 text-xs uppercase tracking-wider text-foreground/50 font-medium text-center">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day, idx) => {
                const key = format(day, 'yyyy-MM-dd');
                const dayPosts = postsByDay.get(key) || [];
                const inMonth = isSameMonth(day, cursor);
                const isToday = isSameDay(day, new Date());
                return (
                  <div
                    key={idx}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onDropDay(day, e)}
                    className={`min-h-[110px] border-r border-b border-foreground/5 p-1.5 ${inMonth ? '' : 'bg-foreground/[0.02] text-foreground/30'} ${isToday ? 'bg-signal/10' : ''}`}
                  >
                    {/* today's number needs its own contrast: `primary` sits too close to the card surface */}
                    <div className="mb-1">
                      <span
                        className={
                          isToday
                            ? 'inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-signal text-signal-foreground text-xs font-semibold'
                            : 'text-xs font-medium text-foreground/60'
                        }
                      >
                        {format(day, 'd')}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {dayPosts.slice(0, 3).map(p => (
                        <div
                          key={p.id}
                          draggable
                          onDragStart={() => setDragId(p.id)}
                          onDragEnd={() => setDragId(null)}
                          className="text-[10px] glass-inset rounded px-1.5 py-1 cursor-move hover:bg-foreground/10 truncate flex items-center gap-1"
                          title={`${format(parseISO(p.scheduled_for), 'h:mm a')} — ${p.content}`}
                        >
                          <Clock className="w-2.5 h-2.5 flex-shrink-0 text-foreground/40" />
                          <span className="truncate">{format(parseISO(p.scheduled_for), 'HH:mm')} {p.content}</span>
                        </div>
                      ))}
                      {dayPosts.length > 3 && (
                        <div className="text-[10px] text-foreground/40 font-light">+{dayPosts.length - 3} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Calendar;
