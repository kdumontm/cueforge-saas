/**
 * lazyRetry — wrapper autour de React.lazy() qui :
 *  1. Retente le chargement du chunk jusqu'à 3 fois (avec délai exponentiel)
 *  2. Si tous les retries échouent, force un rechargement complet
 *     (un seul reload par build, pour éviter les boucles infinies)
 *
 * Résout le "Loading chunk XXXX failed" après un redéploiement
 * quand le navigateur a un ancien manifest en cache.
 */
import { lazy, type ComponentType } from 'react';

const RETRY_COUNT = 3;
const SESSION_KEY = 'cueforge_chunk_reload';

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function lazyRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    for (let attempt = 0; attempt < RETRY_COUNT; attempt++) {
      try {
        const module = await importFn();
        // Succès — on nettoie le flag de reload
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(SESSION_KEY);
        }
        return module;
      } catch (error) {
        // Si c'est le dernier retry, on ne ré-essaie plus
        if (attempt === RETRY_COUNT - 1) {
          // Force un hard reload de la page (une seule fois par URL)
          if (typeof window !== 'undefined') {
            const reloadKey = `${SESSION_KEY}_${window.location.pathname}`;
            const lastReload = sessionStorage.getItem(reloadKey);
            const now = Date.now();
            // Autorise un reload si jamais fait OU si le dernier date de plus de 30s
            // (évite la boucle infinie mais permet de re-tenter après un build)
            if (!lastReload || now - parseInt(lastReload) > 30000) {
              sessionStorage.setItem(reloadKey, String(now));
              // Clear service worker caches avant de recharger
              if ('caches' in window) {
                caches.keys().then(names => names.forEach(n => caches.delete(n)));
              }
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
              }
              // Hard reload (bypass bfcache)
              window.location.href = window.location.pathname + '?_cb=' + now;
              // On retourne jamais, mais TS veut un return
              return await new Promise(() => {});
            }
          }
          // Si on a déjà reload récemment, on laisse l'erreur remonter
          throw error;
        }
        // Attente exponentielle : 500ms, 1500ms, 3500ms…
        await wait(500 * Math.pow(2, attempt));
      }
    }
    // Fallback (jamais atteint normalement)
    return await importFn();
  });
}
