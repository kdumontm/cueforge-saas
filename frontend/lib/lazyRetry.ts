/**
 * lazyRetry — wrapper autour de React.lazy() qui :
 *  1. Retente le chargement du chunk jusqu'à 3 fois (avec délai exponentiel)
 *  2. Si tous les retries échouent, force un rechargement de la page
 *     (un seul reload, pour éviter les boucles infinies)
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
          // Force un reload de la page (une seule fois)
          if (typeof window !== 'undefined') {
            const alreadyReloaded = sessionStorage.getItem(SESSION_KEY);
            if (!alreadyReloaded) {
              sessionStorage.setItem(SESSION_KEY, '1');
              window.location.reload();
              // On retourne jamais, mais TS veut un return
              return await new Promise(() => {});
            }
          }
          // Si on a déjà reload, on laisse l'erreur remonter
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
