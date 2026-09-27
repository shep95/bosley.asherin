import { useState, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths,
  format, isSameMonth, isSameDay, parseISO, isValid
} from "date-fns";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";

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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
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
      toast({ title: "moved" });
    },
    onError: (e: Error) => toast({ title: "could not move it", description: e.message, variant: "destructive" })
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
      toast({ title: "that day has passed. pick a later one.", variant: "destructive" });
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
      toast({ title: "no rows to import", description: "the file needs a header row: content,scheduled_for (iso date).", variant: "destructive" });
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
      toast({ title: "import failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `imported ${inserts.length} ${inserts.length === 1 ? "post" : "posts"}` });
      qc.invalidateQueries({ queryKey: ['scheduled-calendar'] });
    }
    e.target.value = "";
  };

  const monthPosts = (scheduled || []).filter(p => isSameMonth(parseISO(p.scheduled_for), cursor));
  const listed = selectedDay ? (postsByDay.get(selectedDay) || []) : monthPosts;

  return (
    <DashboardLayout>
      <PageHeader
        title="calendar"
        subtitle="the month, and what is set to go out."
        actions={
          <>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCSV} className="hidden" aria-label="import csv" />
            <button onClick={() => fileInputRef.current?.click()} className="quiet text-[13px] h-10 px-2 rounded-md">
              import csv
            </button>
          </>
        }
        belowRow={
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-light text-foreground lowercase tabular-nums">{format(cursor, 'MMMM yyyy')}</p>
            <div className="flex items-center -mr-2">
              <button onClick={() => { setCursor(addMonths(cursor, -1)); setSelectedDay(null); }} aria-label="previous month" className="quiet p-2 rounded-md">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => { setCursor(new Date()); setSelectedDay(null); }} className="quiet text-[13px] h-10 px-2 rounded-md">
                today
              </button>
              <button onClick={() => { setCursor(addMonths(cursor, 1)); setSelectedDay(null); }} aria-label="next month" className="quiet p-2 rounded-md">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        }
      />

      <div className="px-5 sm:px-8 pb-6">
        <div className="grid grid-cols-7">
          {['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'].map(w => (
            <div key={w} className="pb-2 text-[11px] font-light tracking-[0.08em] text-foreground/35 text-center">{w}</div>
          ))}
        </div>
        <div
          className={`grid grid-cols-7 border-t border-l border-foreground/[0.07] ${isLoading ? "animate-pulse" : ""}`}
          aria-busy={isLoading}
        >
          {days.map((day, idx) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayPosts = postsByDay.get(key) || [];
            const inMonth = isSameMonth(day, cursor);
            const isToday = isSameDay(day, new Date());
            const isSelected = selectedDay === key;
            return (
              <div
                key={idx}
                role="button"
                tabIndex={0}
                aria-label={`${format(day, 'd MMMM')}${dayPosts.length ? `, ${dayPosts.length} scheduled` : ""}`}
                aria-pressed={isSelected}
                onClick={() => setSelectedDay(isSelected ? null : key)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedDay(isSelected ? null : key); } }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDropDay(day, e)}
                className={`min-h-[48px] sm:min-h-[84px] border-r border-b border-foreground/[0.07] p-1.5 sm:p-2 transition-colors duration-200 ease-soft cursor-pointer focus:outline-none focus-visible:bg-foreground/[0.04] ${isSelected ? "bg-foreground/[0.04]" : "hover:bg-foreground/[0.025]"} ${inMonth ? "" : "opacity-35"}`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[12px] font-light tabular-nums leading-none pb-0.5 ${isToday ? "text-foreground" : "text-foreground/60"} ${dayPosts.length > 0 ? "border-b border-foreground" : "border-b border-transparent"}`}
                  >
                    {format(day, 'd')}
                  </span>
                  {isToday && <span aria-hidden className="w-1 h-1 rounded-full bg-signal" />}
                </div>
                {dayPosts.length > 0 && (
                  <div className="hidden sm:block mt-1.5 space-y-1">
                    {dayPosts.slice(0, 2).map(p => (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={() => setDragId(p.id)}
                        onDragEnd={() => setDragId(null)}
                        title={`${format(parseISO(p.scheduled_for), 'HH:mm')} — ${p.content}`}
                        className="text-[11px] font-light text-foreground/60 truncate cursor-move"
                      >
                        <span className="tabular-nums text-foreground/40">{format(parseISO(p.scheduled_for), 'HH:mm')}</span> {p.content}
                      </div>
                    ))}
                    {dayPosts.length > 2 && <div className="text-[11px] font-light text-foreground/40 tabular-nums">+{dayPosts.length - 2}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[12px] font-light text-foreground/35">drag a post to another day to move it. csv needs two columns: content, scheduled_for.</p>
      </div>

      {!isLoading && (
        listed.length > 0 ? (
          <>
            <p className="px-5 sm:px-8 pt-2 pb-1 text-[12px] font-light text-foreground/40">
              {selectedDay ? format(parseISO(selectedDay), 'EEEE d MMMM').toLowerCase() : `this month · ${monthPosts.length}`}
            </p>
            <div className="stagger">
              {listed.map((p, idx) => (
                <div key={p.id} className="row px-5 sm:px-8 py-4" style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
                  <p className="text-[12px] font-light text-foreground/40 tabular-nums">
                    {format(parseISO(p.scheduled_for), "EEE d MMM · HH:mm").toLowerCase()}
                  </p>
                  <p className="mt-1 text-[14.5px] font-light text-foreground/90 leading-relaxed line-clamp-2 [overflow-wrap:anywhere]">{p.content}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            title={selectedDay ? "nothing on this day." : "nothing this month."}
            description="scheduled posts appear on their day. pick a time from the composer, or import a csv."
            actionLabel="write something"
            actionTo="/dashboard"
          />
        )
      )}
    </DashboardLayout>
  );
};

export default Calendar;
