import { useQuery } from '@tanstack/react-query';
import { getCurrentUser, isAuthenticated } from '@/lib/api';

/**
 * Hook React Query pour l'utilisateur courant.
 * Cache le profil utilisateur pendant 5 minutes.
 * Ne fetch que si l'utilisateur est authentifié (token présent).
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: () => getCurrentUser(),
    staleTime: 5 * 60 * 1000,
    enabled: isAuthenticated(),
    retry: false,
  });
}
