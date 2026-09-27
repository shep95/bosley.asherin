import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";

const Templates = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [touched, setTouched] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from('post_templates').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user || !name.trim() || !content.trim()) throw new Error("Name and content required");
      const { error } = await supabase.from('post_templates').insert({ user_id: user.id, name: name.trim(), content: content.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      setName(""); setContent("");
      setTouched(false);
      toast({ title: "template saved" });
    },
    onError: (e: Error) => toast({ title: "could not save it", description: e.message, variant: "destructive" })
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('post_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast({ title: "template deleted" });
    }
  });

  const copy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1600);
  };

  const nameValid = name.trim().length > 0;
  const contentValid = content.trim().length > 0;
  const formValid = nameValid && contentValid;

  return (
    <DashboardLayout>
      <PageHeader title="templates" subtitle="starting points you reuse. copy one into the composer." />

      <form
        className="row px-5 sm:px-8 py-5 space-y-3"
        onSubmit={(e) => { e.preventDefault(); setTouched(true); if (formValid && !create.isPending) create.mutate(); }}
      >
        <div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="name, like weekly note"
            aria-label="template name"
            aria-invalid={touched && !nameValid}
            className="field w-full text-[15px] font-light text-foreground placeholder:text-foreground/35"
          />
          {touched && !nameValid && <p className="mt-1.5 text-[12px] font-light text-foreground/50">give it a name.</p>}
        </div>
        <div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="the text. leave gaps like {topic} or {date} to fill later."
            rows={3}
            aria-label="template content"
            aria-invalid={touched && !contentValid}
            className="w-full bg-transparent resize-none text-[15px] font-light leading-relaxed text-foreground placeholder:text-foreground/35 focus:outline-none"
          />
          {touched && !contentValid && <p className="text-[12px] font-light text-foreground/50">it needs some text.</p>}
        </div>
        <div className="flex items-center justify-end gap-1">
          {(name || content) && (
            <button type="button" onClick={() => { setName(""); setContent(""); setTouched(false); }} className="quiet text-[13px] h-10 px-3 rounded-md">
              clear
            </button>
          )}
          <Button type="submit" variant="signal" size="sm" disabled={!formValid || create.isPending}>
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "save"}
          </Button>
        </div>
      </form>

      {isLoading ? (
        <div className="stagger" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="row px-5 sm:px-8 py-5 space-y-2.5" style={{ "--i": i } as React.CSSProperties}>
              <div className="h-3 w-28 rounded bg-foreground/[0.08] animate-pulse" />
              <div className="h-3 w-full rounded bg-foreground/[0.06] animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-foreground/[0.06] animate-pulse" />
            </div>
          ))}
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="stagger">
          {templates.map((t, idx) => (
            <div key={t.id} className="row px-5 sm:px-8 py-5 flex items-start justify-between gap-4" style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-light text-foreground truncate">{t.name}</p>
                <p className="mt-1.5 text-[14px] font-light text-foreground/60 leading-relaxed whitespace-pre-wrap line-clamp-4 [overflow-wrap:anywhere]">{t.content}</p>
              </div>
              <div className="flex items-center shrink-0 -mr-2">
                <button onClick={() => copy(t.id, t.content)} aria-label="copy template" aria-pressed={copiedId === t.id} className="quiet p-2 rounded-md">
                  {copiedId === t.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
                <button onClick={() => remove.mutate(t.id)} aria-label={`delete ${t.name}`} className="quiet p-2 rounded-md hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="no templates yet."
          description="write one above. a name and the text you keep retyping."
        />
      )}
    </DashboardLayout>
  );
};

export default Templates;
