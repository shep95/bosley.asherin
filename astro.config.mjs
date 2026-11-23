// @ts-check
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import sitemap from "@astrojs/sitemap";

export const SITE = "https://bosley.asherin.com";

export default defineConfig({
  site: SITE,
  trailingSlash: "never",
  // pages are static html; only /api/* runs as serverless functions.
  output: "static",
  adapter: vercel({
    // no analytics, no speed insights: nothing third-party runs in a visitor's browser.
    webAnalytics: { enabled: false },
    // src/middleware.ts runs at the edge in front of the comment api.
    middlewareMode: "edge",
    imageService: false,
  }),
  integrations: [
    sitemap({
      filter: (page) => !/\/(styleguide|api)(\/|$)/.test(page),
    }),
  ],
  build: {
    // every stylesheet ships as a file so the csp can stay `style-src 'self'`.
    inlineStylesheets: "never",
    format: "directory",
  },
  image: {
    // sharp re-encodes every post image at build. it never copies exif, gps,
    // xmp, iptc or icc data into the output, so published images carry no metadata.
    service: { entrypoint: "astro/assets/services/sharp" },
  },
  markdown: {
    // syntax highlighters write inline style="" attributes, which the csp forbids.
    // code blocks are styled from the site stylesheet instead.
    syntaxHighlight: false,
  },
  vite: {
    build: {
      // images under 4 kb are written into the page as data: urls ("images as code").
      assetsInlineLimit: 4096,
    },
  },
  devToolbar: { enabled: false },
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
});
