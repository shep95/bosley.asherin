import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { corsFor, clientIp } from "../_shared/cors.ts";

// Large accounts must not turn one export into an unbounded read. Each list is
// read in pages of PAGE rows, up to MAX_ROWS rows, newest first.
const PAGE = 1000;
const MAX_ROWS = 10_000;

type Row = Record<string, unknown>;

/**
 * Read a query in pages via .range(). `build` must return a fresh query each
 * time (PostgREST builders are single-use). Returns the rows and whether the
 * cap was hit.
 */
async function readAll<T extends Row>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  max = MAX_ROWS,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const to = Math.min(from + PAGE, max) - 1;
    const { data, error } = await build(from, to);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < to - from + 1) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

serve(async (req) => {
  const corsHeaders = corsFor(req, 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Method guard — export is a read action triggered explicitly by the user.
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // The user's own client reads the user's own data, so RLS (including the
    // two-factor requirement) still applies to everything exported.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );
    // Only service_role may execute record_audit_event, and the throttle has
    // to see the audit rows regardless of the caller's RLS. Never used for
    // the user's data.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Throttle: each export fans out into ~8 DB queries, so cap it to one
    // export per 5 minutes per user to prevent it being used as a read-load
    // amplification vector.
    const throttleSince = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: recentExports, error: throttleError } = await adminClient
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('action', 'data_export')
      .gte('created_at', throttleSince);
    if (throttleError) throw new Error(throttleError.message);
    if ((recentExports ?? 0) > 0) {
      return new Response(
        JSON.stringify({ error: 'Export was requested recently. Please wait a few minutes before trying again.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '300' } }
      );
    }

    // Fetch user's profile
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Fetch user's posts (paged, capped)
    const { rows: posts, truncated: postsTruncated } = await readAll<Row>((from, to) =>
      supabaseClient
        .from('posts')
        .select('id, content, created_at, media_urls, edit_count, visibility')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
    );

    // Fetch user's comments (paged, capped)
    const { rows: comments, truncated: commentsTruncated } = await readAll<Row>((from, to) =>
      supabaseClient
        .from('comments')
        .select('id, content, post_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
    );

    // Fetch user's bookmarks
    const { rows: bookmarks } = await readAll<Row>((from, to) =>
      supabaseClient
        .from('bookmarks')
        .select('post_id, created_at, posts(content)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to)
    );

    // SECURITY: do NOT export raw auth UUIDs of the user's social graph —
    // they are internal identifiers and could be used to enumerate users
    // against the REST API. Resolve to usernames before export.
    const [{ rows: followingRows }, { rows: followerRows }] = await Promise.all([
      readAll<{ following_id: string }>((from, to) =>
        supabaseClient
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id)
          .order('following_id')
          .range(from, to)
      ),
      readAll<{ follower_id: string }>((from, to) =>
        supabaseClient
          .from('follows')
          .select('follower_id')
          .eq('following_id', user.id)
          .order('follower_id')
          .range(from, to)
      ),
    ]);

    const followingIds = followingRows.map((r) => r.following_id);
    const followerIds = followerRows.map((r) => r.follower_id);
    const allIds = Array.from(new Set([...followingIds, ...followerIds]));

    const idToUsername = new Map<string, string>();
    // Chunked so a large graph never builds an over-long request URL.
    for (let i = 0; i < allIds.length; i += 200) {
      const { data: profileRows, error: profileError } = await supabaseClient
        .from('profiles')
        .select('user_id, username')
        .in('user_id', allIds.slice(i, i + 200));
      if (profileError) throw new Error(profileError.message);
      for (const row of profileRows ?? []) {
        if (row?.user_id && row?.username) idToUsername.set(row.user_id, row.username);
      }
    }
    const followingUsernames = followingIds
      .map((id: string) => idToUsername.get(id))
      .filter((u: unknown): u is string => typeof u === 'string');
    const followerUsernames = followerIds
      .map((id: string) => idToUsername.get(id))
      .filter((u: unknown): u is string => typeof u === 'string');

    // Fetch user's likes
    const { rows: likes } = await readAll<Row>((from, to) =>
      supabaseClient
        .from('post_likes')
        .select('post_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to)
    );

    // Fetch user's settings
    const { data: settings } = await supabaseClient
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // Fetch user's messages (only their own for privacy). Only the columns
    // needed for the summary are read; content of other people's messages is
    // never exported.
    const { rows: messages, truncated: messagesTruncated } = await readAll<Row>((from, to) =>
      supabaseClient
        .from('messages')
        .select('id, sender_id, receiver_id, created_at')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
    );

    // Compile the export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      userId: user.id,
      email: user.email,
      profile: profile ? {
        username: profile.username,
        displayName: profile.display_name,
        bio: profile.bio,
        avatarUrl: profile.avatar_url,
        coverUrl: profile.cover_url,
        createdAt: profile.created_at,
        memberNumber: profile.member_number ?? null
      } : null,
      // Each list holds at most MAX_ROWS newest rows; `limits` says whether
      // older rows were left out.
      limits: {
        maxRowsPerList: MAX_ROWS,
        postsTruncated,
        commentsTruncated,
        messagesTruncated,
      },
      posts: posts.map(p => ({
        id: p.id,
        content: p.content,
        createdAt: p.created_at,
        mediaUrls: p.media_urls,
        editCount: p.edit_count,
        visibility: p.visibility
      })),
      comments: comments.map(c => ({
        id: c.id,
        content: c.content,
        postId: c.post_id,
        createdAt: c.created_at
      })),
      bookmarks: bookmarks.map(b => ({
        postId: b.post_id,
        createdAt: b.created_at,
        postContent: (b.posts as { content?: string } | null)?.content
      })),
      following: followingUsernames,
      followers: followerUsernames,
      followingCount: followingUsernames.length,
      followersCount: followerUsernames.length,
      likes: likes.map(l => ({
        postId: l.post_id,
        createdAt: l.created_at
      })),
      settings: settings ? {
        theme: settings.theme,
        showPolitics: settings.show_politics,
        showViral: settings.show_viral,
        hideInsults: settings.hide_insults,
        hidePoliticalArguments: settings.hide_political_arguments,
        notificationsEnabled: settings.notifications_enabled,
        messageRequestsEnabled: settings.message_requests_enabled,
        stealthMode: settings.stealth_mode
      } : null,
      messageCount: messages.length,
      // We don't export full message content for privacy of other users
      messagesSummary: {
        total: messages.length,
        sent: messages.filter(m => m.sender_id === user.id).length,
        received: messages.filter(m => m.receiver_id === user.id).length
      }
    };

    // Record the export for throttling + audit trail. service_role only; a
    // failure here must not hand out an unthrottled export, so it is fatal.
    const { error: auditError } = await adminClient.rpc('record_audit_event', {
      p_user_id: user.id,
      p_action: 'data_export',
      p_details: {},
      p_ip: clientIp(req),
      p_user_agent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
    });
    if (auditError) throw new Error(auditError.message);

    return new Response(
      JSON.stringify(exportData, null, 2),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="bosley-data-export-${new Date().toISOString().split('T')[0]}.json"`
        } 
      }
    );
  } catch (error) {
    console.error('Export error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to export data' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
