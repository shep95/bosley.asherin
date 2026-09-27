/**
 * Shared CORS + security-header helpers for every edge function.
 *
 * Allowed browser origins come from the ALLOWED_ORIGINS secret (comma-separated,
 * e.g. "https://bosley.app,https://www.bosley.app"). Vercel preview deployments
 * for this project are matched by ALLOWED_ORIGIN_PATTERN (a regex, optional).
 * Unknown origins receive "null", which browsers refuse.
 *
 *   supabase secrets set ALLOWED_ORIGINS="https://bosley.app,https://www.bosley.app"
 *   supabase secrets set ALLOWED_ORIGIN_PATTERN="^https://bosley[a-z0-9-]*\.vercel\.app$"
 */
const DEFAULT_ORIGINS = ["https://bosley.app", "https://www.bosley.app"];

function allowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS");
  if (!raw) return DEFAULT_ORIGINS;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function allowedPattern(): RegExp | null {
  const raw = Deno.env.get("ALLOWED_ORIGIN_PATTERN");
  if (!raw) return null;
  try {
    return new RegExp(raw, "i");
  } catch {
    return null;
  }
}

export function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (allowedOrigins().includes(origin)) return true;
  const re = allowedPattern();
  return re ? re.test(origin) : false;
}

export function corsFor(req: Request, methods = "POST, OPTIONS"): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "null",
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Max-Age": "600",
  };
}

export const securityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
};

export function json(
  body: unknown,
  status: number,
  cors: Record<string, string>,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, ...securityHeaders, "Content-Type": "application/json", ...extra },
  });
}
