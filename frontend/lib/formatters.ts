/**
 * Utilitaires de formatage centralisés pour le dashboard TrackCue.
 */

import { keyToCamelot } from '@/lib/camelot';

export function toCamelot(key: string | null | undefined): string | null {
  if (!key) return null;
  return keyToCamelot(key) || key;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds) || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function energyColor(energy: number | null | undefined): string {
  if (energy == null) return 'rgb(107,114,128)';
  if (energy < 0.25) return 'rgb(34,197,94)';
  if (energy < 0.5)  return 'rgb(234,179,8)';
  if (energy < 0.75) return 'rgb(249,115,22)';
  return 'rgb(239,68,68)';
}

export function energyRating(energy: number | null | undefined): string {
  if (energy == null) return '—';
  return String(Math.min(10, Math.max(1, Math.round(energy * 10))));
}

export function energyLabel(energy: number | null | undefined): string {
  if (energy == null) return 'N/A';
  if (energy < 0.25) return 'Calm';
  if (energy < 0.5)  return 'Moderate';
  if (energy < 0.75) return 'Energetic';
  return 'Intense';
}
