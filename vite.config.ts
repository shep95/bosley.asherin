import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Resolve the Supabase connection from whichever names are present.
 *
 * The Vercel ↔ Supabase integration injects SUPABASE_URL / SUPABASE_ANON_KEY
 * (and NEXT_PUBLIC_* copies); people configuring by hand use VITE_*. Only the
 * URL and the publishable (anon) key are ever exposed to the browser — the
 * service-role key is explicitly refused so a mis-set variable cannot leak it.
 */
function resolveSupabaseEnv(mode: string) {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env } as Record<string, string | undefined>;
  const url =
    env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
  const key =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_ANON_KEY ||
    "";
  const projectId =
    env.VITE_SUPABASE_PROJECT_ID || url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i)?.[1] || "";

  // Refuse to bundle a service-role JWT under any name.
  const payload = key.split(".")[1];
  if (payload) {
    try {
      const claims = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
      if (claims?.role === "service_role") {
        throw new Error("Refusing to build: the configured Supabase key is a service-role key. Use the anon/publishable key.");
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Refusing")) throw e;
      /* not a JWT (e.g. sb_publishable_…) — fine */
    }
  }
  return { url: url.trim(), key: key.trim(), projectId: projectId.trim() };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const sb = resolveSupabaseEnv(mode);
  return {
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(sb.url),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(sb.key),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(sb.projectId),
  },
  server: {
    host: "::",
    port: 8080,
  },
  // Production bundles ship no console.* or debugger statements at all; the
  // runtime guard in src/lib/consoleGuard.ts covers third-party code.
  esbuild: mode === "production" ? { drop: ["console", "debugger"] } : undefined,
  build: {
    sourcemap: false,
    // No inline <script> in index.html: the module-preload polyfill would
    // force 'unsafe-inline' into the CSP, which is the one directive that
    // matters against XSS. Modern browsers preload modules natively.
    modulePreload: { polyfill: false },
    // A single 1 MB+ entry chunk meant nothing rendered until the entire app —
    // charts, motion, every Radix primitive — had parsed. Splitting the heavy,
    // rarely-changing vendors lets the landing page paint from a small entry
    // and keeps those chunks cached across deploys.
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "supabase": ["@supabase/supabase-js"],
          "motion": ["framer-motion"],
          "query": ["@tanstack/react-query"],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Emit registerSW.js as a file instead of an inline script (CSP).
      injectRegister: "script-defer",
      includeAssets: ["favicon.png", "favicon-192.png", "robots.txt"],
      manifest: {
        name: "Bosley - Free Speech Social Platform",
        short_name: "Bosley",
        description:
          "A modern social platform with real algorithm control, no engagement farming, and true free speech.",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/favicon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/favicon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webp,woff2}"],
        // The wallpaper and code chunks are content-hashed; precaching them
        // makes every repeat visit paint from disk.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
};
});
