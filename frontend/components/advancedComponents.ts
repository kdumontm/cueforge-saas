/**
 * Advanced Components — Lazy-Loaded Barrel Exports
 *
 * This barrel file provides lazy-loaded exports for all advanced UI components.
 * Components are wrapped with React.lazy() for code splitting and dynamic imports.
 *
 * Example usage:
 * ```typescript
 * import { PlayerAdvanced, StemsAdvanced } from '@/components/advancedComponents';
 * import { Suspense } from 'react';
 *
 * export function App() {
 *   return (
 *     <Suspense fallback={<div>Loading...</div>}>
 *       <PlayerAdvanced />
 *     </Suspense>
 *   );
 * }
 * ```
 */

import { lazyRetry } from '@/lib/lazyRetry';

// Onboarding & Initialization
export const OnboardingWizard = lazyRetry(
  () => import('@/components/onboarding/OnboardingWizard')
);

// Layout & Navigation
export const DashboardLayout = lazyRetry(
  () => import('@/components/layout/DashboardLayout')
);

// Track Management
export const TrackListAdvanced = lazyRetry(
  () => import('@/components/tracks/TrackListAdvanced')
);

// Player & Playback (Points 1451-1510)
export const WaveformAdvanced = lazyRetry(
  () => import('@/components/player/WaveformAdvanced')
);

export const PlayerAdvanced = lazyRetry(
  () => import('@/components/player/PlayerAdvanced')
);

// Stems & Mix Analysis (Points 1511-1560)
export const StemsAdvanced = lazyRetry(
  () => import('@/components/tabs/StemsAdvanced')
);

// Playlist & Mix Builder (Points 1561-1610)
export const PlaylistBuilder = lazyRetry(
  () => import('@/components/playlist/PlaylistBuilder')
);

// Settings & Personalization (Points 1611-1650)
export const SettingsPanel = lazyRetry(
  () => import('@/components/settings/SettingsPanel')
);

// Export all types for component props
export type * from '@/components/onboarding/OnboardingWizard';
export type * from '@/components/layout/DashboardLayout';
export type * from '@/components/tracks/TrackListAdvanced';
export type * from '@/components/player/WaveformAdvanced';
export type * from '@/components/player/PlayerAdvanced';
export type * from '@/components/tabs/StemsAdvanced';
export type * from '@/components/playlist/PlaylistBuilder';
export type * from '@/components/settings/SettingsPanel';
