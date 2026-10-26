import { useEffect, useState } from "react";

/**
 * Which sign-in providers the Supabase project actually has switched on.
 * GoTrue publishes this at /auth/v1/settings. Asking it means a provider
 * button only appears once the provider works, instead of a button that
 * always fails with "provider is not enabled".
 */
type Providers = Record<string, boolean>;

let pending: Promise<Providers> | null = null;

function loadProviders(): Promise<Providers> {
  if (!pending) {
    const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
    const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();
    pending = !url || !key
      ? Promise.resolve({})
      : fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
          .then((r) => (r.ok ? r.json() : {}))
          .then((s: { external?: Providers }) => s.external ?? {})
          .catch(() => {
            pending = null; // try again next time the modal opens
            return {};
          });
  }
  return pending;
}

/** True once the project confirms the provider is enabled; false until then. */
export function useAuthProvider(name: string): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let live = true;
    void loadProviders().then((p) => live && setEnabled(!!p[name]));
    return () => {
      live = false;
    };
  }, [name]);
  return enabled;
}
