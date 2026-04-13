import { useEffect, useState } from 'react';
import { listPlaylists, listSets } from '@/lib/api';
import type { Playlist } from '@/lib/api';

interface InitialLoadData {
  playlists: Playlist[];
  sets: any[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook pour charger les données critiques en parallèle lors du mount initial.
 * Utilise Promise.all pour minimaliser la latence.
 */
export function useInitialLoad(): InitialLoadData {
  const [data, setData] = useState<InitialLoadData>({
    playlists: [],
    sets: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Charger playlists et sets en parallèle
    Promise.all([
      listPlaylists().catch(() => []),
      listSets().catch(() => []),
    ])
      .then(([playlists, sets]) => {
        setData({
          playlists,
          sets,
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        console.error('Error loading initial data:', err);
        setData((prev) => ({
          ...prev,
          loading: false,
          error: 'Failed to load data',
        }));
      });
  }, []);

  return data;
}
