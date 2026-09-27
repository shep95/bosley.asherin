import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsFor, securityHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Limit request body size (10KB max)
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 10240) {
    return new Response(
      JSON.stringify({ error: 'Request too large' }),
      { status: 413, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'log') {
      const { event, details } = body;
      
      // Validate event string
      if (!event || typeof event !== 'string' || event.length > 100) {
        return new Response(
          JSON.stringify({ error: 'Invalid event' }),
          { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabase.rpc('record_audit_event', {
        p_user_id: user.id,
        p_action: event.slice(0, 100),
        p_details: typeof details === 'object' ? details : {},
        p_ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()?.slice(0, 45) || null,
        p_user_agent: req.headers.get('user-agent')?.slice(0, 500) || null
      });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'list') {
      const limit = Math.min(Math.max(parseInt(body.limit) || 50, 1), 100);
      const offset = Math.max(parseInt(body.offset) || 0, 0);

      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return new Response(
        JSON.stringify({ logs: data }),
        { headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Something went wrong' }),
      { status: 500, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
