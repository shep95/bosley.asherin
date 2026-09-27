import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileStack, Trash2, Plus, Loader2, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Templates = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

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
      toast({ title: "Template saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" })
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('post_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast({ title: "Template deleted" });
    }
  });

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          <FileStack className="w-6 h-6 text-foreground/80" />
          <h1 className="text-2xl font-light text-foreground">Post Templates</h1>
        </div>

        <div className="glass-card rounded-xl p-4 mb-6 space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name (e.g. Weekly recap)" className="bg-transparent" />
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Template content with placeholders like {topic}, {date}..." className="bg-transparent min-h-[100px]" />
          <Button onClick={() => create.mutate()} disabled={create.isPending} className="w-full">
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Save template</>}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-foreground/60" /></div>
        ) : templates && templates.length > 0 ? (
          <div className="space-y-3">
            {templates.map((t) => (
              <div key={t.id} className="glass-card rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-medium text-foreground">{t.name}</h3>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => copy(t.content)}><Copy className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove.mutate(t.id)} className="hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
                <p className="text-foreground/70 font-light text-sm whitespace-pre-wrap line-clamp-4">{t.content}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-xl p-8 text-center text-foreground/60 font-light">
            No templates yet. Create your first above.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Templates;
