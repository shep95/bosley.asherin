import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
}));
