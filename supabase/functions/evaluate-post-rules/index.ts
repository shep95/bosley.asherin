import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

import { corsFor } from "../_shared/cors.ts";

// Constant-time string comparison to avoid leaking the secret via timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Method guard — this endpoint only ever runs as a triggered job.
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Body size guard.
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > 2048) {
    return new Response(JSON.stringify({ error: "Request too large" }), {
      status: 413,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // AUTH: this function uses the service role (bypasses RLS) and can mutate
  // data on behalf of any user (create posts, send DMs, archive content).
  // It must therefore ONLY be invokable by the trusted scheduler, which
  // presents the project's service-role key as a Bearer token. Without this
  // gate, any anonymous caller could trigger global rule execution.
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || !SERVICE_KEY || !timingSafeEqual(token, SERVICE_KEY)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const results: any[] = [];

  try {
    const { data: rules, error } = await admin
      .from("post_rules")
      .select("*")
      .eq("is_active", true);
    if (error) throw error;

    for (const rule of rules ?? []) {
      try {
        const fired = await evaluateRule(admin, rule);
        if (fired) {
          // Throws on any failed write: the catch below logs a failed run and
          // the rule stays active so the next run can retry it.
          await executeAction(admin, rule);
          const { error: ruleUpdateError } = await admin
            .from("post_rules")
            .update({
              trigger_count: (rule.trigger_count ?? 0) + 1,
              last_triggered_at: new Date().toISOString(),
              // All supported triggers are one-shot. Deactivate after firing so
              // threshold/poll rules do not re-execute their action on every
              // scheduled run (which previously spammed posts/DMs forever).
              is_active: false,
            })
            .eq("id", rule.id);
          if (ruleUpdateError) throw new Error(`could not update rule: ${ruleUpdateError.message}`);
          const { error: runInsertError } = await admin.from("post_rule_runs").insert({
            rule_id: rule.id,
            user_id: rule.user_id,
            success: true,
            details: { trigger_type: rule.trigger_type, action_type: rule.action_type },
          });
          if (runInsertError) console.error("post_rule_runs insert failed:", runInsertError.message);
          results.push({ rule_id: rule.id, fired: true });
        }
      } catch (e: any) {
        const { error: failLogError } = await admin.from("post_rule_runs").insert({
          rule_id: rule.id,
          user_id: rule.user_id,
          success: false,
          error_message: String(e?.message ?? e).slice(0, 500),
        });
        if (failLogError) console.error("post_rule_runs insert failed:", failLogError.message);
        // Persist detail to post_rule_runs (owner-visible), but never leak
        // raw exception text back over HTTP.
        results.push({ rule_id: rule.id, error: "rule_failed" });
      }
    }

    return new Response(JSON.stringify({ evaluated: rules?.length ?? 0, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("evaluate-post-rules error:", e);
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function evaluateRule(admin: any, rule: any): Promise<boolean> {
  const cfg = rule.trigger_config ?? {};
  // SECURITY: a rule may only observe a post owned by the rule's owner.
  // Without this, a user could attach a low-threshold rule to someone else's
  // private/followers-only post and use the fire time as an engagement oracle.
  if (rule.post_id) {
    const { data: owned, error } = await admin
      .from("posts")
      .select("id")
      .eq("id", rule.post_id)
      .eq("user_id", rule.user_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!owned) return false;
  }
  switch (rule.trigger_type) {
    case "likes_threshold": {
      if (!rule.post_id) return false;
      const { count, error } = await admin
        .from("post_likes")
        .select("*", { count: "exact", head: true })
        .eq("post_id", rule.post_id);
      if (error) throw new Error(error.message);
      return (count ?? 0) >= (cfg.threshold ?? 100);
    }
    case "comments_threshold": {
      if (!rule.post_id) return false;
      const { count, error } = await admin
        .from("comments")
        .select("*", { count: "exact", head: true })
        .eq("post_id", rule.post_id);
      if (error) throw new Error(error.message);
      return (count ?? 0) >= (cfg.threshold ?? 10);
    }
    case "time_after_post": {
      if (!rule.post_id) return false;
      const { data: post, error } = await admin
        .from("posts").select("created_at").eq("id", rule.post_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!post) return false;
      const ageMin = (Date.now() - new Date(post.created_at).getTime()) / 60000;
      return ageMin >= (cfg.minutes ?? 60);
    }
    case "poll_winner": {
      if (!rule.post_id) return false;
      const { data: poll, error: pollError } = await admin
        .from("polls").select("id, ends_at").eq("post_id", rule.post_id).maybeSingle();
      if (pollError) throw new Error(pollError.message);
      if (!poll) return false;
      if (poll.ends_at && new Date(poll.ends_at) > new Date()) return false;
      const { data: opts, error: optsError } = await admin
        .from("poll_options").select("id, option_text").eq("poll_id", poll.id);
      if (optsError) throw new Error(optsError.message);
      // Exact per-option counts (a plain select of vote rows is capped at the
      // API's max-rows and would undercount large polls).
      const counts = new Map<string, number>();
      await Promise.all((opts ?? []).map(async (o: any) => {
        const { count, error: countError } = await admin
          .from("poll_votes")
          .select("*", { count: "exact", head: true })
          .eq("poll_id", poll.id)
          .eq("option_id", o.id);
        if (countError) throw new Error(countError.message);
        counts.set(o.id, count ?? 0);
      }));
      let winner: any = null; let max = -1;
      (opts ?? []).forEach((o: any) => {
        const c = counts.get(o.id) ?? 0;
        if (c > max) { max = c; winner = o; }
      });
      if (!winner) return false;
      if (cfg.expected_option && winner.option_text !== cfg.expected_option) return false;
      return true;
    }
  }
  return false;
}

async function executeAction(admin: any, rule: any): Promise<void> {
  const cfg = rule.action_config ?? {};
  switch (rule.action_type) {
    case "create_post": {
      const { error } = await admin.from("posts").insert({
        user_id: rule.user_id,
        content: cfg.content ?? "",
        media_urls: cfg.media_urls ?? [],
        visibility: cfg.visibility ?? "public",
      });
      if (error) throw new Error(`could not create the post: ${error.message}`);
      return;
    }
    case "archive_post": {
      if (!rule.post_id) throw new Error("no post to make private");
      const { error } = await admin
        .from("posts")
        .update({ visibility: "private" })
        .eq("id", rule.post_id)
        .eq("user_id", rule.user_id);
      if (error) throw new Error(`could not make the post private: ${error.message}`);
      return;
    }
    case "unpin_replace": {
      // Pin the configured post (or, by default, the watched post) in place of
      // the current first pin. Profiles store pins as pinned_post_ids uuid[].
      const newId: string | null = cfg.new_pinned_post_id ?? rule.post_id ?? null;
      if (!newId) throw new Error("no post to pin");
      const { data: owned, error: ownedError } = await admin
        .from("posts")
        .select("id")
        .eq("id", newId)
        .eq("user_id", rule.user_id)
        .maybeSingle();
      if (ownedError) throw new Error(ownedError.message);
      if (!owned) throw new Error("the post to pin is not yours or no longer exists");

      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("pinned_post_ids")
        .eq("user_id", rule.user_id)
        .maybeSingle();
      if (profileError) throw new Error(profileError.message);
      if (!profile) throw new Error("profile not found");

      const current: string[] = Array.isArray(profile.pinned_post_ids) ? profile.pinned_post_ids : [];
      // Drop the old first pin, then put the new one in front (no duplicates).
      const next = [newId, ...current.slice(1).filter((id) => id !== newId)];
      const { error } = await admin
        .from("profiles")
        .update({ pinned_post_ids: next })
        .eq("user_id", rule.user_id);
      if (error) throw new Error(`could not update the pinned post: ${error.message}`);
      return;
    }
    case "send_dm": {
      if (!cfg.receiver_id || !cfg.content) throw new Error("the message has no content");
      // SECURITY: a send_dm rule may only message the rule owner (self-DM).
      // action_config is user-mutable via direct DB writes; without this gate a
      // user could set receiver_id to any UUID and use the service-role context
      // to spam arbitrary users.
      if (cfg.receiver_id !== rule.user_id) throw new Error("rules can only message their owner");
      const { error } = await admin.from("messages").insert({
        sender_id: rule.user_id,
        receiver_id: cfg.receiver_id,
        content: cfg.content,
      });
      if (error) throw new Error(`could not send the message: ${error.message}`);
      return;
    }
    default:
      throw new Error(`unknown action: ${String(rule.action_type)}`);
  }
}
