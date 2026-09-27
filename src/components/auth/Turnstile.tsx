import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/**
 * Optional Cloudflare Turnstile widget.
 *
 * Active only when `VITE_TURNSTILE_SITE_KEY` is set. The matching secret must be
 * configured in Supabase → Authentication → Bot and Abuse Protection so GoTrue
 * verifies the token server-side; the client merely forwards it.
 *
 * Token semantics passed to `onToken`:
 *   - `string`    a fresh, single-use token (submit is now allowed)
 *   - `null`      the token expired or the widget errored (block submit)
 *   - `undefined` captcha is not configured at all (submit freely)
 */

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() ?? "";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export const TURNSTILE_ENABLED = SITE_KEY.length > 0;

// Minimal local typing of the pieces of the Turnstile API we use.
interface TurnstileRenderOptions {
  sitekey: string;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact" | "flexible";
  action?: string;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
  "timeout-callback"?: () => void;
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string | undefined;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

const getTurnstile = (): TurnstileApi | undefined =>
  (window as unknown as { turnstile?: TurnstileApi }).turnstile;

// Loaded once per page, shared by every widget instance.
let scriptPromise: Promise<TurnstileApi> | null = null;

const loadTurnstile = (): Promise<TurnstileApi> => {
  const existing = getTurnstile();
  if (existing) return Promise.resolve(existing);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const fail = (reason: string) => {
      scriptPromise = null;
      reject(new Error(reason));
    };

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      const api = getTurnstile();
      if (api) resolve(api);
      else fail("Turnstile script loaded but window.turnstile is missing");
    });
    script.addEventListener("error", () => fail("Failed to load Turnstile script"));
    document.head.appendChild(script);
  });

  return scriptPromise;
};

export interface TurnstileHandle {
  /** Clear the current token and ask the user to solve the challenge again. */
  reset: () => void;
}

interface TurnstileProps {
  onToken: (token: string | null | undefined) => void;
  /** Bump this value to reset the widget without holding a ref. */
  resetKey?: number;
  /** Optional Turnstile `action` label, visible in Cloudflare analytics. */
  action?: string;
  className?: string;
}

const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(
  ({ onToken, resetKey = 0, action, className }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | undefined>(undefined);
    // Keep the latest callback without re-rendering the widget on each change.
    const onTokenRef = useRef(onToken);
    onTokenRef.current = onToken;

    const reset = () => {
      const api = getTurnstile();
      if (!api || !widgetIdRef.current) return;
      try {
        api.reset(widgetIdRef.current);
        onTokenRef.current(null);
      } catch {
        /* widget already gone */
      }
    };

    useImperativeHandle(ref, () => ({ reset }), []);

    useEffect(() => {
      if (!TURNSTILE_ENABLED) {
        // Tell the parent once that captcha is disabled so it can submit freely.
        onTokenRef.current(undefined);
        return;
      }

      let cancelled = false;

      loadTurnstile()
        .then((api) => {
          if (cancelled || !containerRef.current) return;
          widgetIdRef.current = api.render(containerRef.current, {
            sitekey: SITE_KEY,
            theme: "dark",
            size: "flexible",
            action,
            callback: (token) => onTokenRef.current(token),
            "expired-callback": () => onTokenRef.current(null),
            "error-callback": () => onTokenRef.current(null),
            "timeout-callback": () => onTokenRef.current(null),
          });
        })
        .catch(() => {
          // Script blocked or offline: leave submit disabled rather than
          // silently bypassing the check. The parent stays at `null`.
          if (!cancelled) onTokenRef.current(null);
        });

      return () => {
        cancelled = true;
        const api = getTurnstile();
        if (api && widgetIdRef.current) {
          try {
            api.remove(widgetIdRef.current);
          } catch {
            /* already removed */
          }
        }
        widgetIdRef.current = undefined;
      };
    }, [action]);

    // Parent-driven reset (e.g. after a failed submit — tokens are single-use).
    const firstResetRef = useRef(true);
    useEffect(() => {
      if (firstResetRef.current) {
        firstResetRef.current = false;
        return;
      }
      reset();
    }, [resetKey]);

    if (!TURNSTILE_ENABLED) return null;

    return <div ref={containerRef} className={className} />;
  }
);

Turnstile.displayName = "Turnstile";

export default Turnstile;
