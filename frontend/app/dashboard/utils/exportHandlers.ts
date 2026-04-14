/**
 * Fonctions d'export pour les tracks (CSV, TXT).
 * Extraites de DashboardV2.tsx pour réduire la taille du composant principal.
 */

import type { Track } from '@/types';

interface CuePoint {
  name?: string;
  cue_type?: string;
  position_ms: number;
  color?: string;
}

/**
 * Export un track au format CSV avec ses cue points.
 * Retourne le Blob CSV prêt à télécharger.
 */
export function generateTrackCSV(track: Track, cuePoints: CuePoint[]): Blob {
  const analysis = (track as any).analysis || {};
  const rows = [
    ['Field', 'Value'],
    ['Title', track.title || track.original_filename || ''],
    ['Artist', track.artist || ''],
    ['BPM', analysis.bpm?.toFixed(2) || ''],
    ['Key', analysis.key || ''],
    ['Energy', analysis.energy != null ? Math.round(analysis.energy * 100) : ''],
    ['Duration (ms)', analysis.duration_ms || ''],
    ['Genre', analysis.genre || ''],
    ['Rating', track.rating || ''],
    ['Tags', track.tags || ''],
    [''],
    ['#', 'Name', 'Type', 'Position (ms)', 'Color'],
    ...cuePoints.map((c, i) => [i + 1, c.name || '', c.cue_type || 'hot_cue', c.position_ms, c.color || '']),
  ];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  return new Blob([csv], { type: 'text/csv' });
}

/**
 * Export un track au format TXT lisible avec ses cue points.
 * Retourne le Blob TXT prêt à télécharger.
 */
export function generateTrackTXT(track: Track, cuePoints: CuePoint[]): Blob {
  const analysis = (track as any).analysis || {};
  const lines = [
    `=== TrackCue — ${track.title || track.original_filename} ===`,
    `Artist : ${track.artist || '—'}`,
    `BPM    : ${analysis.bpm?.toFixed(2) || '—'}`,
    `Key    : ${analysis.key || '—'}`,
    `Energy : ${analysis.energy != null ? Math.round(analysis.energy * 100) + '%' : '—'}`,
    `Genre  : ${analysis.genre || '—'}`,
    `Rating : ${'⭐'.repeat(track.rating || 0)}`,
    `Tags   : ${track.tags || '—'}`,
    '',
    '--- Cue Points ---',
    ...cuePoints.map((c, i) => {
      const ms = c.position_ms;
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      const fmt = `${m}:${String(s).padStart(2, '0')}`;
      return `[${i + 1}] ${c.name || 'Cue'} @ ${fmt} (${c.cue_type || 'hot_cue'})`;
    }),
  ];
  return new Blob([lines.join('\n')], { type: 'text/plain' });
}

/**
 * Déclenche le téléchargement d'un Blob dans le navigateur.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
