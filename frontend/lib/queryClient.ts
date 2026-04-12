import { QueryClient } from '@tanstack/react-query';

/**
 * QueryClient global — utilisé par le QueryProvider dans ClientProviders.
 *
 * Configuration optimisée pour CueForge :
 * - staleTime 2min : les données restent "fraîches" 2 min (évite les re-fetch inutiles)
 * - gcTime 10min : le cache est gardé 10 min après inutilisation
 * - retry 1 : une seule tentative de retry (les erreurs 4xx ne méritent pas 3 retries)
 * - refetchOnWindowFocus : revalidation quand le DJ revient sur l'onglet
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2 * 60 * 1000,     // 2 minutes
        gcTime: 10 * 60 * 1000,        // 10 minutes (garbage collection)
        retry: 1,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

// Singleton côté client
let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === 'undefined') {
    // SSR : toujours créer un nouveau client
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
