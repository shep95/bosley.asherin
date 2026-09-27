import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const SUPABASE_PUBLISHABLE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();

/**
 * True when the build was made without Supabase credentials. main.tsx renders
 * a visible configuration screen in that case instead of a blank page.
 * Vercel: Project → Settings → Environment Variables. Local: copy .env.example to .env.
 */
export const supabaseConfigMissing = !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = createClient<Database>(
  SUPABASE_URL || "https://not-configured.invalid",
  SUPABASE_PUBLISHABLE_KEY || "not-configured",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // PKCE keeps OAuth/magic-link callbacks safe even if the URL leaks (referrers, logs).
      flowType: "pkce",
    },
  },
);
