/**
 * this domain used to run a different app (accounts on supabase, a workbox
 * service worker). returning browsers can still hold its leftovers: session
 * tokens in localStorage (`sb-*-auth-token`), caches, old flags. bosley keeps
 * everything of its own under `bosley:` — anything else on this origin is
 * left over, and is cleared on first sight.
 */
export function sweepLegacy(): void {
  for (const store of [safe(() => localStorage), safe(() => sessionStorage)]) {
    if (!store) continue;
    try {
      const stale: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && !k.startsWith("bosley:")) stale.push(k);
      }
      for (const k of stale) store.removeItem(k);
    } catch { /* storage blocked: nothing to sweep */ }
  }
  // the old app's indexeddb, if any (supabase / workbox expiration stores)
  try {
    const idb = indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
    idb.databases?.().then((dbs) => { for (const d of dbs) if (d.name) idb.deleteDatabase(d.name); }).catch(() => {});
  } catch { /* unavailable */ }
  // the old app's offline caches (bosley keeps none)
  try { void caches?.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).catch(() => {}); } catch { /* unavailable */ }
  // any service worker other than the self-removing kill switch
  try {
    navigator.serviceWorker?.getRegistrations().then((rs) => { for (const r of rs) void r.unregister(); }).catch(() => {});
  } catch { /* unavailable */ }
}

function safe<T>(get: () => T): T | null {
  try { return get(); } catch { return null; }
}
