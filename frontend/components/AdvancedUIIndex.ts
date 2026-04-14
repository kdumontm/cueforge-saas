/**
 * TrackCue Advanced UI/UX Components
 * Section E: Points 1451-1650
 *
 * This file is the primary export index for all advanced components.
 * It re-exports from advancedComponents.ts (lazy-loaded barrel file).
 *
 * Use with: import { PlayerAdvanced, StemsAdvanced, ... } from '@/components/AdvancedUIIndex'
 * Or: import { PlayerAdvanced, StemsAdvanced, ... } from '@/components/advancedComponents'
 */

// Re-export all lazy-loaded components from the main barrel file
export {
  OnboardingWizard,
  DashboardLayout,
  TrackListAdvanced,
  WaveformAdvanced,
  PlayerAdvanced,
  StemsAdvanced,
  PlaylistBuilder,
  SettingsPanel,
  type OnboardingWizardProps,
  type DashboardLayoutProps,
  type TrackListAdvancedProps,
  type WaveformAdvancedProps,
  type PlayerAdvancedProps,
  type StemsAdvancedProps,
  type PlaylistBuilderProps,
  type SettingsPanelProps,
} from '@/components/advancedComponents';

// Shared UI Component
export { Slider } from '@/components/ui/Slider';
