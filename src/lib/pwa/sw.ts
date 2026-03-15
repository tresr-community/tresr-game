/// <reference lib="webworker" />

const VERSION = import.meta.env.PACKAGE_VERSION || "0.0.0";
const BUILD_ID = import.meta.env.BUILD_ID || "unknown";
const CACHE_NAME = `tresr-v${VERSION}`;

declare const self: ServiceWorkerGlobalScope;

// Minimal fallback if precache manifest fails to load
const FALLBACK_ASSETS = ["/", "/manifest.json"];

/**
 * Fetch the build-time generated precache manifest.
 * Falls back to FALLBACK_ASSETS if the manifest is unavailable.
 */
async function loadPrecacheManifest(): Promise<string[]> {
  try {
    const res = await fetch("/precache-manifest.json");
    if (res.ok) {
      const assets = (await res.json()) as string[];
      console.log(
        `[SW] [INFO] Precache manifest loaded: ${assets.length} assets`
      );
      return assets;
    }
  } catch {
    // Manifest unavailable — use fallback
  }
  console.warn("[SW] [WARN] Precache manifest unavailable, using fallback");
  return FALLBACK_ASSETS;
}

self.addEventListener("install", (event: ExtendableEvent) => {
  console.log(`[SW] [INFO] Install event fired (build: ${BUILD_ID})`);
  event.waitUntil(
    loadPrecacheManifest().then((assets) =>
      caches.open(CACHE_NAME).then((cache) => {
        // Cache assets individually so a single 404 (e.g. during a partial
        // deploy or missing wallpaper) doesn't abort the entire SW install.
        return Promise.all(
          assets.map((url) =>
            cache.add(url).catch((err) => {
              console.warn(
                `[SW] [WARN] Skipping uncacheable asset: ${url}`,
                err
              );
            })
          )
        );
      })
    )
  );
});

// Activate: Clean up old caches and claim clients immediately
self.addEventListener("activate", (event: ExtendableEvent) => {
  console.log("[SW] [INFO] Activate event fired");
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames: string[]) => {
        return Promise.all(
          cacheNames.map((cache: string) => {
            if (cache !== CACHE_NAME) {
              console.log("[SW] [INFO] Deleting old cache:", cache);
              return caches.delete(cache);
            }
          })
        );
      })
      .then(() => {
        console.log("[SW] [INFO] Claiming clients");
        return (self as ServiceWorkerGlobalScope).clients.claim();
      })
  );
  console.log("[SW] [INFO] Activation completed, SW now controlling page");
});

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  console.log("[SW] [INFO] Message received:", event.data);
  if (event.data && event.data.action === "skipWaiting") {
    console.log("[SW] [INFO] Skip waiting triggered");
    (self as ServiceWorkerGlobalScope).skipWaiting();
  }
});

// Fetch: Network-first for everything.
// Hashed _astro/ assets are immutable (filename changes on rebuild) so
// they don't benefit from cache-first — and cache-first causes stale
// code to persist across deploys even after "hard reload".
self.addEventListener("fetch", (event: FetchEvent) => {
  const req = event.request;

  // Skip non-HTTP requests (e.g., chrome-extension)
  if (!req.url.startsWith("http")) return;

  // Let API calls and non-GET requests pass through without caching
  if (req.url.includes("/api/") || req.method !== "GET") return;

  // Never cache config or manifest files — always fetch fresh
  if (req.url.includes("/config-") || req.url.includes("/precache-manifest")) {
    event.respondWith(fetch(req));
    return;
  }

  // Network-first for ALL requests (navigation + assets)
  event.respondWith(
    fetch(req)
      .then((fetchResponse: Response) => {
        // Cache successful responses for offline fallback
        if (fetchResponse.status === 200) {
          const responseClone = fetchResponse.clone();
          caches.open(CACHE_NAME).then((cache: Cache) => {
            cache.put(req, responseClone);
          });
        }
        return fetchResponse;
      })
      .catch(async () => {
        // Offline fallback: serve from cache if network is unavailable
        const cached = await caches.match(req);
        return cached || new Response("Offline", {status: 503});
      })
  );
});
