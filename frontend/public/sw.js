/**
 * Service Worker — TrackCue
 * Network-first pour les pages et bundles JS (Next.js change les hashes à chaque build)
 * Cache-first uniquement pour les assets statiques stables (images, fonts, manifest)
 */

const CACHE_NAME = 'trackcue-v2';
const STATIC_ASSETS = [
  '/manifest.json',
];

// Install: précache uniquement le strict minimum
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

// Activate: supprimer TOUS les anciens caches (v1, etc.)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)),
      ),
    ),
  );
  self.clients.claim();
});

// Fetch
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignorer les requêtes non-GET
  if (event.request.method !== 'GET') return;

  // Ignorer les requêtes cross-origin (CDN, analytics, etc.)
  if (url.origin !== self.location.origin) return;

  // API: network-first, fallback cache
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return res;
        })
        .catch(() =>
          caches.match(event.request).then(
            (cached) =>
              cached ||
              new Response(JSON.stringify({ offline: true }), {
                headers: { 'Content-Type': 'application/json' },
              }),
          ),
        ),
    );
    return;
  }

  // Next.js pages et bundles JS/CSS (_next/*): NETWORK-FIRST
  // Les hashes changent à chaque build, donc le cache-first servait du code obsolète
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname === '/' ||
    url.pathname.startsWith('/dashboard') ||
    url.pathname.endsWith('.html')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  // Tout le reste (images, fonts, manifest): cache-first
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return res;
        }),
    ),
  );
});

// Message: SSE reconnection
self.addEventListener('message', (event) => {
  if (event.data.type === 'SSE_RECONNECT') {
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: 'SSE_RECONNECT' });
      });
    });
  }
});
