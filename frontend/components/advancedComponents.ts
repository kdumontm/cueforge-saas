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

import { lazy } from 'react';

// Onboarding & Initialization
export const OnboardingWizard = lazy(
  () => import('@/components/onboarding/OnboardingWizard')
);

// Layout & Navigation
export const DashboardLayout = lazy(
  () => import('@/components/layout/DashboardLayout')
);

// Track Management
export const TrackListAdvanced = lazy(
  () => import('@/components/tracks/TrackListAdvanced')
);

// Player & Playback (Points 1451-1510)
export const WaveformAdvanced = lazy(
  () => import('@/components/player/WaveformAdvanced')
);

export const PlayerAdvanced = lazy(
  () => import('@/components/player/PlayerAdvanced')
);

// Stems & Mix Analysis (Points 1511-1560)
export const StemsAdvanced = lazy(
  () => import('@/components/tabs/StemsAdvanced')
);

// Playlist & Mix Builder (Points 1561-1610)
export const PlaylistBuilder = lazy(
  () => import('@/components/playlist/PlaylistBuilder')
);

// Settings & Personalization (Points 1611-1650)
export const SettingsPanel = lazy(
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
