// Service Worker with automatic cache invalidation on version change
// The version is dynamically set at build time and checked on every install/activate

let CACHE_NAME = 'forneiro-eden-v1'; // Fallback version
const PRECACHE_URLS = ['/', '/index.html'];

// Load version from version.json (generated at build time)
async function loadVersion() {
  try {
    const response = await fetch('/version.json');
    if (response.ok) {
      const data = await response.json();
      const newVersion = data.version || 'v1';
      CACHE_NAME = `forneiro-eden-${newVersion}`;
      console.log(`[SW] Cache version set to: ${CACHE_NAME}`);
      return CACHE_NAME;
    }
  } catch (e) {
    console.warn('[SW] Failed to load version.json, using fallback:', e);
  }
  return CACHE_NAME;
}

// Initialize version on install
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  // Activate faster
  self.skipWaiting();
  event.waitUntil(
    loadVersion().then((cacheName) => 
      caches.open(cacheName).then((cache) => cache.addAll(PRECACHE_URLS))
    )
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  event.waitUntil(
    loadVersion().then((cacheName) =>
      caches.keys().then((keys) => Promise.all(
        keys.map((key) => {
          if (key !== cacheName) {
            console.log(`[SW] Deleting old cache: ${key}`);
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      )).then(() => self.clients.claim())
    )
  );
});

// Helper to determine navigation requests
const isNavigationRequest = (req) => {
  return req.mode === 'navigate' || (req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html'));
};

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // ignore non-GET

  // For navigation (HTML) use network-first so users get latest index.html
  if (isNavigationRequest(req)) {
    event.respondWith(
      fetch(req)
        .then((networkResp) => {
          // update cache and return
          try {
            const cloned = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, cloned)).catch(() => {});
          } catch (e) {
            // cloning failed (body already used or opaque), ignore cache update
            console.warn('SW: failed to clone response for caching', e);
          }
          return networkResp;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // For other assets: try cache first, then network. If served from cache, update in background.
  // Special-case: fetch logo images network-first so updated logos propagate immediately
  try {
    const url = new URL(req.url);
    const pathname = url.pathname || '';
    const isLogo = pathname.toLowerCase().includes('logo') || pathname.toLowerCase().includes('logotipo');
    if (isLogo || req.destination === 'image' && pathname.toLowerCase().includes('brand')) {
      event.respondWith(
        fetch(req)
          .then((networkResp) => {
            if (networkResp && networkResp.ok) {
              try {
                const cloned = networkResp.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(req, cloned)).catch(() => {});
              } catch (e) { /* ignore */ }
            }
            return networkResp;
          })
          .catch(() => caches.match(req))
      );
      return;
    }

    // Default: cache-first with background update
    event.respondWith(
      caches.match(req).then((cachedResp) => {
        const networkFetch = fetch(req).then((networkResp) => {
          if (networkResp && networkResp.ok) {
            try {
              const cloned = networkResp.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, cloned)).catch(() => {});
            } catch (e) { /* ignore */ }
          }
          return networkResp;
        }).catch(() => null);

        return cachedResp || networkFetch;
      })
    );
  } catch (err) {
    // fallback safe behavior
    event.respondWith(fetch(req).catch(() => caches.match(req)));
  }
});

// Handle messages from clients (e.g., skip waiting after update)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message, activating update');
    self.skipWaiting();
  }
});

// Allow the page to tell the SW to skipWaiting (used during deploy)
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
