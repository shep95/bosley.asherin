# bosley

a quiet room on the internet. a free social space with a chronological feed, no ads, and no engagement farming.

- **web:** React 18 · Vite 5 · TypeScript · Tailwind · shadcn/ui · TanStack Query · framer-motion
- **backend:** Supabase (Postgres + RLS, Auth, Storage, Realtime, Edge Functions)
- **hosting:** Vercel (static SPA + Edge Middleware)

## run it locally

```sh
cp .env.example .env      # fill in the three VITE_SUPABASE_* values from Supabase → Project Settings → API
npm ci
npm run dev               # http://localhost:8080
```

`npm run check` runs the same typecheck, lint and production build that CI runs.

## deploy to vercel

1. Import the GitHub repository in Vercel. `vercel.json` already sets the framework (Vite), the build command, the SPA rewrite and the security headers.
2. Connect Supabase: either install the **Supabase integration** (Project → Settings → Integrations), whose
   `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` variables the build picks up automatically, or add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` by hand for **Production and Preview**.
   A build without either renders a visible configuration screen instead of the app.
   The build refuses to run if the key it is given is a service-role key.
3. Deploy. `middleware.ts` runs at the edge on every request and blocks scrapers (see below).

### supabase setup for the vercel domain

- **Auth → URL Configuration:** set the Site URL to your production domain and add
  `https://<your-domain>/dashboard` (and the Vercel preview pattern `https://*-<team>.vercel.app/dashboard`) to the redirect allow-list.
- **Auth → Providers → Google:** enable it if you want the "continue with Google" button. Sign-in uses Supabase's own OAuth with PKCE; nothing third-party sits in the auth path.
- **Edge function secrets** (`supabase secrets set …`):
  - `ALLOWED_ORIGINS` — comma-separated browser origins, e.g. `https://bosley.app,https://www.bosley.app`
  - `ALLOWED_ORIGIN_PATTERN` — optional regex for previews, e.g. `^https://bosley[a-z0-9-]*\.vercel\.app$`
- **Apply the schema and functions:**

  ```sh
  npx supabase login
  npx supabase link --project-ref <project-ref>     # the ref is the subdomain of your Supabase URL
  npx supabase db push
  npx supabase functions deploy
  ```

  A project created by the Vercel integration starts empty: run this once before the first sign-up,
  otherwise the app loads but every query fails because no tables exist.

  The `Deploy Supabase` GitHub workflow does this automatically on pushes to `main` once the
  `SUPABASE_ACCESS_TOKEN` / `SUPABASE_DB_PASSWORD` secrets and the `SUPABASE_PROJECT_ID` variable exist.

## workflows

| workflow | trigger | what it does |
| --- | --- | --- |
| `CI` | every push / PR | `npm ci`, typecheck, lint, production build, `npm audit`, Deno typecheck of edge functions |
| `Deploy Supabase` | push to `main` touching `supabase/**` | `supabase db push` + `supabase functions deploy` |

Vercel builds and deploys the web app itself on every push (production from `main`, previews for branches).

## security

What the codebase enforces, and where.

**transport and browser**
- HSTS, `frame-ancestors 'none'` + `X-Frame-Options`, a strict Content-Security-Policy, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP and `X-Content-Type-Options` are served as HTTP headers from `vercel.json` (with a meta-tag copy in `index.html` as fallback).
- Authenticated routes are served with `X-Robots-Tag: noindex` and `Cache-Control: private, no-store`.
- Production builds replace every `console.*` method with a frozen no-op after printing a self-XSS warning, and neuter the React DevTools hook (`src/lib/consoleGuard.ts`).

**scraper protection**
- `middleware.ts` (Vercel Edge Middleware) blocks AI-training crawlers, SEO scrapers, headless browsers, generic HTTP libraries, empty user agents, and cross-site/iframe fetches of the app shell. Search engines and link-preview bots are allow-listed so SEO and share cards still work.
- `robots.txt` disallows all authenticated routes and the AI crawlers that honour it.
- The database no longer grants the anonymous role any table access. The signed-out landing preview reads through one capped RPC (`get_public_preview_posts`, latest 20 public posts, no pagination), so nothing can be bulk-enumerated with the public key.
- User-posted links render with `rel="noopener noreferrer nofollow ugc"` and `referrerpolicy="no-referrer"`; tracking parameters and zero-width watermarks are stripped before a post is saved.

**database (Postgres / RLS)** — see `supabase/migrations/20260927000000_security_hardening_and_premium_removal.sql`
- Privileged RPCs (`record_audit_event`, `record_login_attempt`, `is_account_locked`, cleanup jobs) are executable by the service role only. Previously anyone could spoof audit-log entries or lock arbitrary accounts.
- Login lockout is scoped to email **and** IP, so a remote attacker cannot lock someone else out.
- Notifications are created by database triggers (likes, reposts, comments, replies, follows, @mentions); the client INSERT path is closed.
- Reporters' identities are hidden from the authors they report. Users cannot log profile views of themselves. Anonymous Q&A honours the recipient's opt-out.
- A `handle_new_user` trigger creates the profile row on sign-up (fixes sign-up with email confirmation and OAuth users having no profile).
- Storage buckets have server-side size and MIME limits (avatars 5 MB, backgrounds 10 MB, post media 100 MB).

**application**
- MFA is enforced at the route level: a session at AAL1 with an enrolled TOTP factor cannot reach any protected page until it verifies.
- Every upload is checked against an allow-list, a size cap and its magic bytes, and the storage extension is derived from the verified MIME type. Images are re-encoded and videos are byte-scrubbed client-side to strip EXIF/GPS/device metadata.
- User-typed search text is escaped before it is interpolated into PostgREST filters. Inline CSS `url()` values are validated and escaped.
- Passwords are checked against Have I Been Pwned with k-anonymity (only a 5-character hash prefix leaves the device).
- OAuth and magic links use the PKCE flow.

**abuse resistance (attacker model: a free account talking to PostgREST directly)** — see `supabase/migrations/20260927120000_abuse_resistance.sql`
- Per-user write rate limits enforced by database triggers: posts 30/h, comments 60/h, direct and group messages 120/h, follows 100/h, likes and reactions 300/h, reposts 60/h, reports 20/h, anonymous questions 10/h per recipient. The service role is exempt.
- Reply controls (`everyone` / `followers` / `following` / `mentioned` / closed), minimum account age and minimum follower count are enforced by a trigger on comments, not just hidden in the UI. Authors' mutes also block replies.
- Direct messages are refused when the recipient has muted the sender or has message requests off and does not follow the sender. Recipients can mark messages read.
- Stealth mode is enforced on profile views. Poll votes are one per user per poll.
- `delete_my_account()` removes the auth user, every referencing row and every uploaded file. Password reset and optional Cloudflare Turnstile CAPTCHA (set `VITE_TURNSTILE_SITE_KEY` and enable it in Supabase → Auth → Bot and Abuse Protection) are wired in.
- Edge functions read the client IP from the rightmost `X-Forwarded-For` entry (or `CF-Connecting-IP`), so a forged header cannot evade or redirect the login lockout.
- Third-party image URLs are never rendered (tracking-pixel de-anonymisation), and every user image loads with `referrerpolicy="no-referrer"`.
- The CSP allows scripts from the site itself only. The build emits no inline scripts.
- Vulnerability scanner paths (`/.env`, `/.git/`, `/wp-login.php`, `*.php`, `*.sql`, …) get an instant 404 at the edge.
- Dependabot, a gitleaks secret scan and `npm audit` run in CI. See `SECURITY.md` for the disclosure policy.

**settings to apply in the Supabase dashboard** (not expressible in code)
- API → Max rows: set to 100 (default 1000) to cap bulk reads per request.
- Auth → Rate limits: keep the defaults or lower them; Auth → Bot and Abuse Protection → enable Turnstile if you set the site key.
- Auth → Email: keep "secure email change" (double confirmation) on; require email confirmation for sign-ups.
- Auth → URL configuration: only your production and preview origins in the redirect allow-list.

**operational**
- `.env` is git-ignored and untracked. The only values the browser bundle contains are the Supabase URL and the publishable (anon) key, which is by design public and gated by RLS.
- Dependencies are pruned to what is imported; `npm audit` runs in CI.
- Report vulnerabilities to `security@bosley.app` (`/.well-known/security.txt`).

## interface system

The interface follows one set of rules (see `src/index.css` primitives and `src/components/layout/`):

- thin, lowercase type; one accent colour (`signal`) used only at commitment states (post, send, save, follow, an unread mark, the active room)
- one reading column (`.room`) with hairline-separated rows (`.row`), no cards, no shadows
- quiet actions (`.quiet`) that wake on hover, text tabs with a moving underline (`.text-tab`), underline fields (`.field`)
- motion is opacity and transform only, one easing curve, honours reduced motion; loading states are page-shaped skeletons
- every list has an empty state with exactly one next action

## project layout

```
src/
  pages/            one file per route (see src/App.tsx for the route table)
  components/       feed, composer, messages, privacy, layout, landing, ui (shadcn)
  hooks/            useAuth (session + MFA), useNotifications, useIdleTimeout, useOfflineSync
  lib/              sanitize, mediaSanitize, linkUtils, storageUrl, securityChecks, consoleGuard
  integrations/     supabase client + generated types
supabase/
  migrations/       schema, RLS policies, triggers (apply with `supabase db push`)
  functions/        audit-log, check-login-rate, export-data, evaluate-post-rules (+ _shared/cors.ts)
middleware.ts       Vercel Edge Middleware (scraper/bot blocking)
vercel.json         rewrites + security headers
```

## removed

- All Lovable coupling: `@lovable.dev/cloud-auth-js`, `lovable-tagger`, the preview auth broker, Lovable AI gateway (translation), and Lovable origins in edge-function CORS.
- The subscription / premium tier and every paywall check. Every feature is available to every account.
- 40+ unused components, two unrouted pages, and 23 unused npm packages.
