// CueForge Service Worker — Advanced caching with offline support
const CACHE_VERSION = '2';
const CACHE_NAME = `cueforge-v${CACHE_VERSION}`;
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
];

// Install: cache static assets and skip waiting
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        // Some assets may not exist yet, that's OK
        console.log('Cache install partial:', err);
      });
    }).then(() => {
      self.skipWaiting();
    })
  );
});

// Activate: clean up old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      self.clients.claim();
    })
  );
});

// Fetch: implement cache strategies based on request type
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // API calls (including /api/): network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets (JS, CSS, images, fonts): cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML pages: network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // Default: network-first
  event.respondWith(networkFirst(request));
});

// Strategy: Cache-first (check cache first, fall back to network)
function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) {
      return cached;
    }
    return fetch(request).then((response) => {
      if (response && response.status === 200 && request.method === 'GET') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, clone);
        });
      }
      return response;
    }).catch(() => {
      return new Response('Not found', { status: 404 });
    });
  });
}

// Strategy: Network-first (try network, fall back to cache)
function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      if (response && response.status === 200 && request.method === 'GET') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, clone);
        });
      }
      return response;
    })
    .catch(() => {
      return caches.match(request) || new Response('Offline', { status: 503 });
    });
}

// Strategy: Network-first for HTML with offline fallback
function networkFirstWithFallback(request) {
  return fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, clone);
        });
      }
      return response;
    })
    .catch(() => {
      return caches.match(request) || caches.match('/') || new Response('Offline', { status: 503 });
    });
}

// Helper: determine if a path is a static asset
function isStaticAsset(pathname) {
  return pathname.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i) ||
         pathname.startsWith('/_next/') ||
         pathname.startsWith('/icons/') ||
         pathname.startsWith('/fonts/');
}
