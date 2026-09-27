import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { corsFor } from "../_shared/cors.ts";

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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
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
    const { count: recentExports } = await supabaseClient
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('action', 'data_export')
      .gte('created_at', throttleSince);
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

    // Fetch user's posts
    const { data: posts } = await supabaseClient
      .from('posts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // Fetch user's comments
    const { data: comments } = await supabaseClient
      .from('comments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // Fetch user's bookmarks
    const { data: bookmarks } = await supabaseClient
      .from('bookmarks')
      .select('*, posts(*)')
      .eq('user_id', user.id);

    // SECURITY: do NOT export raw auth UUIDs of the user's social graph —
    // they are internal identifiers and could be used to enumerate users
    // against the REST API. Resolve to usernames before export.
    const { data: followingRows } = await supabaseClient
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);
    const { data: followerRows } = await supabaseClient
      .from('follows')
      .select('follower_id')
      .eq('following_id', user.id);

    const followingIds = (followingRows ?? []).map((r: any) => r.following_id);
    const followerIds = (followerRows ?? []).map((r: any) => r.follower_id);
    const allIds = Array.from(new Set([...followingIds, ...followerIds]));

    const idToUsername = new Map<string, string>();
    if (allIds.length > 0) {
      const { data: profileRows } = await supabaseClient
        .from('profiles')
        .select('user_id, username')
        .in('user_id', allIds);
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
    const { data: likes } = await supabaseClient
      .from('post_likes')
      .select('post_id, created_at')
      .eq('user_id', user.id);

    // Fetch user's settings
    const { data: settings } = await supabaseClient
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // Fetch user's messages (only their own for privacy)
    const { data: messages } = await supabaseClient
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

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
        isPremium: profile.is_premium
      } : null,
      posts: posts?.map(p => ({
        id: p.id,
        content: p.content,
        createdAt: p.created_at,
        mediaUrls: p.media_urls,
        editCount: p.edit_count,
        visibility: p.visibility
      })) || [],
      comments: comments?.map(c => ({
        id: c.id,
        content: c.content,
        postId: c.post_id,
        createdAt: c.created_at
      })) || [],
      bookmarks: bookmarks?.map(b => ({
        postId: b.post_id,
        createdAt: b.created_at,
        postContent: b.posts?.content
      })) || [],
      following: followingUsernames,
      followers: followerUsernames,
      followingCount: followingUsernames.length,
      followersCount: followerUsernames.length,
      likes: likes?.map(l => ({
        postId: l.post_id,
        createdAt: l.created_at
      })) || [],
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
      messageCount: messages?.length || 0,
      // We don't export full message content for privacy of other users
      messagesSummary: {
        total: messages?.length || 0,
        sent: messages?.filter(m => m.sender_id === user.id).length || 0,
        received: messages?.filter(m => m.receiver_id === user.id).length || 0
      }
    };

    // Record the export for throttling + audit trail (security-definer RPC).
    await supabaseClient.rpc('record_audit_event', {
      p_user_id: user.id,
      p_action: 'data_export',
      p_details: {},
      p_ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()?.slice(0, 45) ?? null,
      p_user_agent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
    });

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
