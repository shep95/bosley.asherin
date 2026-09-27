import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsFor, securityHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" },
    });
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > 2048) {
    return new Response(JSON.stringify({ error: "Request too large" }), {
      status: 413,
      headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { email, action, success } = body;
    const fwd = req.headers.get("x-forwarded-for") || "";
    const cfIp = req.headers.get("cf-connecting-ip") || "";
    const realIp = (cfIp || fwd.split(",")[0] || "").trim().slice(0, 45) || null;

    if (!email || typeof email !== "string" || email.length > 255) {
      return new Response(JSON.stringify({ error: "Valid email is required" }), {
        status: 400,
        headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["check", "record"].includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "check") {
      const { data: isLocked, error } = await supabase.rpc("is_account_locked", {
        check_email: email.toLowerCase().trim(),
        check_ip: realIp,
      });

      if (error) {
        console.error("Error checking lock status:", error);
        return new Response(JSON.stringify({ locked: false }), {
          headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          locked: isLocked,
          message: isLocked
            ? "Account temporarily locked due to too many failed attempts. Try again in 15 minutes."
            : null,
        }),
        {
          headers: {
            ...corsHeaders,
            ...securityHeaders,
            "Content-Type": "application/json",
            ...(isLocked ? { "Retry-After": "900" } : {}),
          },
        },
      );
    }

    if (action === "record") {
      const { error } = await supabase.rpc("record_login_attempt", {
        attempt_email: email.toLowerCase().trim(),
        attempt_ip: realIp,
        attempt_success: success === true,
      });

      if (error) {
        console.error("Error recording attempt:", error);
      }

      return new Response(JSON.stringify({ recorded: true }), {
        headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 400,
      headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" },
    });
  }
});
