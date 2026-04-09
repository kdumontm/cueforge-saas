'use client';

import { useRouter } from 'next/navigation';
import { useDashboardContext } from '@/app/dashboard/DashboardContext';
import type { ReactNode } from 'react';

interface FeatureGateProps {
  featureKey: string;
  children: ReactNode;
  /** Si true, redirige vers /dashboard au lieu d'afficher l'overlay */
  redirect?: boolean;
}

/**
 * Bloque l'accès à une section si la feature est désactivée pour le plan de l'utilisateur.
 * - Mode overlay (par défaut) : affiche un écran verrouillé avec CTA upgrade
 * - Mode redirect : renvoie vers /dashboard
 */
export default function FeatureGate({ featureKey, children, redirect }: FeatureGateProps) {
  const { isFeatureEnabled, userPlan, featuresLoaded } = useDashboardContext();
  const router = useRouter();

  // Pas encore chargé → afficher le contenu (éviter flash)
  if (!featuresLoaded) return <>{children}</>;

  const enabled = isFeatureEnabled(featureKey);
  if (enabled) return <>{children}</>;

  // Redirect mode
  if (redirect) {
    router.push('/dashboard');
    return null;
  }

  // Overlay mode
  const upgradePlan = userPlan === 'free' ? 'Pro' : 'Unlimited';

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8 text-center">
      <div className="text-6xl">🔒</div>
      <h2 className="text-lg font-bold text-[var(--text-primary)]">
        Fonctionnalité verrouillée
      </h2>
      <p className="text-sm text-[var(--text-muted)] max-w-md">
        Cette fonctionnalité n'est pas disponible avec ton plan actuel
        (<span className="font-semibold text-[var(--text-secondary)]">{userPlan}</span>).
        Passe au plan <span className="text-amber-400 font-bold">{upgradePlan}</span> pour y accéder.
      </p>
      <a
        href="/billing"
        className="mt-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold hover:opacity-90 transition-opacity no-underline shadow-lg shadow-amber-500/20"
      >
        Voir les plans
      </a>
    </div>
  );
}
