import type { APIRoute } from "astro";
import { SITE } from "../lib/site";

/** search engines welcome; ai-training and ai-answer crawlers are not. */
const AI_BOTS = [
  "GPTBot", "ChatGPT-User", "OAI-SearchBot", "Google-Extended", "Applebot-Extended", "CCBot", "ClaudeBot", "Claude-Web",
  "anthropic-ai", "PerplexityBot", "Perplexity-User", "Bytespider", "Amazonbot", "Meta-ExternalAgent", "Meta-ExternalFetcher",
  "FacebookBot", "cohere-ai", "cohere-training-data-crawler", "Diffbot", "ImagesiftBot", "Omgilibot", "Timpibot", "YouBot",
  "PetalBot", "AI2Bot", "Ai2Bot-Dolma", "DuckAssistBot", "MistralAI-User",
];

export const GET: APIRoute = () =>
  new Response(
    [
      "# model-training and ai-answer crawlers: nothing here may be collected.",
      ...AI_BOTS.map((b) => `User-agent: ${b}`),
      "Disallow: /",
      "",
      "# search engines: everything public is crawlable.",
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      "Disallow: /styleguide",
      "",
      `Sitemap: ${SITE.url}/sitemap-index.xml`,
      "",
    ].join("\n"),
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
