import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CalendarDays, Plus, Loader2, MapPin, Video, Clock, Check, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import PageHeader from "@/components/layout/PageHeader";

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
      toast({ title: "Event created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" })
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

  return (
    <DashboardLayout>
      <PageHeader
        title="Events"
        statusDot="bg-emerald-500"
        statusLabel={`${events?.length ?? 0} events coming up`}
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-lg font-medium bg-foreground text-background hover:bg-foreground/90 h-8">
                <Plus className="w-4 h-4 mr-2" /> Create
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-panel border">
              <DialogHeader>
                <DialogTitle className="font-light">Create Event</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Input placeholder="Event title" value={title} onChange={e => setTitle(e.target.value)} className="bg-background/50 border-border/30 font-light" maxLength={200} />
                <Textarea placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} className="bg-background/50 border-border/30 font-light" maxLength={1000} />
                <Input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} className="bg-background/50 border-border/30 font-light" />
                <Input placeholder="Location (optional)" value={location} onChange={e => setLocation(e.target.value)} className="bg-background/50 border-border/30 font-light" />
                <Input placeholder="Virtual URL (optional)" value={virtualUrl} onChange={e => setVirtualUrl(e.target.value)} className="bg-background/50 border-border/30 font-light" />
                <Button onClick={() => createEvent.mutate()} disabled={!title.trim() || !startsAt || createEvent.isPending} className="w-full rounded-lg font-light bg-foreground text-background">
                  {createEvent.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Event'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="max-w-2xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-foreground/60" /></div>
        ) : events && events.length > 0 ? (
          <div className="space-y-4">
            {events.map((event: any) => (
              <div key={event.id} className="glass-card rounded-xl p-5 hover:bg-accent/10 transition-colors">
                <h3 className="text-foreground font-normal text-lg">{event.title}</h3>
                {event.description && <p className="text-foreground/60 text-sm font-light mt-1">{event.description}</p>}
                <div className="flex flex-wrap gap-4 mt-3 text-foreground/50 text-sm font-light">
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{format(new Date(event.starts_at), 'MMM d, yyyy h:mm a')}</span>
                  {event.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{event.location}</span>}
                  {event.virtual_url && <span className="flex items-center gap-1"><Video className="w-3.5 h-3.5" />Virtual</span>}
                </div>
                <div className="flex items-center gap-4 mt-3 text-foreground/40 text-xs font-light">
                  <span>{event.goingCount} going</span>
                  <span>{event.interestedCount} interested</span>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <Button
                    variant={event.userRsvp === 'going' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => rsvpMutation.mutate({ eventId: event.id, status: 'going' })}
                    className={`rounded-lg font-light ${event.userRsvp === 'going' ? 'bg-foreground text-background' : ''}`}
                  >
                    <Check className="w-3.5 h-3.5 mr-1" /> Going
                  </Button>
                  <Button
                    variant={event.userRsvp === 'interested' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => rsvpMutation.mutate({ eventId: event.id, status: 'interested' })}
                    className={`rounded-lg font-light ${event.userRsvp === 'interested' ? 'bg-foreground text-background' : ''}`}
                  >
                    <Star className="w-3.5 h-3.5 mr-1" /> Interested
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-xl p-8 text-center">
            <CalendarDays className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
            <p className="text-foreground/60 font-light">No upcoming events.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Events;
