// @ts-nocheck
/**
 * Utility functions pour le dashboard DJ.
 * Extraites de useDashboard.ts pour réduire la taille du hook principal.
 */

import { keyToCamelot, bpmCompatible } from '@/lib/camelot';
import { getCompatibleKeys } from '@/lib/constants';

export function toCamelot(key: string | null | undefined): string {
  if (!key) return '—';
  return keyToCamelot(key) || key;
}

export function isMixCompatible(trackA: any, trackB: any): boolean {
  if (!trackA || !trackB || !trackA.analysis || !trackB.analysis) return false;
  const bpmA = trackA.analysis.bpm;
  const bpmB = trackB.analysis.bpm;
  if (!bpmA || !bpmB) return false;
  if (!bpmCompatible(bpmA, bpmB)) return false;
  const keyA = toCamelot(trackA.analysis.key);
  const keyB = toCamelot(trackB.analysis.key);
  if (keyA === '—' || keyB === '—') return true;
  return getCompatibleKeys(keyA).includes(keyB);
}

export function msToTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function generateCuePointsFromAnalysis(analysis: any): Array<{label: string; position: number; color: string}> {
  const SECTION_COLORS: Record<string, string> = {
    INTRO: '#ef4444', DROP: '#f97316', PHRASE: '#22c55e',
    OUTRO: '#f472b6', BUILDUP: '#eab308', BREAKDOWN: '#8b5cf6',
    VERSE: '#06b6d4', CHORUS: '#ec4899', BRIDGE: '#a855f7'
  };
  const cues: Array<{label: string; position: number; color: string}> = [];
  if (analysis?.sections?.length > 0) {
    const labelCounts: Record<string, number> = {};
    analysis.sections.forEach((sec: any) => {
      const baseLabel = (sec.label || 'CUE').toUpperCase();
      labelCounts[baseLabel] = (labelCounts[baseLabel] || 0) + 1;
      const count = labelCounts[baseLabel];
      const label = count > 1 ? baseLabel + ' ' + count : baseLabel;
      cues.push({
        label,
        position: sec.start,
        color: SECTION_COLORS[baseLabel] || '#6b7280'
      });
    });
  } else if (analysis?.drop_positions?.length > 0) {
    analysis.drop_positions.forEach((ms: number, i: number) => {
      cues.push({
        label: 'DROP ' + (i + 1),
        position: ms / 1000,
        color: '#f97316'
      });
    });
  }
  return cues;
}

export function energyToRating(energy: number | null | undefined): string {
  if (energy == null) return '\u2014';
  return String(Math.min(10, Math.max(1, Math.round(energy * 10))));
}

export function energyToLabel(energy: number | null | undefined): string {
  if (energy == null) return 'N/A';
  if (energy < 0.25) return 'Calm';
  if (energy < 0.5) return 'Moderate';
  if (energy < 0.75) return 'Energetic';
  return 'Intense';
}

export function energyToColor(energy: number | null | undefined): string {
  if (energy == null) return 'rgb(107,114,128)';
  if (energy < 0.25) return 'rgb(34,197,94)';
  if (energy < 0.5) return 'rgb(234,179,8)';
  if (energy < 0.75) return 'rgb(249,115,22)';
  return 'rgb(239,68,68)';
}

export function keyCamelot(key: string): string {
  return keyToCamelot(key) || '';
}

export function mixScore(key1: string, bpm1: number, key2: string, bpm2: number) {
  const bpmDiff = Math.abs(bpm1 - bpm2);
  let bpmS = bpmDiff <= 0.5 ? 50 : bpmDiff <= 2 ? 45 : bpmDiff <= 5 ? 35 : Math.max(0, 25 - bpmDiff);
  const c1 = keyToCamelot(key1) || '', c2 = keyToCamelot(key2) || '';
  let keyS = 25;
  if (c1 && c2) {
    if (c1 === c2) keyS = 50;
    else {
      const n1 = parseInt(c1), l1 = c1.slice(-1), n2 = parseInt(c2), l2 = c2.slice(-1);
      if (l1 === l2) { const d = Math.min(Math.abs(n1 - n2), 12 - Math.abs(n1 - n2)); keyS = d === 1 ? 45 : d === 2 ? 30 : 15; }
      else if (n1 === n2) keyS = 40;
      else keyS = 15;
    }
  }
  const total = bpmS + keyS;
  return { total, verdict: total >= 90 ? 'Perfect' : total >= 75 ? 'Great' : total >= 60 ? 'Good' : total >= 40 ? 'OK' : 'Risky' };
}

export async function filterBand(buf: AudioBuffer, type: BiquadFilterType, freq: number, freq2?: number): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, buf.length, buf.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (freq2) {
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = freq; hp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq2; lp.Q.value = 0.7;
    src.connect(hp).connect(lp).connect(ctx.destination);
  } else {
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.7;
    src.connect(f).connect(ctx.destination);
  }
  src.start(0);
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

export async function computeRGBWaveform(buf: AudioBuffer, numBars = 1200): Promise<{r:number,g:number,b:number}[]> {
  const [lowBand, midBand, highBand] = await Promise.all([
    filterBand(buf, 'lowpass', 200),
    filterBand(buf, 'bandpass', 200, 4000),
    filterBand(buf, 'highpass', 4000),
  ]);
  const segLen = Math.floor(buf.length / numBars);
  const rawColors: {lo:number,mi:number,hi:number}[] = [];
  let maxLo = 0, maxMi = 0, maxHi = 0;
  for (let i = 0; i < numBars; i++) {
    const s = i * segLen, e = Math.min(s + segLen, buf.length);
    let le = 0, me = 0, he = 0;
    for (let j = s; j < e; j++) { le += lowBand[j]*lowBand[j]; me += midBand[j]*midBand[j]; he += highBand[j]*highBand[j]; }
    const n = e - s || 1;
    le = Math.sqrt(le/n); me = Math.sqrt(me/n); he = Math.sqrt(he/n);
    maxLo = Math.max(maxLo, le); maxMi = Math.max(maxMi, me); maxHi = Math.max(maxHi, he);
    rawColors.push({ lo: le, mi: me, hi: he });
  }
  return rawColors.map(c => {
    const lo = c.lo / (maxLo || 1);
    const mi = c.mi / (maxMi || 1);
    const hi = c.hi / (maxHi || 1);
    const r = Math.min(255, Math.floor(lo * 220 + mi * 60));
    const g = Math.min(255, Math.floor(mi * 200 + hi * 50 + lo * 25));
    const b = Math.min(255, Math.floor(hi * 240 + mi * 30));
    return { r: Math.max(25, r), g: Math.max(15, g), b: Math.max(35, b) };
  });
}
