/**
 * Service Worker — TrackCue
 * Network-first pour les pages et bundles JS (Next.js change les hashes à chaque build)
 * Cache-first uniquement pour les assets statiques stables (images, fonts, manifest)
 */

// 🔴 2026-04-23 : bump v4 → v5 pour purger les anciennes pages /login, /register, /dashboard…
//   cachées avant la migration v4. Certains users (ex: Kevin) avaient encore la version
//   Next.js pré-migration servie depuis le cache du SW alors que le serveur renvoie bien
//   la version v4. Un bump de CACHE_NAME + le activate handler supprimant les anciens
//   caches suffit à forcer l'invalidation au prochain pageview.
// 🔴 2026-04-27 : bump v6 → v7 pour purger l'ancienne version de admin.html, analyze.html,
//   shared.js et shared.css après la grosse session de fixes (Dev FF/GG/HH + manager).
//   Kevin disait "je vois pas les modifs" → SW servait encore les versions du 23/04.
const CACHE_NAME = 'trackcue-v29';
const SWR_CACHE_NAME = 'trackcue-swr-v4';
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
    // BUG FIX 2026-04-23 : ne cacher QUE les 200 OK (pas 502/500/403/401)
    // Sinon quand le backend retourne 502 pendant un rebuild Railway, le SW
    // cache ce 502 et continue de le servir APRÈS que le backend est revenu.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
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
    // BUG FIX 2026-04-23 : ne cacher QUE les 200 OK (pas d'erreurs)
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
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
