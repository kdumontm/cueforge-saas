/**
 * Service Worker (points 671-690)
 * Cache strategies, offline support, SSE reconnection
 */

const CACHE_NAME = 'cueforge-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  // Add critical CSS/JS bundles here
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
    }),
  );
  self.clients.claim();
});

// Fetch event — cache-first for assets, network-first for API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip POST/PUT/DELETE requests and non-GET
  if (event.request.method !== 'GET') {
    return;
  }

  // API calls: network-first with fallback to cache
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clonedResponse);
          });
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            // Return offline placeholder for API calls
            return new Response(JSON.stringify({ offline: true }), {
              headers: { 'Content-Type': 'application/json' },
            });
          });
        }),
    );
    return;
  }

  // Assets: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clonedResponse);
          });
          return response;
        })
      );
    }),
  );
});

// Message event — for SSE reconnection
self.addEventListener('message', (event) => {
  if (event.data.type === 'SSE_RECONNECT') {
    // Notify all clients to reconnect to SSE
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'SSE_RECONNECT',
        });
      });
    });
  }
});
