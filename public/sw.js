/*
 * retires the old bosley app's service worker.
 *
 * the previous react version installed a workbox service worker at /sw.js
 * that served a cached app shell. browsers keep it until they find a new
 * /sw.js. this one installs, takes control, deletes every cache, unregisters
 * itself and reloads open tabs, so returning visitors land on the new site.
 * the new site registers no service worker.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const tabs = await self.clients.matchAll({ type: "window" });
    for (const tab of tabs) tab.navigate(tab.url);
  })());
});
// until the reload happens, never answer from a cache.
self.addEventListener("fetch", () => {});
