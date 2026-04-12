import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listTracks, deleteTrack, updateTrack, batchDeleteTracks } from '@/lib/api';

/**
 * Hook React Query pour la liste des tracks.
 * Remplace le fetch manuel dans DashboardV2 avec :
 * - Cache automatique (staleTime 2min)
 * - Deduplication des requêtes concurrentes
 * - Revalidation en background au focus
 */
export function useTracks() {
  return useQuery({
    queryKey: ['tracks'],
    queryFn: () => listTracks(),
    staleTime: 2 * 60 * 1000,
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
