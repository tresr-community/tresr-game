// Dev-mode service worker stub.
// In production builds, this is overwritten by the compiled sw.ts via sw-builder integration.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
