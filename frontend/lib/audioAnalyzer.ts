// ─── CueForge Audio Analyzer v2.0 — Beat-Grid Aware ─────────────────────────
// Analyse audio 100% locale (Web Audio API + algorithmes JS)
// Tourne dans le navigateur/Electron — utilise le CPU de l'utilisateur
//
// v2.0: Génère un beat grid complet + sections + drops + phrases
// pour que le backend cue_generator.py puisse snapper sur les mesures.
//
// Utilisé uniquement quand isDesktopApp() === true.

'use strict';

// ── Profils Krumhansl-Kessler pour la détection de tonalité ─────────────────

const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// ── Types ────────────────────────────────────────────────────────────────────

export interface AnalysisResult {
  bpm: number;
  key_name: string;
  energy: number;
  duration_ms: number;
  cue_points: CuePointResult[];
  // v2.0: données structurelles pour le backend cue_generator
  beat_positions: number[];    // ms — chaque beat (noire)
  drop_positions: number[];    // ms — positions de drops détectés
  phrase_positions: number[];  // ms — limites de phrases (8/16 bars)
  section_labels: SectionLabel[];
}

export interface CuePointResult {
  time: number;      // seconds
  name: string;
  color: string;
  cue_type?: string;
  confidence?: number;
}

export interface SectionLabel {
  time_ms: number;
  label: string;
  energy: number;
  duration_ms: number;
}

// ── FFT Radix-2 Cooley-Tukey (in-place, O(N log N)) ─────────────────────────

function fft(re: Float32Array, im: Float32Array): void {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len >> 1; j++) {
        const ur = re[i + j], ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

// ── BPM Detection (amélioré — autocorrélation + histogramme) ────────────────

function detectBPM(samples: Float32Array, sr: number): number {
  const winSize = Math.floor(sr * 0.023); // ~512 samples @22050
  const hopSize = Math.floor(winSize / 2);
  const energies: number[] = [];

  for (let i = 0; i + winSize < samples.length; i += hopSize) {
    let e = 0;
    for (let j = 0; j < winSize; j++) e += samples[i + j] ** 2;
    energies.push(Math.sqrt(e / winSize));
  }

  // Onset detection (energy flux positif)
  const onsets: number[] = [];
  for (let i = 2; i < energies.length - 2; i++) {
    const diff = energies[i] - energies[i - 1];
    const avg = (energies[i - 2] + energies[i - 1] + energies[i]) / 3;
    if (diff > 0 && diff > avg * 0.12 && energies[i] > 0.003) {
      onsets.push(i * hopSize / sr);
    }
  }

  if (onsets.length < 8) return 120;

  // Histogram via intervalles inter-onsets (avec harmoniques)
  // v3.0: étendu à 60-220 BPM pour supporter techno/hardcore/D&B
  const histSize = 161; // 60-220 BPM
  const hist = new Float32Array(histSize);
  for (let i = 1; i < Math.min(onsets.length, 400); i++) {
    const interval = onsets[i] - onsets[i - 1];
    if (interval < 0.01) continue;
    for (let mult = 1; mult <= 4; mult++) {
      const bpm = 60 / (interval * mult);
      const idx = Math.round(bpm) - 60;
      if (idx >= 0 && idx < histSize) hist[idx] += 1 / mult;
    }
  }

  // Lissage + peak (plage DJ étendue: 70-210 BPM)
  // v3.0: couverture complète pour techno (145-160), D&B (170-180), hardcore (160-200+)
  let maxVal = 0, maxIdx = 60;
  for (let i = 10; i <= 150; i++) { // indices 10-150 → BPM 70-210
    const v = (hist[Math.max(0, i - 1)] + hist[i] * 2 + hist[Math.min(histSize - 1, i + 1)]) / 4;
    if (v > maxVal) { maxVal = v; maxIdx = i; }
  }

  // Affinage ±0.5 BPM par corrélation croisée
  const rawBPM = maxIdx + 60;
  let bestBPM = rawBPM;
  let bestCorr = -1;

  // v3.0: tester aussi le double-time si rawBPM < 100 (détection half-time fréquente)
  const candidates = [rawBPM];
  if (rawBPM < 100 && rawBPM * 2 <= 210) candidates.push(rawBPM * 2);
  if (rawBPM > 160 && rawBPM / 2 >= 70) candidates.push(rawBPM / 2);

  for (const candidate of candidates) {
    for (let trial = candidate - 0.5; trial <= candidate + 0.5; trial += 0.1) {
      const beatInterval = 60 / trial;
      let corr = 0;
      for (const onset of onsets) {
        const nearestBeat = Math.round(onset / beatInterval) * beatInterval;
        const dist = Math.abs(onset - nearestBeat);
        if (dist < beatInterval * 0.15) corr += 1;
      }
      if (corr > bestCorr) { bestCorr = corr; bestBPM = trial; }
    }
  }

  return Math.round(bestBPM * 10) / 10;
}

// ── Trouver le premier downbeat (phase de la grille) ────────────────────────

function findFirstDownbeat(samples: Float32Array, sr: number, bpm: number): number {
  const beatDuration = 60 / bpm; // en secondes
  const barDuration = beatDuration * 4;
  const searchLen = Math.min(samples.length / sr, 16 * barDuration); // 16 mesures max

  // Calculer l'énergie par fenêtre d'un beat
  const beatSamples = Math.floor(beatDuration * sr);
  const hopSamples = Math.floor(beatSamples / 4); // résolution 1/4 de beat
  const energyProfile: { time: number; energy: number }[] = [];

  for (let i = 0; i + beatSamples < Math.min(samples.length, Math.floor(searchLen * sr)); i += hopSamples) {
    let e = 0;
    for (let j = 0; j < beatSamples; j++) e += samples[i + j] ** 2;
    energyProfile.push({ time: i / sr, energy: Math.sqrt(e / beatSamples) });
  }

  if (energyProfile.length < 4) return 0;

  // Trouver le premier onset significatif (début de l'énergie)
  const maxE = Math.max(...energyProfile.map(e => e.energy));
  const threshold = maxE * 0.1;

  let firstOnset = 0;
  for (const ep of energyProfile) {
    if (ep.energy > threshold) {
      firstOnset = ep.time;
      break;
    }
  }

  // Tester différentes phases pour trouver celle qui maximise l'énergie sur les downbeats
  let bestPhase = firstOnset;
  let bestScore = -1;
  const phaseCandidates = 32; // tester 32 offsets

  for (let p = 0; p < phaseCandidates; p++) {
    const phase = firstOnset + (p / phaseCandidates) * beatDuration;
    let score = 0;
    // Vérifier si les downbeats (1er temps de chaque mesure) tombent sur des pics d'énergie
    for (let bar = 0; bar < 8; bar++) {
      const downbeatTime = phase + bar * barDuration;
      // Trouver l'énergie la plus proche
      let closestEnergy = 0;
      for (const ep of energyProfile) {
        if (Math.abs(ep.time - downbeatTime) < beatDuration * 0.25) {
          closestEnergy = Math.max(closestEnergy, ep.energy);
        }
      }
      score += closestEnergy;
    }
    if (score > bestScore) {
      bestScore = score;
      bestPhase = phase;
    }
  }

  return bestPhase;
}

// ── Générer la grille de beats complète ─────────────────────────────────────

function generateBeatGrid(bpm: number, durationSec: number, firstDownbeat: number): number[] {
  const beatDuration = 60 / bpm; // secondes
  const beats: number[] = [];

  // Remonter avant le premier downbeat si nécessaire
  let startBeat = firstDownbeat;
  while (startBeat - beatDuration >= 0) {
    startBeat -= beatDuration;
  }

  // Générer tous les beats
  for (let t = startBeat; t < durationSec; t += beatDuration) {
    if (t >= 0) {
      beats.push(Math.round(t * 1000)); // convertir en ms
    }
  }

  return beats;
}

// ── Profil d'énergie par mesure (4 beats = 1 bar) ──────────────────────────

interface BarEnergy {
  barIndex: number;
  startMs: number;
  energy: number;       // RMS normalisé
  lowEnergy: number;    // énergie basses fréquences (< 200 Hz)
  highEnergy: number;   // énergie hautes fréquences (> 4 kHz)
}

function computeBarEnergyProfile(
  samples: Float32Array, sr: number, bpm: number, beats: number[]
): BarEnergy[] {
  const barDurationMs = (60000 / bpm) * 4;
  const bars: BarEnergy[] = [];
  const fftSize = 2048;
  const hann = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / fftSize));
  const freqPerBin = sr / fftSize;

  // Regrouper les beats par mesure (4 beats = 1 bar)
  for (let barIdx = 0; barIdx < Math.floor(beats.length / 4); barIdx++) {
    const barStartMs = beats[barIdx * 4];
    const barStartSample = Math.floor((barStartMs / 1000) * sr);
    const barEndSample = Math.min(
      barStartSample + Math.floor((barDurationMs / 1000) * sr),
      samples.length
    );

    if (barEndSample - barStartSample < 100) continue;

    // RMS global de la mesure
    let rmsSum = 0;
    const len = barEndSample - barStartSample;
    for (let j = barStartSample; j < barEndSample; j++) {
      rmsSum += samples[j] ** 2;
    }
    const rms = Math.sqrt(rmsSum / len);

    // Analyse spectrale pour basses/aigues
    let lowE = 0, highE = 0;
    const midSample = Math.floor((barStartSample + barEndSample) / 2) - fftSize / 2;
    if (midSample >= 0 && midSample + fftSize < samples.length) {
      const re = new Float32Array(fftSize);
      const im = new Float32Array(fftSize);
      for (let i = 0; i < fftSize; i++) re[i] = samples[midSample + i] * hann[i];
      fft(re, im);

      for (let bin = 1; bin < fftSize / 2; bin++) {
        const freq = bin * freqPerBin;
        const mag = Math.sqrt(re[bin] ** 2 + im[bin] ** 2);
        if (freq < 200) lowE += mag;
        else if (freq > 4000) highE += mag;
      }
    }

    bars.push({
      barIndex: barIdx,
      startMs: barStartMs,
      energy: rms,
      lowEnergy: lowE,
      highEnergy: highE,
    });
  }

  // Normaliser
  if (bars.length > 0) {
    const maxRMS = Math.max(...bars.map(b => b.energy), 0.001);
    const maxLow = Math.max(...bars.map(b => b.lowEnergy), 0.001);
    const maxHigh = Math.max(...bars.map(b => b.highEnergy), 0.001);
    for (const b of bars) {
      b.energy = b.energy / maxRMS;
      b.lowEnergy = b.lowEnergy / maxLow;
      b.highEnergy = b.highEnergy / maxHigh;
    }
  }

  return bars;
}

// ── Détection des drops (montées d'énergie significatives) ──────────────────

function detectDrops(bars: BarEnergy[], bpm: number): number[] {
  if (bars.length < 8) return [];

  const drops: { ms: number; score: number }[] = [];
  const barDurMs = (60000 / bpm) * 4;
  const minGapBars = 16; // minimum 16 mesures entre 2 drops

  // Lissage de l'énergie sur 4 mesures
  const smoothed: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - 1); j <= Math.min(bars.length - 1, i + 2); j++) {
      sum += bars[j].energy;
      count++;
    }
    smoothed.push(sum / count);
  }

  // Chercher les montées d'énergie significatives
  for (let i = 4; i < smoothed.length - 2; i++) {
    // Énergie moyenne des 4 mesures avant vs 4 mesures après
    const before = smoothed.slice(Math.max(0, i - 4), i).reduce((a, b) => a + b, 0) / 4;
    const after = smoothed.slice(i, Math.min(smoothed.length, i + 4)).reduce((a, b) => a + b, 0) /
      Math.min(4, smoothed.length - i);
    const contrast = after - before;

    // Le drop doit être une montée significative d'énergie
    // ET l'énergie après doit être élevée (> 0.6)
    if (contrast > 0.15 && after > 0.55) {
      // Bonus si les basses montent aussi
      const bassContrast = bars[i].lowEnergy - (i > 0 ? bars[i - 1].lowEnergy : 0);
      const score = contrast * 0.6 + after * 0.25 + Math.max(0, bassContrast) * 0.15;
      drops.push({ ms: bars[i].startMs, score });
    }
  }

  // Trier par score et filtrer minimum gap
  drops.sort((a, b) => b.score - a.score);
  const filtered: number[] = [];
  for (const d of drops) {
    const tooClose = filtered.some(f => Math.abs(f - d.ms) < minGapBars * barDurMs);
    if (!tooClose) filtered.push(d.ms);
    if (filtered.length >= 4) break; // max 4 drops
  }

  return filtered.sort((a, b) => a - b);
}

// ── Détection des phrases (limites de 8 et 16 mesures) ──────────────────────

function detectPhrases(bars: BarEnergy[], bpm: number): number[] {
  if (bars.length < 8) return [];

  const phrases: { ms: number; score: number }[] = [];

  // Vérifier chaque limite de 8 mesures
  for (let i = 8; i < bars.length - 4; i += 4) {
    // Comparer l'énergie des 4 mesures avant vs 4 mesures après cette limite
    const before = bars.slice(Math.max(0, i - 4), i);
    const after = bars.slice(i, Math.min(bars.length, i + 4));

    const avgBefore = before.reduce((s, b) => s + b.energy, 0) / before.length;
    const avgAfter = after.reduce((s, b) => s + b.energy, 0) / after.length;
    const contrast = Math.abs(avgAfter - avgBefore);

    // Bonus si c'est une limite de 16 mesures (plus structurellement significatif)
    const is16bar = (i % 16) === 0;
    const structBonus = is16bar ? 0.2 : 0;

    // Bonus spectral : changement de timbre (basses ou aigus)
    const avgLowBefore = before.reduce((s, b) => s + b.lowEnergy, 0) / before.length;
    const avgLowAfter = after.reduce((s, b) => s + b.lowEnergy, 0) / after.length;
    const spectralContrast = Math.abs(avgLowAfter - avgLowBefore);

    const score = contrast * 0.5 + spectralContrast * 0.2 + structBonus + (avgAfter > 0.5 ? 0.1 : 0);

    if (score > 0.1) {
      phrases.push({ ms: bars[i].startMs, score });
    }
  }

  // Garder les meilleures (minimum gap de 4 mesures)
  phrases.sort((a, b) => b.score - a.score);
  const barDurMs = (60000 / bpm) * 4;
  const filtered: number[] = [];
  for (const p of phrases) {
    const tooClose = filtered.some(f => Math.abs(f - p.ms) < barDurMs * 6);
    if (!tooClose) filtered.push(p.ms);
    if (filtered.length >= 12) break;
  }

  return filtered.sort((a, b) => a - b);
}

// ── Détection des sections (INTRO, BUILD, DROP, BREAKDOWN, OUTRO) ───────────

function detectSections(
  bars: BarEnergy[], bpm: number, durationMs: number, drops: number[]
): SectionLabel[] {
  if (bars.length < 4) return [];

  const sections: SectionLabel[] = [];
  const barDurMs = (60000 / bpm) * 4;

  // ── INTRO: du début jusqu'à ce que l'énergie dépasse 0.4
  let introEndBar = 0;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].energy > 0.4 && bars[i].lowEnergy > 0.3) {
      // Snapper à la mesure de 4 bars la plus proche
      introEndBar = Math.max(4, Math.floor(i / 4) * 4);
      break;
    }
  }
  if (introEndBar === 0) introEndBar = Math.min(16, Math.floor(bars.length * 0.1));

  sections.push({
    time_ms: 0,
    label: 'INTRO',
    energy: bars.slice(0, introEndBar).reduce((s, b) => s + b.energy, 0) / Math.max(1, introEndBar),
    duration_ms: introEndBar * barDurMs,
  });

  // ── Sections autour des drops
  for (let di = 0; di < drops.length; di++) {
    const dropMs = drops[di];
    const dropBarIdx = bars.findIndex(b => Math.abs(b.startMs - dropMs) < barDurMs);
    if (dropBarIdx < 0) continue;

    // BUILD: 8-16 mesures avant le drop — énergie croissante
    const buildStartBar = Math.max(introEndBar, dropBarIdx - 16);
    const buildEndBar = dropBarIdx;
    if (buildEndBar > buildStartBar + 2) {
      const buildBars = bars.slice(buildStartBar, buildEndBar);
      const avgE = buildBars.reduce((s, b) => s + b.energy, 0) / buildBars.length;
      // Vérifier que c'est réellement une montée
      const firstHalf = buildBars.slice(0, Math.floor(buildBars.length / 2));
      const secondHalf = buildBars.slice(Math.floor(buildBars.length / 2));
      const avgFirst = firstHalf.reduce((s, b) => s + b.energy, 0) / Math.max(1, firstHalf.length);
      const avgSecond = secondHalf.reduce((s, b) => s + b.energy, 0) / Math.max(1, secondHalf.length);

      if (avgSecond > avgFirst || avgE > 0.3) {
        sections.push({
          time_ms: bars[buildStartBar].startMs,
          label: 'BUILD',
          energy: avgE,
          duration_ms: (buildEndBar - buildStartBar) * barDurMs,
        });
      }
    }

    // DROP
    const dropEndBar = Math.min(bars.length, dropBarIdx + 16);
    const dropBars = bars.slice(dropBarIdx, dropEndBar);
    sections.push({
      time_ms: dropMs,
      label: 'DROP',
      energy: dropBars.reduce((s, b) => s + b.energy, 0) / Math.max(1, dropBars.length),
      duration_ms: (dropEndBar - dropBarIdx) * barDurMs,
    });

    // BREAKDOWN: après le drop, chercher la vallée d'énergie
    const searchStart = dropEndBar;
    const searchEnd = Math.min(bars.length, searchStart + 32);
    let lowestE = 1.0, lowestBar = -1;
    for (let i = searchStart; i < searchEnd; i++) {
      if (bars[i].energy < lowestE) {
        lowestE = bars[i].energy;
        lowestBar = i;
      }
    }
    if (lowestBar > 0 && lowestE < 0.5) {
      // Trouver le début réel du breakdown (où l'énergie commence à chuter)
      let bdStart = lowestBar;
      for (let i = lowestBar; i >= searchStart; i--) {
        if (bars[i].energy > lowestE + 0.15) { bdStart = i + 1; break; }
        bdStart = i;
      }
      // Trouver la fin (où l'énergie remonte)
      let bdEnd = lowestBar;
      for (let i = lowestBar; i < searchEnd; i++) {
        if (bars[i].energy > lowestE + 0.2) { bdEnd = i; break; }
        bdEnd = i;
      }
      // Snapper à 4 bars
      bdStart = Math.floor(bdStart / 4) * 4;
      sections.push({
        time_ms: bars[Math.min(bdStart, bars.length - 1)].startMs,
        label: 'BREAKDOWN',
        energy: lowestE,
        duration_ms: Math.max(barDurMs * 4, (bdEnd - bdStart) * barDurMs),
      });
    }
  }

  // ── OUTRO: dernières mesures où l'énergie chute
  const lastQuarter = Math.floor(bars.length * 0.75);
  let outroBar = bars.length - 4;
  for (let i = lastQuarter; i < bars.length - 2; i++) {
    // Chercher où l'énergie descend durablement sous 0.4
    const slice = bars.slice(i, Math.min(i + 8, bars.length));
    const avgE = slice.reduce((s, b) => s + b.energy, 0) / slice.length;
    if (avgE < 0.35) {
      outroBar = Math.floor(i / 4) * 4; // snap 4-bar
      break;
    }
  }

  if (outroBar < bars.length - 2) {
    const outroBars = bars.slice(outroBar);
    sections.push({
      time_ms: bars[outroBar].startMs,
      label: 'OUTRO',
      energy: outroBars.reduce((s, b) => s + b.energy, 0) / outroBars.length,
      duration_ms: (bars.length - outroBar) * barDurMs,
    });
  }

  // Trier par position
  sections.sort((a, b) => a.time_ms - b.time_ms);
  return sections;
}

// ── Key Detection (Krumhansl-Kessler + FFT) ──────────────────────────────────

function pearson(a: Float32Array, b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const ai = a[i] - ma, bi = b[i] - mb;
    num += ai * bi; da += ai * ai; db += bi * bi;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

function detectKey(samples: Float32Array, sr: number): string {
  const fftSize = 4096;
  const hopSize = 2048;
  const chroma = new Float32Array(12);

  const from = Math.floor(samples.length * 0.2);
  const len = Math.min(Math.floor(sr * 30), Math.floor(samples.length * 0.6));
  const seg = samples.slice(from, from + len);

  const freqPerBin = sr / fftSize;
  const hann = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / fftSize));

  let frameCount = 0;
  for (let offset = 0; offset + fftSize < seg.length; offset += hopSize) {
    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) re[i] = seg[offset + i] * hann[i];
    fft(re, im);
    for (let bin = 1; bin < fftSize / 2; bin++) {
      const freq = bin * freqPerBin;
      if (freq < 20 || freq > 4000) continue;
      const mag = Math.sqrt(re[bin] ** 2 + im[bin] ** 2);
      const midi = 12 * Math.log2(freq / 440) + 69;
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pc] += mag;
    }
    frameCount++;
    if (frameCount > 100) break;
  }

  const sum = chroma.reduce((a, b) => a + b, 0);
  if (sum === 0) return 'C maj';
  for (let i = 0; i < 12; i++) chroma[i] /= sum;

  let bestKey = 'C maj', bestCorr = -Infinity;
  for (let root = 0; root < 12; root++) {
    const rot = new Float32Array(12);
    for (let i = 0; i < 12; i++) rot[i] = chroma[(i + root) % 12];
    const cm = pearson(rot, KK_MAJOR);
    const cn = pearson(rot, KK_MINOR);
    if (cm > bestCorr) { bestCorr = cm; bestKey = `${NOTE_NAMES[root]} maj`; }
    if (cn > bestCorr) { bestCorr = cn; bestKey = `${NOTE_NAMES[root]} min`; }
  }
  return bestKey;
}

// ── RMS Energy ───────────────────────────────────────────────────────────────

function computeRMS(s: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s[i] ** 2;
  return Math.sqrt(sum / s.length);
}

// ── Cue Point Detection v2.0 — Beat-Grid Aware ─────────────────────────────
// Cette fonction génère des cue points de base qui seront remplacés par
// le cue_generator.py du backend (beaucoup plus intelligent).
// Mais si le backend échoue, ces cues-ci serviront de fallback.

function detectCuePoints(
  sections: SectionLabel[],
  drops: number[],
  beats: number[],
  bpm: number,
  durationMs: number,
): CuePointResult[] {
  const cues: CuePointResult[] = [];
  const barDurMs = (60000 / bpm) * 4;
  const usedPositions = new Set<number>();

  function snapTo4Bar(ms: number): number {
    // Snap à la limite de 4 mesures la plus proche
    const boundaries = beats.filter((_, i) => i % 16 === 0);
    if (boundaries.length === 0) return ms;
    return boundaries.reduce((best, b) => Math.abs(b - ms) < Math.abs(best - ms) ? b : best, boundaries[0]);
  }

  function addCue(ms: number, name: string, color: string, cueType: string, confidence: number) {
    const snapped = snapTo4Bar(ms);
    // Vérifier que ce n'est pas trop proche d'un cue existant
    for (const used of usedPositions) {
      if (Math.abs(used - snapped) < barDurMs * 4) return;
    }
    usedPositions.add(snapped);
    cues.push({
      time: snapped / 1000,
      name,
      color,
      cue_type: cueType,
      confidence,
    });
  }

  // INTRO
  const introSection = sections.find(s => s.label === 'INTRO');
  if (introSection) {
    addCue(0, 'INTRO', '#2B7FFF', 'section', 0.9);
  }

  // DROPs
  const dropColors = ['#E13535', '#FF69B4'];
  drops.forEach((d, i) => {
    if (i < 2) {
      addCue(d, i === 0 ? 'DROP' : 'DROP 2', dropColors[i], 'drop', 0.85);
    }
  });

  // BUILD (8-16 mesures avant le premier drop)
  if (drops.length > 0) {
    const buildMs = drops[0] - barDurMs * 12;
    if (buildMs > 0) {
      addCue(buildMs, 'BUILD', '#FF8C00', 'section', 0.75);
    }
  }

  // BREAKDOWN
  const bdSection = sections.find(s => s.label === 'BREAKDOWN');
  if (bdSection) {
    addCue(bdSection.time_ms, 'BREAKDOWN', '#E2D420', 'section', 0.8);
  }

  // OUTRO
  const outroSection = sections.find(s => s.label === 'OUTRO');
  if (outroSection) {
    addCue(outroSection.time_ms, 'OUTRO', '#A855F7', 'section', 0.8);
  }

  // Fallback si pas assez de cues
  if (cues.length < 4) {
    const targets = [0, 0.25, 0.5, 0.75].map(r => r * durationMs);
    const names = ['INTRO', 'DROP', 'BREAKDOWN', 'OUTRO'];
    const colors = ['#2B7FFF', '#E13535', '#E2D420', '#A855F7'];
    for (let i = cues.length; i < 4; i++) {
      addCue(targets[i], names[i], colors[i], 'section', 0.4);
    }
  }

  cues.sort((a, b) => a.time - b.time);
  return cues;
}

// ── Fonction principale ──────────────────────────────────────────────────────

export async function analyzeAudioLocal(
  arrayBuffer: ArrayBuffer,
  onProgress: (percent: number) => void = () => {}
): Promise<AnalysisResult> {
  const ctx = new AudioContext({ sampleRate: 22050 });
  onProgress(5);

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch (e: any) {
    await ctx.close();
    throw new Error('Format non supporté : ' + e.message);
  }
  onProgress(15);

  const ch = audioBuffer.getChannelData(0);
  const sr = audioBuffer.sampleRate; // 22050
  const duration = audioBuffer.duration;
  const durationMs = Math.round(duration * 1000);
  onProgress(20);

  // 1. BPM
  const bpm = detectBPM(ch, sr);
  onProgress(35);

  // 2. Trouver le premier downbeat (phase de la grille)
  const firstDownbeat = findFirstDownbeat(ch, sr, bpm);
  onProgress(40);

  // 3. Générer la grille de beats complète
  const beats = generateBeatGrid(bpm, duration, firstDownbeat);
  onProgress(45);

  // 4. Profil d'énergie par mesure
  const barProfile = computeBarEnergyProfile(ch, sr, bpm, beats);
  onProgress(55);

  // 5. Détection des drops
  const drops = detectDrops(barProfile, bpm);
  onProgress(60);

  // 6. Détection des phrases
  const phrases = detectPhrases(barProfile, bpm);
  onProgress(65);

  // 7. Détection des sections
  const sections = detectSections(barProfile, bpm, durationMs, drops);
  onProgress(70);

  // 8. Key detection
  const key_name = detectKey(ch, sr);
  onProgress(80);

  // 9. Energy
  const energy = computeRMS(ch);
  onProgress(85);

  // 10. Cue points (fallback — le backend va régénérer les cues pro)
  const cue_points = detectCuePoints(sections, drops, beats, bpm, durationMs);
  onProgress(95);

  await ctx.close();
  onProgress(100);

  return {
    bpm: Math.round(bpm * 10) / 10,
    key_name,
    energy: Math.round(energy * 1000) / 10,
    duration_ms: durationMs,
    cue_points,
    // v2.0: données structurelles pour le backend
    beat_positions: beats,
    drop_positions: drops,
    phrase_positions: phrases,
    section_labels: sections,
  };
}
