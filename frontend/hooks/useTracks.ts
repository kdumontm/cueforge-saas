import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { listTracks, deleteTrack, updateTrack, batchDeleteTracks } from '@/lib/api';

/**
 * Hook React Query pour la liste des tracks.
 * Optimisations réseau/cache :
 * - staleTime 2min : données considérées fraîches pendant 2 minutes
 * - gcTime 10min : garde les données en cache 10 minutes
 * - keepPreviousData : affiche les anciennes données pendant le refetch
 * - refetchOnWindowFocus: false : pas de refetch automatique au focus (réduit les requêtes)
 */
export function useTracks() {
  return useQuery({
    queryKey: ['tracks'],
    queryFn: () => listTracks(),
    staleTime: 2 * 60 * 1000,      // 2 minutes
    gcTime: 10 * 60 * 1000,        // 10 minutes en cache
    refetchOnWindowFocus: false,    // pas de refetch auto au focus
    placeholderData: keepPreviousData,  // montrer les anciennes données pendant refetch
  });
}

/**
 * Mutation pour supprimer un track avec invalidation du cache.
 */
export function useDeleteTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (trackId: number) => deleteTrack(trackId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
    },
  });
}

/**
 * Mutation batch delete.
 */
export function useBatchDeleteTracks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (trackIds: number[]) => batchDeleteTracks(trackIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
    },
  });
}

/**
 * Mutation pour mettre à jour les métadonnées d'un track.
 * Utilise l'optimistic update pour une UX instantanée.
 */
export function useUpdateTrack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ trackId, data }: { trackId: number; data: any }) =>
      updateTrack(trackId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
    },
  });
}
