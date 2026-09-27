import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  virtual_url: string | null;
  starts_at: string;
  userRsvp: string | null;
  goingCount: number;
  interestedCount: number;
};

const Events = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [virtualUrl, setVirtualUrl] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [touched, setTouched] = useState(false);

  const { data: events, isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const { data } = await supabase
        .from('events')
        .select('*')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .limit(50);
      if (!data) return [];

      // Fetch RSVPs for current user
      if (user) {
        const eventIds = data.map(e => e.id);
        const { data: rsvps } = await supabase
          .from('event_rsvps')
          .select('event_id, status')
          .eq('user_id', user.id)
          .in('event_id', eventIds);
        const rsvpMap = new Map(rsvps?.map(r => [r.event_id, r.status]) || []);

        // Get RSVP counts
        const { data: allRsvps } = await supabase
          .from('event_rsvps')
          .select('event_id, status')
          .in('event_id', eventIds)
          .in('status', ['going', 'interested']);

        const countMap = new Map<string, { going: number; interested: number }>();
        allRsvps?.forEach(r => {
          const prev = countMap.get(r.event_id) || { going: 0, interested: 0 };
          if (r.status === 'going') prev.going++;
          else if (r.status === 'interested') prev.interested++;
          countMap.set(r.event_id, prev);
        });

        return data.map(e => ({
          ...e,
          userRsvp: rsvpMap.get(e.id) || null,
          goingCount: countMap.get(e.id)?.going || 0,
          interestedCount: countMap.get(e.id)?.interested || 0,
        }));
      }
      return data.map(e => ({ ...e, userRsvp: null, goingCount: 0, interestedCount: 0 }));
    }
  });

  const createEvent = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from('events').insert({
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        virtual_url: virtualUrl.trim() || null,
        starts_at: new Date(startsAt).toISOString(),
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      setDialogOpen(false);
      setTitle(""); setDescription(""); setLocation(""); setVirtualUrl(""); setStartsAt("");
      setTouched(false);
      toast({ title: "event created" });
    },
    onError: (e: Error) => toast({ title: "could not create it", description: e.message, variant: "destructive" })
  });

  const rsvpMutation = useMutation({
    mutationFn: async ({ eventId, status }: { eventId: string; status: string }) => {
      if (!user) throw new Error("Not authenticated");
      // Upsert
      const { data: existing } = await supabase
        .from('event_rsvps')
        .select('id')
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        await supabase.from('event_rsvps').update({ status }).eq('id', existing.id);
      } else {
        await supabase.from('event_rsvps').insert({ event_id: eventId, user_id: user.id, status });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] })
  });

  const titleValid = title.trim().length > 0;
  const dateValid = !!startsAt && !Number.isNaN(new Date(startsAt).getTime());
  const dateInPast = dateValid && new Date(startsAt).getTime() < Date.now();
  const formValid = titleValid && dateValid && !dateInPast;
  const cancel = () => { setDialogOpen(false); setTitle(""); setDescription(""); setLocation(""); setVirtualUrl(""); setStartsAt(""); setTouched(false); };

  const fieldClass = "field w-full text-[15px] font-light text-foreground placeholder:text-foreground/35 [color-scheme:dark]";

  return (
    <DashboardLayout>
      <PageHeader
        title="events"
        subtitle="what is coming up, soonest first."
        actions={
          !dialogOpen && (
            <button onClick={() => setDialogOpen(true)} className="quiet text-[13px] h-10 px-2 rounded-md">
              new event
            </button>
          )
        }
      />

      {dialogOpen && (
        <form
          className="row px-5 sm:px-8 py-5 space-y-4"
          onSubmit={(e) => { e.preventDefault(); setTouched(true); if (formValid && !createEvent.isPending) createEvent.mutate(); }}
        >
          <div>
            <input value={title} onChange={e => setTitle(e.target.value)} onBlur={() => setTouched(true)} placeholder="what is happening" maxLength={200} autoFocus aria-label="title" aria-invalid={touched && !titleValid} className={fieldClass} />
            {touched && !titleValid && <p className="mt-1.5 text-[12px] font-light text-foreground/50">give it a title.</p>}
          </div>
          <div>
            <label className="block text-[12px] font-light text-foreground/40 mb-0.5">when</label>
            <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} onBlur={() => setTouched(true)} aria-label="starts at" aria-invalid={touched && !formValid} className={fieldClass} />
            {touched && !dateValid && <p className="mt-1.5 text-[12px] font-light text-foreground/50">pick a date and time.</p>}
            {dateInPast && <p className="mt-1.5 text-[12px] font-light text-foreground/50">that is in the past. pick a later time.</p>}
          </div>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="details (optional)" maxLength={1000} rows={2} aria-label="description" className="w-full bg-transparent resize-none text-[15px] font-light leading-relaxed text-foreground placeholder:text-foreground/35 focus:outline-none" />
          <div className="grid sm:grid-cols-2 gap-4">
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="where (optional)" aria-label="location" className={fieldClass} />
            <input value={virtualUrl} onChange={e => setVirtualUrl(e.target.value)} placeholder="link, if online (optional)" aria-label="link" inputMode="url" className={fieldClass} />
          </div>
          <div className="flex items-center justify-end gap-1 pt-1">
            <button type="button" onClick={cancel} className="quiet text-[13px] h-10 px-3 rounded-md">cancel</button>
            <Button type="submit" variant="signal" size="sm" disabled={!formValid || createEvent.isPending}>
              {createEvent.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "create"}
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="stagger" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="row px-5 sm:px-8 py-5 space-y-2.5" style={{ "--i": i } as React.CSSProperties}>
              <div className="h-3 w-24 rounded bg-foreground/[0.06] animate-pulse" />
              <div className="h-3 w-40 rounded bg-foreground/[0.08] animate-pulse" />
              <div className="h-3 w-64 rounded bg-foreground/[0.06] animate-pulse" />
            </div>
          ))}
        </div>
      ) : events && events.length > 0 ? (
        <div className="stagger">
          {(events as EventRow[]).map((event, idx) => (
            <div key={event.id} className="row px-5 sm:px-8 py-5" style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
              <p className="text-[12px] font-light text-foreground/40 tabular-nums">
                {format(new Date(event.starts_at), "EEE d MMM · HH:mm").toLowerCase()}
                {event.location && <> · {event.location}</>}
                {event.virtual_url && (
                  <> · <a href={event.virtual_url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors underline-offset-4 hover:underline">online</a></>
                )}
              </p>
              <p className="mt-1.5 text-[15.5px] font-light text-foreground">{event.title}</p>
              {event.description && <p className="mt-1 text-[14px] font-light text-foreground/60 leading-relaxed">{event.description}</p>}
              <div className="mt-3 -ml-2 flex items-center gap-1 text-[13px] tabular-nums">
                <button
                  onClick={() => rsvpMutation.mutate({ eventId: event.id, status: 'going' })}
                  aria-pressed={event.userRsvp === 'going'}
                  disabled={rsvpMutation.isPending}
                  className="quiet h-10 px-2 rounded-md"
                >
                  going{event.goingCount > 0 && <span className="ml-1.5 text-foreground/40">{event.goingCount}</span>}
                </button>
                <button
                  onClick={() => rsvpMutation.mutate({ eventId: event.id, status: 'interested' })}
                  aria-pressed={event.userRsvp === 'interested'}
                  disabled={rsvpMutation.isPending}
                  className="quiet h-10 px-2 rounded-md"
                >
                  interested{event.interestedCount > 0 && <span className="ml-1.5 text-foreground/40">{event.interestedCount}</span>}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="nothing coming up."
          description="events are small gatherings, in a place or on a call. anyone can put one on the list."
          actionLabel="add one"
          onAction={() => setDialogOpen(true)}
        />
      )}
    </DashboardLayout>
  );
};

export default Events;
