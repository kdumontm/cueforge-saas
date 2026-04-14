/**
 * TrackCue — Camelot Wheel compatibility scoring (client-side).
 * Mirrors backend camelot.py logic for instant UI feedback.
 */

const KEY_TO_CAMELOT: Record<string, string> = {
  // Minor (A)
  'Ab minor': '1A', 'G# minor': '1A', 'Abm': '1A', 'G#m': '1A',
  'Eb minor': '2A', 'D# minor': '2A', 'Ebm': '2A', 'D#m': '2A',
  'Bb minor': '3A', 'A# minor': '3A', 'Bbm': '3A', 'A#m': '3A',
  'F minor': '4A', 'Fm': '4A',
  'C minor': '5A', 'Cm': '5A',
  'G minor': '6A', 'Gm': '6A',
  'D minor': '7A', 'Dm': '7A',
  'A minor': '8A', 'Am': '8A',
  'E minor': '9A', 'Em': '9A',
  'B minor': '10A', 'Bm': '10A',
  'F# minor': '11A', 'Gb minor': '11A', 'F#m': '11A', 'Gbm': '11A',
  'Db minor': '12A', 'C# minor': '12A', 'Dbm': '12A', 'C#m': '12A',
  // Major (B)
  'B major': '1B', 'B': '1B',
  'F# major': '2B', 'Gb major': '2B', 'F#': '2B', 'Gb': '2B',
  'Db major': '3B', 'C# major': '3B', 'Db': '3B', 'C#': '3B',
  'Ab major': '4B', 'G# major': '4B', 'Ab': '4B', 'G#': '4B',
  'Eb major': '5B', 'D# major': '5B', 'Eb': '5B', 'D#': '5B',
  'Bb major': '6B', 'A# major': '6B', 'Bb': '6B', 'A#': '6B',
  'F major': '7B', 'F': '7B',
  'C major': '8B', 'C': '8B',
  'G major': '9B', 'G': '9B',
  'D major': '10B', 'D': '10B',
  'A major': '11B', 'A': '11B',
  'E major': '12B', 'E': '12B',
};

const CAMELOT_TO_KEY: Record<string, string> = {
  '1A': 'Abm', '2A': 'Ebm', '3A': 'Bbm', '4A': 'Fm', '5A': 'Cm',
  '6A': 'Gm', '7A': 'Dm', '8A': 'Am', '9A': 'Em', '10A': 'Bm',
  '11A': 'F#m', '12A': 'Dbm',
  '1B': 'B', '2B': 'F#', '3B': 'Db', '4B': 'Ab', '5B': 'Eb',
  '6B': 'Bb', '7B': 'F', '8B': 'C', '9B': 'G', '10B': 'D',
  '11B': 'A', '12B': 'E',
};

export function keyToCamelot(key: string): string | null {
  if (!key) return null;
  const k = key.trim();
  const upper = k.toUpperCase();
  if (CAMELOT_TO_KEY[upper]) return upper;
  return KEY_TO_CAMELOT[k] || null;
}

/**
 * Compatibility score between two keys.
 * 3 = same key, 2 = adjacent/switch, 1 = ±2 or diagonal, 0 = incompatible
 */
export function harmonicScore(key1: string, key2: string): number {
  const c1 = keyToCamelot(key1);
  const c2 = keyToCamelot(key2);
  if (!c1 || !c2) return 0;
  if (c1 === c2) return 3;

  const n1 = parseInt(c1), l1 = c1.slice(-1);
  const n2 = parseInt(c2), l2 = c2.slice(-1);
  const dist = Math.min(Math.abs(n1 - n2), 12 - Math.abs(n1 - n2));

  if (dist === 0 && l1 !== l2) return 2;
  if (dist === 1 && l1 === l2) return 2;
  if (dist === 2 && l1 === l2) return 1;
  if (dist === 1 && l1 !== l2) return 1;
  return 0;
}

/**
 * BPM compatibility (within ±6 BPM, or half/double).
 */
export function bpmCompatible(bpm1: number, bpm2: number, tolerance = 6): boolean {
  if (!bpm1 || !bpm2) return false;
  const diff = Math.abs(bpm1 - bpm2);
  const halfDiff = Math.abs(bpm1 - bpm2 / 2);
  const doubleDiff = Math.abs(bpm1 - bpm2 * 2);
  return diff <= tolerance || halfDiff <= tolerance || doubleDiff <= tolerance;
}

/**
 * Overall mix compatibility score 0-100.
 * Uses harmonic (50%) + BPM (30%) + energy (20%) weighting.
 */
export function mixScore(
  bpm1: number, key1: string, energy1: number,
  bpm2: number, key2: string, energy2: number,
): { score: number; label: string; color: string } {
  const h = harmonicScore(key1, key2);
  const hPct = (h / 3) * 50;

  let bPct = 0;
  if (bpm1 && bpm2) {
    const diff = Math.abs(bpm1 - bpm2);
    if (diff <= 2) bPct = 30;
    else if (diff <= 4) bPct = 25;
    else if (diff <= 6) bPct = 20;
    else if (bpmCompatible(bpm1, bpm2)) bPct = 15;
    else bPct = Math.max(0, 15 - diff);
  }

  let ePct = 10;
  if (energy1 != null && energy2 != null) {
    const eDiff = Math.abs(energy1 - energy2);
    if (eDiff <= 10) ePct = 20;
    else if (eDiff <= 20) ePct = 15;
    else if (eDiff <= 35) ePct = 10;
    else ePct = 5;
  }

  const score = Math.round(hPct + bPct + ePct);

  if (score >= 80) return { score, label: 'Excellent', color: '#22c55e' };
  if (score >= 60) return { score, label: 'Bon', color: '#3b82f6' };
  if (score >= 40) return { score, label: 'Possible', color: '#f59e0b' };
  return { score, label: 'Risqué', color: '#ef4444' };
}
