import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Zap, CheckCircle2, XCircle, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const TRIGGER_TYPES = [
  { value: "likes_threshold", label: "Post hits like count" },
  { value: "comments_threshold", label: "Post hits comment count" },
  { value: "poll_winner", label: "Poll has a winner" },
  { value: "time_after_post", label: "Time after post" },
];

const ACTION_TYPES = [
  { value: "create_post", label: "Create a follow-up post" },
  { value: "archive_post", label: "Archive the post (set private)" },
  { value: "unpin_replace", label: "Replace pinned post" },
  { value: "send_dm", label: "Send a DM" },
];

const Rules = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [postId, setPostId] = useState("");
  const [triggerType, setTriggerType] = useState("likes_threshold");
  const [threshold, setThreshold] = useState(100);
  const [minutes, setMinutes] = useState(60);
  const [expectedOption, setExpectedOption] = useState("");
  const [actionType, setActionType] = useState("create_post");
  const [actionContent, setActionContent] = useState("");

  const { data: rules, isLoading } = useQuery({
    queryKey: ["post-rules", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("post_rules" as any).select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return (data as any[]) ?? [];
    },
    enabled: !!user,
  });

  const { data: recentRuns } = useQuery({
    queryKey: ["post-rule-runs", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("post_rule_runs" as any).select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data as any[]) ?? [];
    },
    enabled: !!user,
  });

  const createRule = useMutation({
    mutationFn: async () => {
      // Client-side validation (mirrors edge-function expectations) so rules
      // can't be created in a state that fires continuously or never fires.
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (postId && !UUID_RE.test(postId.trim())) {
        throw new Error("Post ID must be a valid UUID, or left blank.");
      }
      if (
        (triggerType === "likes_threshold" ||
          triggerType === "comments_threshold" ||
          triggerType === "poll_winner" ||
          triggerType === "time_after_post") &&
        !postId.trim()
      ) {
        throw new Error("This trigger needs a Post ID to watch.");
      }
      if (
        (triggerType === "likes_threshold" || triggerType === "comments_threshold") &&
        (!Number.isFinite(threshold) || threshold < 1)
      ) {
        throw new Error("Threshold must be a whole number of at least 1.");
      }
      if (triggerType === "time_after_post" && (!Number.isFinite(minutes) || minutes < 1)) {
        throw new Error("Minutes after post must be at least 1.");
      }
      if ((actionType === "create_post" || actionType === "send_dm") && !actionContent.trim()) {
        throw new Error("This action needs some content.");
      }

      const trigger_config: any = {};
      if (triggerType === "likes_threshold" || triggerType === "comments_threshold") trigger_config.threshold = threshold;
      if (triggerType === "time_after_post") trigger_config.minutes = minutes;
      if (triggerType === "poll_winner" && expectedOption) trigger_config.expected_option = expectedOption;
      const action_config: any = {};
      if (actionType === "create_post") action_config.content = actionContent;
      if (actionType === "send_dm") {
        action_config.content = actionContent;
        // The UI offers "DM yourself" — without a receiver the edge function
        // silently no-ops, so default the recipient to the rule owner.
        action_config.receiver_id = user!.id;
      }

      const { error } = await supabase.from("post_rules" as any).insert({
        user_id: user!.id,
        name: name || "Untitled rule",
        post_id: postId || null,
        trigger_type: triggerType,
        trigger_config,
        action_type: actionType,
        action_config,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["post-rules"] });
      toast.success("Rule created");
      setOpen(false);
      setName(""); setPostId(""); setActionContent(""); setExpectedOption("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("post_rules" as any)
        .update({ is_active: active }).eq("id", id).eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["post-rules"] }),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("post_rules" as any).delete().eq("id", id).eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["post-rules"] });
      toast.success("Rule deleted");
    },
  });

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Workflow className="w-6 h-6 text-foreground/80" />
            <h1 className="text-2xl font-light text-foreground">Rules</h1>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> New rule</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create a rule</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="If launch post hits 100 likes…" />
                </div>
                <div>
                  <Label>Post ID (optional, leave blank for account-wide)</Label>
                  <Input value={postId} onChange={(e) => setPostId(e.target.value)} placeholder="UUID of the post" />
                </div>
                <div>
                  <Label>When</Label>
                  <Select value={triggerType} onValueChange={setTriggerType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TRIGGER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {(triggerType === "likes_threshold" || triggerType === "comments_threshold") && (
                  <div>
                    <Label>Threshold</Label>
                    <Input type="number" min={1} value={threshold} onChange={(e) => setThreshold(parseInt(e.target.value || "1"))} />
                  </div>
                )}
                {triggerType === "time_after_post" && (
                  <div>
                    <Label>Minutes after post</Label>
                    <Input type="number" min={1} value={minutes} onChange={(e) => setMinutes(parseInt(e.target.value || "1"))} />
                  </div>
                )}
                {triggerType === "poll_winner" && (
                  <div>
                    <Label>Expected winning option (optional)</Label>
                    <Input value={expectedOption} onChange={(e) => setExpectedOption(e.target.value)} placeholder="Leave blank = any winner" />
                  </div>
                )}
                <div>
                  <Label>Then</Label>
                  <Select value={actionType} onValueChange={setActionType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {(actionType === "create_post" || actionType === "send_dm") && (
                  <div>
                    <Label>Content</Label>
                    <Textarea rows={3} value={actionContent} onChange={(e) => setActionContent(e.target.value)} />
                  </div>
                )}
                <Button className="w-full" onClick={() => createRule.mutate()} disabled={createRule.isPending}>
                  {createRule.isPending ? "Creating…" : "Create rule"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <p className="text-sm text-foreground/60 font-light mb-4">
          Rules evaluate every minute. Use them to auto-publish a follow-up when a poll closes, archive a post after a threshold, replace your pinned post, or DM yourself when something fires.
        </p>

        {isLoading ? (
          <div className="space-y-3">
            {[0,1,2].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : rules && rules.length > 0 ? (
          <div className="space-y-3">
            {rules.map((r: any) => (
              <div key={r.id} className="glass-card rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <h3 className="font-medium text-foreground truncate">{r.name}</h3>
                    </div>
                    <p className="text-xs text-foreground/60 font-light">
                      <span className="text-foreground/80">When</span> {prettyTrigger(r)} →{" "}
                      <span className="text-foreground/80">do</span> {prettyAction(r)}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-foreground/40 mt-2">
                      Fired {r.trigger_count} time{r.trigger_count === 1 ? "" : "s"}
                      {r.last_triggered_at && ` · last ${new Date(r.last_triggered_at).toLocaleString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Switch checked={r.is_active} onCheckedChange={(v) => toggleRule.mutate({ id: r.id, active: v })} />
                    <Button variant="ghost" size="icon" onClick={() => { if (window.confirm(`Delete rule "${r.name}"? This cannot be undone.`)) deleteRule.mutate(r.id); }} className="h-8 w-8 text-foreground/40 hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-xl p-8 text-center">
            <Workflow className="w-10 h-10 mx-auto text-foreground/30 mb-3" />
            <h2 className="text-base font-light text-foreground mb-1">No rules yet</h2>
            <p className="text-sm text-foreground/60 font-light">Create a rule to automate post behavior.</p>
          </div>
        )}

        {recentRuns && recentRuns.length > 0 && (
          <div className="mt-10">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/50 mb-3">Recent runs</h3>
            <div className="space-y-1.5">
              {recentRuns.map((run: any) => (
                <div key={run.id} className="flex items-center gap-2 text-xs text-foreground/60 font-light">
                  {run.success
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                  <span>{new Date(run.created_at).toLocaleString()}</span>
                  {run.error_message && <span className="text-red-400 truncate">· {run.error_message}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

function prettyTrigger(r: any) {
  const c = r.trigger_config ?? {};
  switch (r.trigger_type) {
    case "likes_threshold": return `post hits ${c.threshold ?? 100} likes`;
    case "comments_threshold": return `post hits ${c.threshold ?? 10} comments`;
    case "time_after_post": return `${c.minutes ?? 60} minutes after the post`;
    case "poll_winner": return c.expected_option ? `poll winner is "${c.expected_option}"` : "any poll winner is decided";
    default: return r.trigger_type;
  }
}
function prettyAction(r: any) {
  const c = r.action_config ?? {};
  switch (r.action_type) {
    case "create_post": return `create a new post${c.content ? `: "${String(c.content).slice(0, 40)}…"` : ""}`;
    case "archive_post": return "archive the post";
    case "unpin_replace": return "replace your pinned post";
    case "send_dm": return "send a DM";
    default: return r.action_type;
  }
}

export default Rules;