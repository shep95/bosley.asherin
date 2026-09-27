import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import { installConsoleGuard } from "./lib/consoleGuard";
import { supabaseConfigMissing } from "./integrations/supabase/client";
import "./index.css";

installConsoleGuard();

// Frame-busting fallback. The real control is the `frame-ancestors 'none'`
// CSP + X-Frame-Options headers served by Vercel (see vercel.json).
try {
  if (window.self !== window.top) {
    window.top!.location.replace(window.self.location.href);
  }
} catch {
  /* framed by a hostile origin: the HTTP headers already refused to render */
}

/**
 * A build without Supabase credentials must say so on screen. Throwing at
 * module load used to leave a black page with nothing to read.
 */
const ConfigMissing = () => (
  <main className="min-h-screen bg-background text-foreground flex items-end px-5 sm:px-8 lg:px-12 pb-16 pt-28">
    <div className="max-w-3xl">
      <p className="text-foreground/40 text-[11px] font-light tracking-[0.28em] uppercase mb-8">configuration</p>
      <h1 className="text-[clamp(2rem,6vw,4.5rem)] font-extralight leading-[0.95] tracking-[-0.045em]">
        this build has no backend.
      </h1>
      <p className="mt-8 text-foreground/60 font-light leading-relaxed">
        the site was built without a supabase url and publishable key. on vercel, either connect the supabase
        integration (project → settings → integrations) or add{" "}
        <code className="text-foreground/85">VITE_SUPABASE_URL</code> and{" "}
        <code className="text-foreground/85">VITE_SUPABASE_PUBLISHABLE_KEY</code> under environment variables,
        then redeploy. locally, copy <code className="text-foreground/85">.env.example</code> to{" "}
        <code className="text-foreground/85">.env</code>.
      </p>
    </div>
  </main>
);

createRoot(document.getElementById("root")!).render(
  supabaseConfigMissing ? (
    <ConfigMissing />
  ) : (
    <HelmetProvider>
      <App />
    </HelmetProvider>
  ),
);
