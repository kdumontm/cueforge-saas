/**
 * ⚡ SWR hooks pour le cache API — élimine les refetchs inutiles
 *
 * Avant: chaque navigation/interaction refaisait un GET /tracks complet.
 * Après: les données sont cachées en mémoire, revalidées en arrière-plan.
 */
import useSWR, { SWRConfiguration } from 'swr';
import { listTracks, getTrack, listPlaylists, getCrateTracks } from './api';

// ── Configuration globale SWR ────────────────────────────────────────────────

export const swrConfig: SWRConfiguration = {
  revalidateOnFocus: true,        // rafraîchit quand on revient sur l'onglet
  focusThrottleInterval: 30000,   // max une revalidation par 30s au focus
  revalidateOnReconnect: true,    // refetch après une coupure réseau
  revalidateIfStale: true,        // revalide si données > dedupingInterval
  dedupingInterval: 2000,         // déduplique les appels identiques sur 2s
  errorRetryCount: 3,
  errorRetryInterval: 1000,
};

// ── Fetchers typés ───────────────────────────────────────────────────────────

type TrackListParams = {
  page?: number;
  limit?: number;
  genre?: string;
  artist?: string;
  bpm_min?: number;
  bpm_max?: number;
  key?: string;
  energy_min?: number;
  energy_max?: number;
  rating_min?: number;
  search?: string;
  sort_by?: string;
  sort_dir?: string;
};

/**
 * Hook pour lister les tracks avec cache SWR.
 * La clé SWR est sérialisée depuis les paramètres → cache par combinaison de filtres.
 */
export function useTracks(params: TrackListParams = {}) {
  const key = ['tracks', JSON.stringify(params)];

  return useSWR(
    key,
    () => listTracks(
      params.page || 1,
      params.limit || 20,
      params.genre,
      params.artist,
      params.bpm_min,
      params.bpm_max,
      params.key,
      params.energy_min,
      params.energy_max,
      params.rating_min,
      params.search,
      params.sort_by,
      params.sort_dir,
    ),
    {
      ...swrConfig,
      keepPreviousData: true, // garde les anciennes données pendant le chargement
    }
  );
}

/**
 * Hook pour un track individuel (détail complet avec waveform etc.)
 */
export function useTrack(trackId: number | null) {
  return useSWR(
    trackId ? ['track', trackId] : null,
    () => trackId ? getTrack(trackId) : null,
    swrConfig,
  );
}

/**
 * Hook pour les playlists
 */
export function usePlaylists() {
  return useSWR('playlists', listPlaylists, swrConfig);
}

/**
 * Hook pour les crates
 */
export function useCrateTracks(crateId: number | null) {
  return useSWR(
    crateId ? ['crate-tracks', crateId] : null,
    () => crateId ? getCrateTracks(crateId) : null,
    swrConfig,
  );
}
