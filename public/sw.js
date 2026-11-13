// Minimal service worker: makes the app installable. No offline caching on purpose —
// the timer always needs the server clock.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
