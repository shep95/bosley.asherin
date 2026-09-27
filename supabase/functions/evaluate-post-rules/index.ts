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
          await executeAction(admin, rule);
          await admin
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
          await admin.from("post_rule_runs").insert({
            rule_id: rule.id,
            user_id: rule.user_id,
            success: true,
            details: { trigger_type: rule.trigger_type, action_type: rule.action_type },
          });
          results.push({ rule_id: rule.id, fired: true });
        }
      } catch (e: any) {
        await admin.from("post_rule_runs").insert({
          rule_id: rule.id,
          user_id: rule.user_id,
          success: false,
          error_message: String(e?.message ?? e),
        });
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
    const { data: owned } = await admin
      .from("posts")
      .select("id")
      .eq("id", rule.post_id)
      .eq("user_id", rule.user_id)
      .maybeSingle();
    if (!owned) return false;
  }
  switch (rule.trigger_type) {
    case "likes_threshold": {
      if (!rule.post_id) return false;
      const { count } = await admin
        .from("post_likes")
        .select("*", { count: "exact", head: true })
        .eq("post_id", rule.post_id);
      return (count ?? 0) >= (cfg.threshold ?? 100);
    }
    case "comments_threshold": {
      if (!rule.post_id) return false;
      const { count } = await admin
        .from("comments")
        .select("*", { count: "exact", head: true })
        .eq("post_id", rule.post_id);
      return (count ?? 0) >= (cfg.threshold ?? 10);
    }
    case "time_after_post": {
      if (!rule.post_id) return false;
      const { data: post } = await admin
        .from("posts").select("created_at").eq("id", rule.post_id).maybeSingle();
      if (!post) return false;
      const ageMin = (Date.now() - new Date(post.created_at).getTime()) / 60000;
      return ageMin >= (cfg.minutes ?? 60);
    }
    case "poll_winner": {
      if (!rule.post_id) return false;
      const { data: poll } = await admin
        .from("polls").select("id, ends_at").eq("post_id", rule.post_id).maybeSingle();
      if (!poll) return false;
      if (poll.ends_at && new Date(poll.ends_at) > new Date()) return false;
      const { data: opts } = await admin
        .from("poll_options").select("id, option_text").eq("poll_id", poll.id);
      const { data: votes } = await admin
        .from("poll_votes").select("option_id").eq("poll_id", poll.id);
      const counts = new Map<string, number>();
      (votes ?? []).forEach((v: any) => counts.set(v.option_id, (counts.get(v.option_id) ?? 0) + 1));
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
      await admin.from("posts").insert({
        user_id: rule.user_id,
        content: cfg.content ?? "",
        media_urls: cfg.media_urls ?? [],
        visibility: cfg.visibility ?? "public",
      });
      return;
    }
    case "archive_post": {
      if (!rule.post_id) return;
      await admin.from("posts").update({ visibility: "private" }).eq("id", rule.post_id);
      return;
    }
    case "unpin_replace": {
      await admin.from("profiles").update({ pinned_post_id: cfg.new_pinned_post_id ?? null })
        .eq("user_id", rule.user_id);
      return;
    }
    case "send_dm": {
      if (!cfg.receiver_id || !cfg.content) return;
      // SECURITY: a send_dm rule may only message the rule owner (self-DM).
      // action_config is user-mutable via direct DB writes; without this gate a
      // user could set receiver_id to any UUID and use the service-role context
      // to spam arbitrary users.
      if (cfg.receiver_id !== rule.user_id) return;
      await admin.from("messages").insert({
        sender_id: rule.user_id,
        receiver_id: cfg.receiver_id,
        content: cfg.content,
      });
      return;
    }
  }
}