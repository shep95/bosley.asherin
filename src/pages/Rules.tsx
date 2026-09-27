import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";

const TRIGGER_TYPES = [
  { value: "likes_threshold", label: "a post reaches a number of likes" },
  { value: "comments_threshold", label: "a post reaches a number of replies" },
  { value: "poll_winner", label: "a poll closes with a winner" },
  { value: "time_after_post", label: "some time has passed since the post" },
];

const ACTION_TYPES = [
  { value: "create_post", label: "post a follow-up" },
  { value: "archive_post", label: "make the post private" },
  { value: "unpin_replace", label: "replace the pinned post" },
  { value: "send_dm", label: "message me" },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rule = any;

const selectClass = "field w-full h-10 bg-transparent text-[15px] font-light text-foreground focus:outline-none appearance-none pr-6 bg-no-repeat bg-[right_0_center] bg-[length:12px_12px] [background-image:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-opacity='0.4' stroke-width='1.5'><path d='M6 9l6 6 6-6'/></svg>\")] [&>option]:bg-background [&>option]:text-foreground";
const fieldClass = "field w-full text-[15px] font-light text-foreground placeholder:text-foreground/35";

const Rules = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);

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
      toast.success("rule saved");
      setOpen(false);
      setTouched(false);
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
      toast.success("rule deleted");
    },
  });

  // Inline validation: the same rules the mutation enforces, surfaced as you type.
  const needsThreshold = triggerType === "likes_threshold" || triggerType === "comments_threshold";
  const needsContent = actionType === "create_post" || actionType === "send_dm";
  const postIdError = !postId.trim()
    ? "paste the id of the post to watch."
    : !UUID_RE.test(postId.trim()) ? "that is not a post id. it looks like 8-4-4-4-12 hex characters." : null;
  const thresholdError = needsThreshold && (!Number.isFinite(threshold) || threshold < 1) ? "a whole number, at least 1." : null;
  const minutesError = triggerType === "time_after_post" && (!Number.isFinite(minutes) || minutes < 1) ? "at least 1 minute." : null;
  const contentError = needsContent && !actionContent.trim() ? "write what to send." : null;
  const formValid = !postIdError && !thresholdError && !minutesError && !contentError;

  const cancel = () => { setOpen(false); setTouched(false); setName(""); setPostId(""); setActionContent(""); setExpectedOption(""); };
  const Hint = ({ text }: { text: string | null }) => (touched && text ? <p className="mt-1.5 text-[12px] font-light text-foreground/50">{text}</p> : null);

  return (
    <DashboardLayout>
      <PageHeader
        title="automations"
        subtitle="small automations that run on your posts."
        actions={
          !open && (
            <button onClick={() => setOpen(true)} className="quiet text-[13px] h-10 px-2 rounded-md">
              new rule
            </button>
          )
        }
      />

      {open && (
        <form
          className="row px-5 sm:px-8 py-5 space-y-5"
          onSubmit={(e) => { e.preventDefault(); setTouched(true); if (formValid && !createRule.isPending) createRule.mutate(); }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name (optional)" autoFocus aria-label="rule name" className={fieldClass} />
          <div>
            <label className="block text-[12px] font-light text-foreground/40 mb-0.5">post to watch</label>
            <input value={postId} onChange={(e) => setPostId(e.target.value)} onBlur={() => setTouched(true)} placeholder="the post id, from its address" aria-label="post id" aria-invalid={touched && !!postIdError} className={`${fieldClass} font-mono text-[13px]`} />
            <Hint text={postIdError} />
          </div>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
            <div>
              <label htmlFor="rule-when" className="block text-[12px] font-light text-foreground/40 mb-0.5">when</label>
              <select id="rule-when" value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className={selectClass}>
                {TRIGGER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {needsThreshold && (
              <div>
                <label className="block text-[12px] font-light text-foreground/40 mb-0.5">how many</label>
                <input type="number" min={1} inputMode="numeric" value={threshold} onChange={(e) => setThreshold(parseInt(e.target.value || "1"))} onBlur={() => setTouched(true)} aria-label="threshold" aria-invalid={touched && !!thresholdError} className={`${fieldClass} tabular-nums`} />
                <Hint text={thresholdError} />
              </div>
            )}
            {triggerType === "time_after_post" && (
              <div>
                <label className="block text-[12px] font-light text-foreground/40 mb-0.5">minutes after</label>
                <input type="number" min={1} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(parseInt(e.target.value || "1"))} onBlur={() => setTouched(true)} aria-label="minutes" aria-invalid={touched && !!minutesError} className={`${fieldClass} tabular-nums`} />
                <Hint text={minutesError} />
              </div>
            )}
            {triggerType === "poll_winner" && (
              <div>
                <label className="block text-[12px] font-light text-foreground/40 mb-0.5">only if this option wins</label>
                <input value={expectedOption} onChange={(e) => setExpectedOption(e.target.value)} placeholder="any winner" aria-label="expected option" className={fieldClass} />
              </div>
            )}
            <div>
              <label htmlFor="rule-then" className="block text-[12px] font-light text-foreground/40 mb-0.5">then</label>
              <select id="rule-then" value={actionType} onChange={(e) => setActionType(e.target.value)} className={selectClass}>
                {ACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          {needsContent && (
            <div>
              <label className="block text-[12px] font-light text-foreground/40 mb-0.5">{actionType === "send_dm" ? "the message" : "the follow-up"}</label>
              <textarea rows={3} value={actionContent} onChange={(e) => setActionContent(e.target.value)} onBlur={() => setTouched(true)} aria-label="content" aria-invalid={touched && !!contentError} className="w-full bg-transparent resize-none text-[15px] font-light leading-relaxed text-foreground placeholder:text-foreground/35 focus:outline-none" />
              <Hint text={contentError} />
            </div>
          )}
          <div className="flex items-center justify-between gap-4 pt-1">
            <p className="text-[12px] font-light text-foreground/40">rules are checked once a minute.</p>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={cancel} className="quiet text-[13px] h-10 px-3 rounded-md">cancel</button>
              <Button type="submit" variant="signal" size="sm" disabled={!formValid || createRule.isPending}>
                {createRule.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "save"}
              </Button>
            </div>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="stagger" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="row px-5 sm:px-8 py-5 space-y-2.5" style={{ "--i": i } as React.CSSProperties}>
              <div className="h-3 w-40 rounded bg-foreground/[0.08] animate-pulse" />
              <div className="h-3 w-64 rounded bg-foreground/[0.06] animate-pulse" />
            </div>
          ))}
        </div>
      ) : rules && rules.length > 0 ? (
        <div className="stagger">
          {rules.map((r: Rule, idx: number) => (
            <div key={r.id} className="row px-5 sm:px-8 py-5 flex items-start justify-between gap-4" style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
              <div className="flex-1 min-w-0">
                <p className={`text-[15px] font-light truncate ${r.is_active ? "text-foreground" : "text-foreground/50"}`}>{r.name}</p>
                <p className="mt-1 text-[13px] font-light text-foreground/60 leading-relaxed">
                  when {prettyTrigger(r)}, {prettyAction(r)}.
                </p>
                <p className="mt-1.5 text-[12px] font-light text-foreground/40 tabular-nums">
                  {r.trigger_count === 0 ? "has not fired yet" : `fired ${r.trigger_count} ${r.trigger_count === 1 ? "time" : "times"}`}
                  {r.last_triggered_at && ` · last ${new Date(r.last_triggered_at).toLocaleString().toLowerCase()}`}
                </p>
              </div>
              <div className="flex items-center shrink-0 -mr-2">
                <button
                  role="switch"
                  aria-checked={r.is_active}
                  onClick={() => toggleRule.mutate({ id: r.id, active: !r.is_active })}
                  disabled={toggleRule.isPending}
                  className="quiet text-[13px] h-10 px-2 rounded-md"
                >
                  {r.is_active ? "on" : "off"}
                </button>
                <button
                  onClick={() => { if (window.confirm(`delete "${r.name}"? this cannot be undone.`)) deleteRule.mutate(r.id); }}
                  aria-label={`delete ${r.name}`}
                  className="quiet p-2 rounded-md hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="no rules yet."
          description="a rule watches one post and does one thing when something happens: a follow-up when a poll closes, or a message to you when a post takes off."
          actionLabel="write one"
          onAction={() => setOpen(true)}
        />
      )}

      {recentRuns && recentRuns.length > 0 && (
        <section className="pt-6">
          <p className="px-5 sm:px-8 pb-1 text-[12px] font-light text-foreground/40">recent runs</p>
          <div className="stagger">
            {recentRuns.map((run: Rule, idx: number) => (
              <div key={run.id} className="row px-5 sm:px-8 py-3 flex items-baseline gap-3 text-[13px] font-light" style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
                <span className="text-foreground/40 tabular-nums whitespace-nowrap">{new Date(run.created_at).toLocaleString().toLowerCase()}</span>
                <span className={run.success ? "text-foreground/70" : "text-foreground"}>{run.success ? "ran" : "failed"}</span>
                {run.error_message && <span className="text-foreground/50 truncate">{run.error_message}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </DashboardLayout>
  );
};

function prettyTrigger(r: Rule) {
  const c = r.trigger_config ?? {};
  switch (r.trigger_type) {
    case "likes_threshold": return `the post reaches ${c.threshold ?? 100} likes`;
    case "comments_threshold": return `the post reaches ${c.threshold ?? 10} replies`;
    case "time_after_post": return `${c.minutes ?? 60} minutes have passed`;
    case "poll_winner": return c.expected_option ? `the poll closes with "${c.expected_option}" winning` : "the poll closes";
    default: return r.trigger_type;
  }
}
function prettyAction(r: Rule) {
  const c = r.action_config ?? {};
  switch (r.action_type) {
    case "create_post": return `post a follow-up${c.content ? `: "${String(c.content).slice(0, 40)}…"` : ""}`;
    case "archive_post": return "make it private";
    case "unpin_replace": return "replace the pinned post";
    case "send_dm": return "message you";
    default: return r.action_type;
  }
}

export default Rules;
