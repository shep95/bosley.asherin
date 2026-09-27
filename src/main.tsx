import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import { installConsoleGuard } from "./lib/consoleGuard";
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

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>,
);
