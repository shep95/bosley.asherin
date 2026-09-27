/**
 * Production console lock-down.
 *
 * Two goals:
 *  1. Self-XSS protection — the classic "paste this in the console to unlock…"
 *     scam. A loud warning is printed once, in the style browsers and large
 *     sites use, before anything else can be typed.
 *  2. Nothing the app logs at runtime can leak state (tokens, ids, emails) to
 *     someone shoulder-surfing DevTools or to a browser extension. Every
 *     console method becomes a frozen no-op in production builds.
 *
 * Development builds are untouched so debugging still works.
 */
export function installConsoleGuard(): void {
  if (import.meta.env.DEV) return;
  if (typeof window === "undefined" || typeof console === "undefined") return;

  const c = console as unknown as Record<string, unknown>;
  const warn = typeof c.warn === "function" ? (c.warn as (...a: unknown[]) => void).bind(console) : null;

  try {
    warn?.(
      "%cStop!",
      "color:#f43f5e;font-size:44px;font-weight:700;text-shadow:0 1px 0 #000",
    );
    warn?.(
      "%cThis browser feature is for developers. If someone told you to paste something here to \"unlock\" a feature or \"see who viewed your profile\", it is a scam and will give them access to your account. Report it to security@bosley.app.",
      "font-size:15px;line-height:1.5",
    );
  } catch {
    /* console may be unavailable */
  }

  const noop = () => undefined;
  const methods = [
    "log", "info", "debug", "warn", "error", "trace", "dir", "dirxml", "table", "group",
    "groupCollapsed", "groupEnd", "time", "timeEnd", "timeLog", "count", "countReset", "assert", "profile",
    "profileEnd", "timeStamp",
  ];
  for (const m of methods) {
    try {
      Object.defineProperty(console, m, { value: noop, writable: false, configurable: false, enumerable: true });
    } catch {
      /* ignore non-configurable props */
    }
  }
  try {
    Object.freeze(console);
  } catch {
    /* ignore */
  }

  // Hide React internals from the DevTools extension in production.
  const hook = (window as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ as
    | Record<string, unknown>
    | undefined;
  if (hook && typeof hook === "object") {
    for (const k of Object.keys(hook)) {
      if (typeof hook[k] === "function") hook[k] = noop;
    }
  }
}
