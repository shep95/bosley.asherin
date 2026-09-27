/**
 * Vercel Edge Middleware — runs before every request hits the static site.
 *
 * Purpose: stop link/content scrapers and abusive automation at the edge,
 * before they ever reach a page or the Supabase API keys embedded in it.
 *
 *  - Blocks known scraper / AI-training / bulk-download user agents.
 *  - Blocks HTML requests with no User-Agent at all (almost always scripts).
 *  - Blocks hot-linking of the app shell from foreign origins via `Sec-Fetch-*`
 *    (a page embedded in someone else's iframe or fetched cross-site).
 *  - Marks every authenticated-only route noindex for anything that gets through.
 *
 * Legitimate search engines (Googlebot, Bingbot, DuckDuckBot, Applebot, …) and
 * social link-preview fetchers are allowed so SEO and share cards keep working.
 */
import { next } from "@vercel/functions";

export const config = {
  // Skip static assets: they are content-hashed and harmless to fetch.
  matcher: ["/((?!assets/|favicon|og-image|manifest|sw\\.js|workbox-|robots\\.txt|sitemap\\.xml|llms\\.txt|\\.well-known/).*)"],
};

const BLOCKED_UA = [
  // AI training / LLM retrieval crawlers
  /GPTBot/i, /ChatGPT-User/i, /OAI-SearchBot/i, /CCBot/i, /anthropic-ai/i, /ClaudeBot/i, /Claude-Web/i,
  /Google-Extended/i, /Bytespider/i, /PerplexityBot/i, /Amazonbot/i, /Diffbot/i, /cohere-ai/i,
  /Meta-ExternalAgent/i, /FacebookBot/i, /Applebot-Extended/i, /YouBot/i, /ImagesiftBot/i, /Omgili/i,
  /Timpibot/i, /VelenPublicWebCrawler/i, /webzio/i, /Scrapy/i, /DataForSeoBot/i,
  // SEO / marketing scrapers that hammer sites
  /AhrefsBot/i, /SemrushBot/i, /MJ12bot/i, /DotBot/i, /BLEXBot/i, /PetalBot/i, /serpstatbot/i, /ZoominfoBot/i,
  // Generic scripted clients
  /python-requests/i, /python-urllib/i, /aiohttp/i, /httpx\//i, /Go-http-client/i, /Java\//i, /okhttp/i,
  /libwww-perl/i, /^curl\//i, /^Wget\//i, /node-fetch/i, /axios\//i, /undici/i, /HeadlessChrome/i,
  /PhantomJS/i, /Puppeteer/i, /Playwright/i, /Selenium/i, /scrapy/i, /HTTrack/i, /wget/i, /WebCopier/i,
  /Offline Explorer/i, /SiteSucker/i, /Teleport/i, /WebZIP/i, /larbin/i, /nutch/i, /zgrab/i, /masscan/i,
  /nikto/i, /sqlmap/i, /nmap/i, /Nessus/i, /WPScan/i, /dirbuster/i, /gobuster/i, /feroxbuster/i,
];

// Explicit allow-list wins over the block-list (Google's crawler shares tokens
// with Google-Extended, for example).
const ALLOWED_UA = [
  /Googlebot/i, /Storebot-Google/i, /Google-InspectionTool/i, /AdsBot-Google/i, /Mediapartners-Google/i,
  /bingbot/i, /BingPreview/i, /DuckDuckBot/i, /Applebot(?!-Extended)/i, /YandexBot/i, /Baiduspider/i,
  /Slurp/i, /facebookexternalhit/i, /Twitterbot/i, /LinkedInBot/i, /Slackbot/i, /Discordbot/i,
  /TelegramBot/i, /WhatsApp/i, /Pinterestbot/i, /redditbot/i, /Embedly/i, /Iframely/i, /Mastodon/i,
  /vercel-screenshot/i, /vercel-favicon/i, /Vercel Edge Functions/i,
];

const PRIVATE_PREFIXES = [
  "/dashboard", "/explore", "/search", "/notifications", "/messages", "/bookmarks", "/lists",
  "/communities", "/events", "/drafts", "/rules", "/templates", "/compose", "/calendar", "/profile",
  "/settings", "/sponsors", "/scheduled", "/analytics", "/user/", "/post/",
];

function deny(status: number, reason: string): Response {
  return new Response(reason, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export default function middleware(request: Request) {
  const url = new URL(request.url);
  const ua = request.headers.get("user-agent") ?? "";
  const accept = request.headers.get("accept") ?? "";
  const wantsHtml = accept.includes("text/html") || accept === "*/*" || accept === "";

  // Only navigations/documents are policed here; XHR to Supabase never passes
  // through this middleware because it goes straight to *.supabase.co.
  if (request.method !== "GET" && request.method !== "HEAD") {
    return deny(405, "Method not allowed");
  }

  const allowed = ALLOWED_UA.some((re) => re.test(ua));
  if (!allowed) {
    if (wantsHtml && ua.trim().length === 0) return deny(403, "Forbidden");
    if (BLOCKED_UA.some((re) => re.test(ua))) return deny(403, "Forbidden");
  }

  // A browser fetching our document from another site's page (embedding /
  // cross-site scripted fetch). Top-level navigations and same-origin loads
  // set `navigate` / `same-origin`.
  const fetchSite = request.headers.get("sec-fetch-site");
  const fetchMode = request.headers.get("sec-fetch-mode");
  const fetchDest = request.headers.get("sec-fetch-dest");
  if (fetchSite === "cross-site" && fetchMode !== "navigate" && fetchDest !== "document") {
    return deny(403, "Forbidden");
  }
  if (fetchDest === "iframe" || fetchDest === "frame" || fetchDest === "embed" || fetchDest === "object") {
    return deny(403, "Forbidden");
  }

  const isPrivate = PRIVATE_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(p.endsWith("/") ? p : p + "/"));
  const headers: Record<string, string> = {};
  if (isPrivate) headers["x-robots-tag"] = "noindex, nofollow, noarchive, nosnippet";
  return next({ headers });
}
