/**
 * Service Worker — TrackCue
 * Network-first pour les pages et bundles JS (Next.js change les hashes à chaque build)
 * Cache-first uniquement pour les assets statiques stables (images, fonts, manifest)
 */

const CACHE_NAME = 'trackcue-v4';
const SWR_CACHE_NAME = 'trackcue-swr-v1';
const STATIC_ASSETS = [
  '/manifest.json',
];

// PERF #2.3: endpoints GET idempotents servis en stale-while-revalidate.
// Ces réponses changent peu (stats, auth/me, tags) — on sert immédiatement la copie
// cachée puis on rafraîchit en arrière-plan pour la prochaine requête.
const SWR_PATH_PATTERNS = [
  /\/api\/v1\/stats\/overview(\?|$)/,
  /\/api\/v1\/auth\/me(\?|$)/,
  /\/api\/v1\/tags(\?|$)/,
  /\/api\/v1\/stats\/genres(\?|$)/,
  /\/api\/v1\/stats\/keys(\?|$)/,
];

// Install: précache uniquement le strict minimum
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

// Activate: supprimer TOUS les anciens caches (v1, etc.) sauf le SWR courant.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== CACHE_NAME && n !== SWR_CACHE_NAME)
          .map((n) => caches.delete(n)),
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

  // PERF #2.3: API GET idempotents → stale-while-revalidate.
  // On sert IMMÉDIATEMENT la réponse cachée (si dispo) et on rafraîchit en arrière-plan.
  // Bénéfice : dashboard/library instant perçu, dernière version dispo au prochain clic.
  if (url.pathname.includes('/api/v1/')) {
    const isSWR = SWR_PATH_PATTERNS.some((rx) => rx.test(url.pathname + url.search));
    if (isSWR) {
      event.respondWith(
        caches.open(SWR_CACHE_NAME).then(async (cache) => {
          const cached = await cache.match(event.request);
          const networkFetch = fetch(event.request)
            .then((res) => {
              // Ne cache que les 200 OK (pas de 401/403/500)
              if (res && res.status === 200) {
                cache.put(event.request, res.clone());
              }
              return res;
            })
            .catch(() => cached); // offline → on reste sur cached si existe
          return cached || networkFetch;
        }),
      );
      return;
    }

    // Autres endpoints API: network-first, fallback cache
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

  // Next.js pages/bundles ET toutes les routes HTML : NETWORK-FIRST
  // Les hashes Next.js changent à chaque build + le design des pages évolue.
  // Servir du cache-first sur /login /register /pricing servait les anciennes versions
  // jusqu'à expiration manuelle du SW chez l'utilisateur.
  // Règle: tout ce qui n'est PAS un asset statique image/font/manifest → network-first.
  const isStaticAsset =
    /\.(png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|otf)$/i.test(url.pathname) ||
    url.pathname === '/manifest.json' ||
    url.pathname.startsWith('/icons/');

  if (!isStaticAsset) {
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
