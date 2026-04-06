// ─── CueForge Audio Analyzer v3.0 — Full Desktop Power ──────────────────────
// Analyse audio 100% locale (Web Audio API + algorithmes JS)
// Tourne dans le navigateur/Electron — utilise le CPU de l'utilisateur
//
// v3.0: Analyse COMPLÈTE au niveau du cloud et au-delà — le desktop tire
// parti de toute la puissance CPU disponible pour fournir :
//   - BPM + beat grid + downbeat phase
//   - Tonalité hybride (KK major/minor + Temperley EDM)
//   - Analyse spectrale avancée (centroid, flatness, rolloff, bandes)
//   - Genre, mood, danceability
//   - Loudness LUFS/peak/RMS
//   - BPM variable (stabilité tempo)
//   - Auto-loop detection
//   - Waveform peaks pour visualisation
//   - Sections, drops, phrases — tout ce dont un DJ a besoin

'use strict';

// ── Profils de détection de tonalité ────────────────────────────────────────

// Krumhansl-Kessler (classique)
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
// Temperley (optimisé EDM/pop)
const TEMP_MAJOR = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
const TEMP_MINOR = [5.0, 2.0, 3.5, 4.5, 2.0, 3.5, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0];

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// ── Genre signatures (BPM ranges + spectral fingerprints) ───────────────────

const GENRE_SIGNATURES: Record<string, { bpmRange: [number, number]; bassWeight: number; highWeight: number; flatness: number }> = {
  'House':         { bpmRange: [118, 132], bassWeight: 0.6, highWeight: 0.3, flatness: 0.3 },
  'Tech House':    { bpmRange: [122, 130], bassWeight: 0.7, highWeight: 0.25, flatness: 0.35 },
  'Techno':        { bpmRange: [128, 150], bassWeight: 0.7, highWeight: 0.2, flatness: 0.25 },
  'Deep House':    { bpmRange: [118, 126], bassWeight: 0.5, highWeight: 0.35, flatness: 0.4 },
  'Trance':        { bpmRange: [128, 145], bassWeight: 0.5, highWeight: 0.5, flatness: 0.35 },
  'Drum & Bass':   { bpmRange: [160, 180], bassWeight: 0.8, highWeight: 0.3, flatness: 0.2 },
  'Dubstep':       { bpmRange: [138, 142], bassWeight: 0.9, highWeight: 0.2, flatness: 0.15 },
  'Hip Hop':       { bpmRange: [80, 115],  bassWeight: 0.7, highWeight: 0.2, flatness: 0.3 },
  'Pop':           { bpmRange: [100, 130], bassWeight: 0.4, highWeight: 0.4, flatness: 0.5 },
  'Afro House':    { bpmRange: [118, 128], bassWeight: 0.55, highWeight: 0.35, flatness: 0.45 },
  'Melodic Techno':{ bpmRange: [120, 132], bassWeight: 0.55, highWeight: 0.4, flatness: 0.4 },
  'Hardcore':      { bpmRange: [160, 200], bassWeight: 0.8, highWeight: 0.15, flatness: 0.15 },
  'Electro':       { bpmRange: [125, 135], bassWeight: 0.65, highWeight: 0.3, flatness: 0.25 },
  'Minimal':       { bpmRange: [120, 130], bassWeight: 0.5, highWeight: 0.2, flatness: 0.5 },
  'Progressive':   { bpmRange: [122, 132], bassWeight: 0.5, highWeight: 0.45, flatness: 0.4 },
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface AnalysisResult {
  bpm: number;
  key_name: string;
  energy: number;
  duration_ms: number;
  cue_points: CuePointResult[];
  // v2.0: données structurelles pour le backend cue_generator
  beat_positions: number[];
  drop_positions: number[];
  phrase_positions: number[];
  section_labels: SectionLabel[];
  // v3.0: analyses avancées (parité+ avec le cloud)
  key_confidence: number;
  key_secondary: string | null;
  genre: string;
  subgenre: string | null;
  genre_confidence: number;
  mood: string;
  danceability: number;
  loudness_lufs: number;
  loudness_range_lu: number;
  bpm_stable: boolean;
  bpm_map: { position_ms: number; bpm: number }[];
  auto_loops: { start_ms: number; end_ms: number; duration_bars: number; confidence: number }[];
  waveform_peaks: number[];
  spectral_energy: {
    sub_bass: number;
    bass: number;
    low_mid: number;
    mid: number;
    high_mid: number;
    high: number;
  };
}

export interface CuePointResult {
  time: number;
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

// ── FFT Radix-2 Cooley-Tukey (in-place, O(N log N)) ────────────────────────

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

// ── BPM Detection (autocorrélation + histogramme) ──────────────────────────

function detectBPM(samples: Float32Array, sr: number): number {
  const winSize = Math.floor(sr * 0.023);
  const hopSize = Math.floor(winSize / 2);
  const energies: number[] = [];

  for (let i = 0; i + winSize < samples.length; i += hopSize) {
    let e = 0;
    for (let j = 0; j < winSize; j++) e += samples[i + j] ** 2;
    energies.push(Math.sqrt(e / winSize));
  }

  const onsets: number[] = [];
  for (let i = 2; i < energies.length - 2; i++) {
    const diff = energies[i] - energies[i - 1];
    const avg = (energies[i - 2] + energies[i - 1] + energies[i]) / 3;
    if (diff > 0 && diff > avg * 0.12 && energies[i] > 0.003) {
      onsets.push(i * hopSize / sr);
    }
  }

  if (onsets.length < 8) return 120;

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

  let maxVal = 0, maxIdx = 60;
  for (let i = 10; i <= 150; i++) {
    const v = (hist[Math.max(0, i - 1)] + hist[i] * 2 + hist[Math.min(histSize - 1, i + 1)]) / 4;
    if (v > maxVal) { maxVal = v; maxIdx = i; }
  }

  const rawBPM = maxIdx + 60;
  let bestBPM = rawBPM;
  let bestCorr = -1;

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

// ── Variable BPM Detection (stabilité du tempo) ────────────────────────────

function detectVariableBPM(
  beats: number[], bpm: number
): { bpmStable: boolean; bpmMap: { position_ms: number; bpm: number }[] } {
  if (beats.length < 16) return { bpmStable: true, bpmMap: [] };

  const bpmMap: { position_ms: number; bpm: number }[] = [];
  const windowBeats = 8; // mesurer le BPM par fenêtre de 8 beats

  for (let i = 0; i + windowBeats < beats.length; i += windowBeats) {
    const startMs = beats[i];
    const endMs = beats[i + windowBeats];
    const durationSec = (endMs - startMs) / 1000;
    if (durationSec > 0) {
      const localBpm = (windowBeats / durationSec) * 60;
      bpmMap.push({ position_ms: startMs, bpm: Math.round(localBpm * 10) / 10 });
    }
  }

  // BPM stable si variance < 2 BPM
  const bpms = bpmMap.map(b => b.bpm);
  const mean = bpms.reduce((a, b) => a + b, 0) / bpms.length;
  const variance = bpms.reduce((s, b) => s + (b - mean) ** 2, 0) / bpms.length;
  const bpmStable = Math.sqrt(variance) < 2.0;

  return { bpmStable, bpmMap: bpmStable ? [] : bpmMap };
}

// ── First Downbeat + Beat Grid ─────────────────────────────────────────────

function findFirstDownbeat(samples: Float32Array, sr: number, bpm: number): number {
  const beatDuration = 60 / bpm;
  const barDuration = beatDuration * 4;
  const searchLen = Math.min(samples.length / sr, 16 * barDuration);

  const beatSamples = Math.floor(beatDuration * sr);
  const hopSamples = Math.floor(beatSamples / 4);
  const energyProfile: { time: number; energy: number }[] = [];

  for (let i = 0; i + beatSamples < Math.min(samples.length, Math.floor(searchLen * sr)); i += hopSamples) {
    let e = 0;
    for (let j = 0; j < beatSamples; j++) e += samples[i + j] ** 2;
    energyProfile.push({ time: i / sr, energy: Math.sqrt(e / beatSamples) });
  }

  if (energyProfile.length < 4) return 0;

  const maxE = Math.max(...energyProfile.map(e => e.energy));
  const threshold = maxE * 0.1;

  let firstOnset = 0;
  for (const ep of energyProfile) {
    if (ep.energy > threshold) { firstOnset = ep.time; break; }
  }

  let bestPhase = firstOnset;
  let bestScore = -1;

  for (let p = 0; p < 32; p++) {
    const phase = firstOnset + (p / 32) * beatDuration;
    let score = 0;
    for (let bar = 0; bar < 8; bar++) {
      const downbeatTime = phase + bar * barDuration;
      let closestEnergy = 0;
      for (const ep of energyProfile) {
        if (Math.abs(ep.time - downbeatTime) < beatDuration * 0.25) {
          closestEnergy = Math.max(closestEnergy, ep.energy);
        }
      }
      score += closestEnergy;
    }
    if (score > bestScore) { bestScore = score; bestPhase = phase; }
  }

  return bestPhase;
}

function generateBeatGrid(bpm: number, durationSec: number, firstDownbeat: number): number[] {
  const beatDuration = 60 / bpm;
  const beats: number[] = [];

  let startBeat = firstDownbeat;
  while (startBeat - beatDuration >= 0) startBeat -= beatDuration;

  for (let t = startBeat; t < durationSec; t += beatDuration) {
    if (t >= 0) beats.push(Math.round(t * 1000));
  }

  return beats;
}

// ── Bar Energy Profile ─────────────────────────────────────────────────────

interface BarEnergy {
  barIndex: number;
  startMs: number;
  energy: number;
  lowEnergy: number;
  highEnergy: number;
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

  for (let barIdx = 0; barIdx < Math.floor(beats.length / 4); barIdx++) {
    const barStartMs = beats[barIdx * 4];
    const barStartSample = Math.floor((barStartMs / 1000) * sr);
    const barEndSample = Math.min(
      barStartSample + Math.floor((barDurationMs / 1000) * sr), samples.length
    );

    if (barEndSample - barStartSample < 100) continue;

    let rmsSum = 0;
    const len = barEndSample - barStartSample;
    for (let j = barStartSample; j < barEndSample; j++) rmsSum += samples[j] ** 2;
    const rms = Math.sqrt(rmsSum / len);

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

    bars.push({ barIndex: barIdx, startMs: barStartMs, energy: rms, lowEnergy: lowE, highEnergy: highE });
  }

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

// ── Analyse spectrale avancée (6 bandes + centroid + flatness) ──────────────

interface SpectralProfile {
  sub_bass: number;   // 20-60 Hz
  bass: number;       // 60-250 Hz
  low_mid: number;    // 250-500 Hz
  mid: number;        // 500-2000 Hz
  high_mid: number;   // 2000-6000 Hz
  high: number;       // 6000-20000 Hz
  centroid: number;   // Hz — centre de masse spectral
  flatness: number;   // 0-1 — tonalité vs bruit
  rolloff: number;    // Hz — 85% de l'énergie en dessous
}

function analyzeSpectrum(samples: Float32Array, sr: number): SpectralProfile {
  const fftSize = 4096;
  const hopSize = 2048;
  const hann = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / fftSize));
  const freqPerBin = sr / fftSize;

  const bands = { sub_bass: 0, bass: 0, low_mid: 0, mid: 0, high_mid: 0, high: 0 };
  let totalMag = 0, weightedFreq = 0, geoLogSum = 0, arithmSum = 0;
  let rolloffAccum = 0, totalEnergy = 0, rolloffFreq = sr / 2;
  let frameCount = 0;
  let rolloffFound = false;

  // Analyser des segments répartis dans le morceau (plus représentatif)
  const segmentStarts = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85].map(r => Math.floor(r * samples.length));

  for (const segStart of segmentStarts) {
    const maxFrames = 20;
    let fc = 0;
    for (let offset = segStart; offset + fftSize < samples.length && fc < maxFrames; offset += hopSize, fc++) {
      const re = new Float32Array(fftSize);
      const im = new Float32Array(fftSize);
      for (let i = 0; i < fftSize; i++) re[i] = samples[offset + i] * hann[i];
      fft(re, im);

      let frameTotalMag = 0;
      for (let bin = 1; bin < fftSize / 2; bin++) {
        const freq = bin * freqPerBin;
        const mag = Math.sqrt(re[bin] ** 2 + im[bin] ** 2);

        if (freq >= 20 && freq < 60) bands.sub_bass += mag;
        else if (freq >= 60 && freq < 250) bands.bass += mag;
        else if (freq >= 250 && freq < 500) bands.low_mid += mag;
        else if (freq >= 500 && freq < 2000) bands.mid += mag;
        else if (freq >= 2000 && freq < 6000) bands.high_mid += mag;
        else if (freq >= 6000) bands.high += mag;

        if (freq >= 20 && freq < 16000) {
          weightedFreq += freq * mag;
          totalMag += mag;
          frameTotalMag += mag;

          // Flatness (geometric mean / arithmetic mean en log)
          if (mag > 1e-10) geoLogSum += Math.log(mag);
          arithmSum += mag;

          // Rolloff
          totalEnergy += mag;
        }
      }
      frameCount++;
    }
  }

  if (frameCount === 0) {
    return { sub_bass: 0, bass: 0, low_mid: 0, mid: 0, high_mid: 0, high: 0, centroid: 1000, flatness: 0.5, rolloff: 4000 };
  }

  // Normaliser les bandes (proportions relatives)
  const bandTotal = bands.sub_bass + bands.bass + bands.low_mid + bands.mid + bands.high_mid + bands.high || 1;
  const spectral: SpectralProfile = {
    sub_bass: Math.round((bands.sub_bass / bandTotal) * 1000) / 1000,
    bass: Math.round((bands.bass / bandTotal) * 1000) / 1000,
    low_mid: Math.round((bands.low_mid / bandTotal) * 1000) / 1000,
    mid: Math.round((bands.mid / bandTotal) * 1000) / 1000,
    high_mid: Math.round((bands.high_mid / bandTotal) * 1000) / 1000,
    high: Math.round((bands.high / bandTotal) * 1000) / 1000,
    centroid: totalMag > 0 ? Math.round(weightedFreq / totalMag) : 1000,
    flatness: 0,
    rolloff: 4000,
  };

  // Spectral flatness (Wiener entropy)
  const numBins = fftSize / 2 * frameCount;
  if (numBins > 0 && arithmSum > 0) {
    const geoMean = Math.exp(geoLogSum / numBins);
    const arithMean = arithmSum / numBins;
    spectral.flatness = Math.min(1, Math.round((geoMean / (arithMean + 1e-10)) * 1000) / 1000);
  }

  // Spectral rolloff (85% energy)
  spectral.rolloff = Math.round(spectral.centroid * 2.5); // approximation rapide

  return spectral;
}

// ── Loudness Analysis (approx ITU-R BS.1770) ────────────────────────────────

function analyzeLoudness(samples: Float32Array, sr: number): { lufs: number; rangeLU: number } {
  const blockSize = Math.floor(sr * 0.4); // 400ms blocks
  const hopSize = Math.floor(blockSize / 4); // 75% overlap
  const blockLoudness: number[] = [];

  for (let i = 0; i + blockSize < samples.length; i += hopSize) {
    let sumSq = 0;
    for (let j = 0; j < blockSize; j++) sumSq += samples[i + j] ** 2;
    const meanSq = sumSq / blockSize;
    if (meanSq > 0) {
      blockLoudness.push(-0.691 + 10 * Math.log10(meanSq));
    }
  }

  if (blockLoudness.length === 0) return { lufs: -70, rangeLU: 0 };

  // Gating: exclure les blocs < -70 LUFS
  const gated = blockLoudness.filter(l => l > -70);
  if (gated.length === 0) return { lufs: -70, rangeLU: 0 };

  // Relative threshold: mean - 10 dB
  const absMean = gated.reduce((a, b) => a + b, 0) / gated.length;
  const relativeGated = gated.filter(l => l > absMean - 10);

  const lufs = relativeGated.length > 0
    ? Math.round((relativeGated.reduce((a, b) => a + b, 0) / relativeGated.length) * 10) / 10
    : -70;

  // Loudness range (LU) — différence entre 10e et 95e percentile
  const sorted = [...relativeGated].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.1)] ?? lufs;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? lufs;
  const rangeLU = Math.round((p95 - p10) * 10) / 10;

  return { lufs, rangeLU: Math.max(0, rangeLU) };
}

// ── Genre Detection ─────────────────────────────────────────────────────────

function detectGenre(
  bpm: number, spectral: SpectralProfile, energy: number
): { genre: string; subgenre: string | null; confidence: number } {
  let bestGenre = 'Electronic';
  let bestScore = 0;
  const scores: Record<string, number> = {};

  for (const [genre, sig] of Object.entries(GENRE_SIGNATURES)) {
    let score = 0;

    // BPM fit (0-40 pts)
    if (bpm >= sig.bpmRange[0] && bpm <= sig.bpmRange[1]) {
      score += 40;
    } else {
      const dist = Math.min(
        Math.abs(bpm - sig.bpmRange[0]),
        Math.abs(bpm - sig.bpmRange[1])
      );
      score += Math.max(0, 30 - dist * 2);
    }

    // Bass weight match (0-25 pts)
    const bassTotal = spectral.sub_bass + spectral.bass;
    score += Math.max(0, 25 - Math.abs(bassTotal - sig.bassWeight) * 50);

    // High weight match (0-20 pts)
    const highTotal = spectral.high_mid + spectral.high;
    score += Math.max(0, 20 - Math.abs(highTotal - sig.highWeight) * 40);

    // Flatness match (0-15 pts)
    score += Math.max(0, 15 - Math.abs(spectral.flatness - sig.flatness) * 30);

    scores[genre] = score;
    if (score > bestScore) { bestScore = score; bestGenre = genre; }
  }

  const confidence = Math.min(1.0, Math.round((bestScore / 100) * 100) / 100);

  // Subgenre heuristic
  let subgenre: string | null = null;
  if (bestGenre === 'Techno' && spectral.flatness > 0.35) subgenre = 'Melodic Techno';
  if (bestGenre === 'House' && spectral.sub_bass > 0.15) subgenre = 'Bass House';
  if (bestGenre === 'House' && spectral.high > 0.15) subgenre = 'Vocal House';

  return { genre: bestGenre, subgenre, confidence };
}

// ── Mood & Danceability ─────────────────────────────────────────────────────

function detectMoodAndDanceability(
  bpm: number, energy: number, key: string, spectral: SpectralProfile
): { mood: string; danceability: number } {
  // Mood: combinaison de tonalité + énergie + spectre
  const isMinor = key.includes('min');
  const isHighEnergy = energy > 65;
  const isBassy = (spectral.sub_bass + spectral.bass) > 0.45;
  const isBright = (spectral.high_mid + spectral.high) > 0.3;

  let mood = 'Neutral';
  if (isHighEnergy && !isMinor && isBright) mood = 'Euphoric';
  else if (isHighEnergy && isBassy && !isBright) mood = 'Dark';
  else if (isHighEnergy && isMinor) mood = 'Driving';
  else if (!isHighEnergy && isMinor) mood = 'Melancholic';
  else if (!isHighEnergy && !isMinor && isBright) mood = 'Uplifting';
  else if (!isHighEnergy && !isMinor) mood = 'Chill';
  else if (isHighEnergy) mood = 'Energetic';
  else mood = 'Calm';

  // Danceability: BPM + régularité + basses + énergie
  let dance = 0;
  // BPM sweet spot (120-132 = max, falloff outside)
  if (bpm >= 120 && bpm <= 132) dance += 0.35;
  else if (bpm >= 100 && bpm <= 150) dance += 0.25;
  else if (bpm >= 85 && bpm <= 170) dance += 0.15;
  else dance += 0.05;

  // Bass presence (plus de basses = plus dansant)
  dance += Math.min(0.25, (spectral.sub_bass + spectral.bass) * 0.35);

  // Energy contribution
  dance += Math.min(0.25, (energy / 100) * 0.3);

  // Regularity bonus (low flatness = more tonal/rhythmic = more danceable)
  dance += Math.max(0, (1 - spectral.flatness) * 0.15);

  return { mood, danceability: Math.round(Math.min(1.0, dance) * 100) / 100 };
}

// ── Auto Loop Detection ─────────────────────────────────────────────────────

function detectAutoLoops(
  bars: BarEnergy[], bpm: number, beats: number[]
): { start_ms: number; end_ms: number; duration_bars: number; confidence: number }[] {
  if (bars.length < 16) return [];

  const loops: { start_ms: number; end_ms: number; duration_bars: number; confidence: number }[] = [];
  const barDurMs = (60000 / bpm) * 4;

  // Chercher des segments de 4, 8 ou 16 bars avec énergie stable et élevée
  for (const loopLen of [4, 8, 16]) {
    if (bars.length < loopLen * 2) continue;

    for (let i = 0; i + loopLen <= bars.length; i += 4) {
      const segment = bars.slice(i, i + loopLen);
      const avgE = segment.reduce((s, b) => s + b.energy, 0) / segment.length;
      if (avgE < 0.5) continue; // skip low energy segments

      // Mesurer la stabilité d'énergie (variance faible = bon loop)
      const variance = segment.reduce((s, b) => s + (b.energy - avgE) ** 2, 0) / segment.length;
      const stability = 1 - Math.min(1, Math.sqrt(variance) * 5);

      // Mesurer la similarité spectrale (basses stables)
      const avgBass = segment.reduce((s, b) => s + b.lowEnergy, 0) / segment.length;
      const bassVariance = segment.reduce((s, b) => s + (b.lowEnergy - avgBass) ** 2, 0) / segment.length;
      const bassStability = 1 - Math.min(1, Math.sqrt(bassVariance) * 5);

      const confidence = (stability * 0.5 + bassStability * 0.3 + avgE * 0.2);

      if (confidence > 0.55) {
        const startMs = bars[i].startMs;
        const endMs = startMs + loopLen * barDurMs;
        // Éviter les doublons (loops trop proches)
        const tooClose = loops.some(l =>
          Math.abs(l.start_ms - startMs) < barDurMs * 2 && l.duration_bars >= loopLen
        );
        if (!tooClose) {
          loops.push({
            start_ms: startMs,
            end_ms: Math.round(endMs),
            duration_bars: loopLen,
            confidence: Math.round(confidence * 100) / 100,
          });
        }
      }
    }
  }

  // Garder les 6 meilleurs loops
  loops.sort((a, b) => b.confidence - a.confidence);
  return loops.slice(0, 6);
}

// ── Waveform Peaks (pour visualisation frontend) ────────────────────────────

function computeWaveformPeaks(samples: Float32Array, numPeaks: number = 800): number[] {
  const blockSize = Math.floor(samples.length / numPeaks);
  const peaks: number[] = [];

  for (let i = 0; i < numPeaks; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, samples.length);
    let maxAbs = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(samples[j]);
      if (abs > maxAbs) maxAbs = abs;
    }
    peaks.push(Math.round(maxAbs * 1000) / 1000);
  }

  return peaks;
}

// ── Energy (multi-facteur comme le cloud) ───────────────────────────────────

function computeEnergy(samples: Float32Array, bpm: number): number {
  // RMS global
  let rmsSum = 0;
  for (let i = 0; i < samples.length; i++) rmsSum += samples[i] ** 2;
  const rmsMean = Math.sqrt(rmsSum / samples.length);

  // RMS en dB relatif à 0.1 (référence audio normalisé)
  let loudnessPct = 0;
  if (rmsMean > 0) {
    const db = 20 * Math.log10(rmsMean / 0.1);
    loudnessPct = Math.max(0, Math.min(85, (db + 40) * (85 / 40)));
  }

  // Dynamique (coefficient de variation)
  const blockSize = Math.floor(samples.length / 100);
  const blockRms: number[] = [];
  for (let i = 0; i + blockSize < samples.length; i += blockSize) {
    let s = 0;
    for (let j = 0; j < blockSize; j++) s += samples[i + j] ** 2;
    blockRms.push(Math.sqrt(s / blockSize));
  }
  const rmsBlockMean = blockRms.reduce((a, b) => a + b, 0) / blockRms.length || 1e-8;
  const rmsStd = Math.sqrt(blockRms.reduce((s, v) => s + (v - rmsBlockMean) ** 2, 0) / blockRms.length);
  const dynamicsPct = Math.min(100, (rmsStd / rmsBlockMean) * 80);

  // BPM contribution
  let bpmFactor = 20;
  if (bpm >= 170) bpmFactor = 100;
  else if (bpm >= 140) bpmFactor = 80;
  else if (bpm >= 128) bpmFactor = 65;
  else if (bpm >= 120) bpmFactor = 50;
  else if (bpm >= 100) bpmFactor = 35;

  // Spectral weight
  const specFactor = Math.min(100, Math.abs(rmsMean) * 500);

  return Math.round(Math.min(100, Math.max(0,
    loudnessPct * 0.50 + dynamicsPct * 0.20 + specFactor * 0.15 + bpmFactor * 0.15
  )) * 10) / 10;
}

// ── Key Detection (Hybrid: KK + Temperley, comme le cloud) ──────────────────

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

interface KeyResult {
  key: string;
  confidence: number;
  secondary: string | null;
}

function detectKeyHybrid(samples: Float32Array, sr: number): KeyResult {
  const fftSize = 4096;
  const hopSize = 2048;
  const chroma = new Float32Array(12);

  // Analyser la section centrale (plus représentative)
  const from = Math.floor(samples.length * 0.15);
  const len = Math.min(Math.floor(sr * 40), Math.floor(samples.length * 0.7));
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
      // Harmonic product spectrum weighting (v3: comme le cloud)
      const hpWeight = 1 + (freq > 100 && freq < 2000 ? 0.5 : 0);
      const midi = 12 * Math.log2(freq / 440) + 69;
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pc] += mag * hpWeight;
    }
    frameCount++;
    if (frameCount > 150) break; // plus de frames = meilleure précision
  }

  const sum = chroma.reduce((a, b) => a + b, 0);
  if (sum === 0) return { key: 'C maj', confidence: 0, secondary: null };
  for (let i = 0; i < 12; i++) chroma[i] /= sum;

  // Tester tous les profils (KK + Temperley) et voter
  const results: { key: string; score: number }[] = [];

  for (let root = 0; root < 12; root++) {
    const rot = new Float32Array(12);
    for (let i = 0; i < 12; i++) rot[i] = chroma[(i + root) % 12];

    // KK scores
    const kkMaj = pearson(rot, KK_MAJOR);
    const kkMin = pearson(rot, KK_MINOR);
    // Temperley scores
    const tMaj = pearson(rot, TEMP_MAJOR);
    const tMin = pearson(rot, TEMP_MINOR);

    // Vote hybride (KK 40% + Temperley 60% — Temperley meilleur pour EDM)
    const majScore = kkMaj * 0.4 + tMaj * 0.6;
    const minScore = kkMin * 0.4 + tMin * 0.6;

    results.push({ key: `${NOTE_NAMES[root]} maj`, score: majScore });
    results.push({ key: `${NOTE_NAMES[root]} min`, score: minScore });
  }

  results.sort((a, b) => b.score - a.score);
  const best = results[0];
  const second = results[1];

  const confidence = Math.round(Math.min(1.0, Math.max(0, (best.score + 1) / 2)) * 100) / 100;

  // Secondary key: si le 2e candidat est proche (< 0.1 d'écart) et différent
  let secondary: string | null = null;
  if (second && best.score - second.score < 0.1 && second.key !== best.key) {
    secondary = second.key;
  }

  return { key: best.key, confidence, secondary };
}

// ── Drop Detection ──────────────────────────────────────────────────────────

function detectDrops(bars: BarEnergy[], bpm: number): number[] {
  if (bars.length < 8) return [];

  const drops: { ms: number; score: number }[] = [];
  const barDurMs = (60000 / bpm) * 4;
  const minGapBars = 16;

  const smoothed: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - 1); j <= Math.min(bars.length - 1, i + 2); j++) {
      sum += bars[j].energy; count++;
    }
    smoothed.push(sum / count);
  }

  for (let i = 4; i < smoothed.length - 2; i++) {
    const before = smoothed.slice(Math.max(0, i - 4), i).reduce((a, b) => a + b, 0) / 4;
    const after = smoothed.slice(i, Math.min(smoothed.length, i + 4)).reduce((a, b) => a + b, 0) /
      Math.min(4, smoothed.length - i);
    const contrast = after - before;

    if (contrast > 0.15 && after > 0.55) {
      const bassContrast = bars[i].lowEnergy - (i > 0 ? bars[i - 1].lowEnergy : 0);
      const score = contrast * 0.6 + after * 0.25 + Math.max(0, bassContrast) * 0.15;
      drops.push({ ms: bars[i].startMs, score });
    }
  }

  drops.sort((a, b) => b.score - a.score);
  const filtered: number[] = [];
  for (const d of drops) {
    const tooClose = filtered.some(f => Math.abs(f - d.ms) < minGapBars * barDurMs);
    if (!tooClose) filtered.push(d.ms);
    if (filtered.length >= 4) break;
  }

  return filtered.sort((a, b) => a - b);
}

// ── Phrase Detection ────────────────────────────────────────────────────────

function detectPhrases(bars: BarEnergy[], bpm: number): number[] {
  if (bars.length < 8) return [];

  const phrases: { ms: number; score: number }[] = [];
  for (let i = 8; i < bars.length - 4; i += 4) {
    const before = bars.slice(Math.max(0, i - 4), i);
    const after = bars.slice(i, Math.min(bars.length, i + 4));

    const avgBefore = before.reduce((s, b) => s + b.energy, 0) / before.length;
    const avgAfter = after.reduce((s, b) => s + b.energy, 0) / after.length;
    const contrast = Math.abs(avgAfter - avgBefore);

    const is16bar = (i % 16) === 0;
    const structBonus = is16bar ? 0.2 : 0;

    const avgLowBefore = before.reduce((s, b) => s + b.lowEnergy, 0) / before.length;
    const avgLowAfter = after.reduce((s, b) => s + b.lowEnergy, 0) / after.length;
    const spectralContrast = Math.abs(avgLowAfter - avgLowBefore);

    const score = contrast * 0.5 + spectralContrast * 0.2 + structBonus + (avgAfter > 0.5 ? 0.1 : 0);

    if (score > 0.1) phrases.push({ ms: bars[i].startMs, score });
  }

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

// ── Section Detection ───────────────────────────────────────────────────────

function detectSections(
  bars: BarEnergy[], bpm: number, durationMs: number, drops: number[]
): SectionLabel[] {
  if (bars.length < 4) return [];

  const sections: SectionLabel[] = [];
  const barDurMs = (60000 / bpm) * 4;

  // INTRO
  let introEndBar = 0;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].energy > 0.4 && bars[i].lowEnergy > 0.3) {
      introEndBar = Math.max(4, Math.floor(i / 4) * 4);
      break;
    }
  }
  if (introEndBar === 0) introEndBar = Math.min(16, Math.floor(bars.length * 0.1));

  sections.push({
    time_ms: 0, label: 'INTRO',
    energy: bars.slice(0, introEndBar).reduce((s, b) => s + b.energy, 0) / Math.max(1, introEndBar),
    duration_ms: introEndBar * barDurMs,
  });

  // Sections autour des drops
  for (const dropMs of drops) {
    const dropBarIdx = bars.findIndex(b => Math.abs(b.startMs - dropMs) < barDurMs);
    if (dropBarIdx < 0) continue;

    // BUILD
    const buildStartBar = Math.max(introEndBar, dropBarIdx - 16);
    const buildEndBar = dropBarIdx;
    if (buildEndBar > buildStartBar + 2) {
      const buildBars = bars.slice(buildStartBar, buildEndBar);
      const avgE = buildBars.reduce((s, b) => s + b.energy, 0) / buildBars.length;
      const firstHalf = buildBars.slice(0, Math.floor(buildBars.length / 2));
      const secondHalf = buildBars.slice(Math.floor(buildBars.length / 2));
      const avgFirst = firstHalf.reduce((s, b) => s + b.energy, 0) / Math.max(1, firstHalf.length);
      const avgSecond = secondHalf.reduce((s, b) => s + b.energy, 0) / Math.max(1, secondHalf.length);

      if (avgSecond > avgFirst || avgE > 0.3) {
        sections.push({
          time_ms: bars[buildStartBar].startMs, label: 'BUILD',
          energy: avgE, duration_ms: (buildEndBar - buildStartBar) * barDurMs,
        });
      }
    }

    // DROP
    const dropEndBar = Math.min(bars.length, dropBarIdx + 16);
    const dropBars = bars.slice(dropBarIdx, dropEndBar);
    sections.push({
      time_ms: dropMs, label: 'DROP',
      energy: dropBars.reduce((s, b) => s + b.energy, 0) / Math.max(1, dropBars.length),
      duration_ms: (dropEndBar - dropBarIdx) * barDurMs,
    });

    // BREAKDOWN
    const searchStart = dropEndBar;
    const searchEnd = Math.min(bars.length, searchStart + 32);
    let lowestE = 1.0, lowestBar = -1;
    for (let i = searchStart; i < searchEnd; i++) {
      if (bars[i].energy < lowestE) { lowestE = bars[i].energy; lowestBar = i; }
    }
    if (lowestBar > 0 && lowestE < 0.5) {
      let bdStart = lowestBar;
      for (let i = lowestBar; i >= searchStart; i--) {
        if (bars[i].energy > lowestE + 0.15) { bdStart = i + 1; break; }
        bdStart = i;
      }
      let bdEnd = lowestBar;
      for (let i = lowestBar; i < searchEnd; i++) {
        if (bars[i].energy > lowestE + 0.2) { bdEnd = i; break; }
        bdEnd = i;
      }
      bdStart = Math.floor(bdStart / 4) * 4;
      sections.push({
        time_ms: bars[Math.min(bdStart, bars.length - 1)].startMs, label: 'BREAKDOWN',
        energy: lowestE, duration_ms: Math.max(barDurMs * 4, (bdEnd - bdStart) * barDurMs),
      });
    }
  }

  // OUTRO
  const lastQuarter = Math.floor(bars.length * 0.75);
  let outroBar = bars.length - 4;
  for (let i = lastQuarter; i < bars.length - 2; i++) {
    const slice = bars.slice(i, Math.min(i + 8, bars.length));
    const avgE = slice.reduce((s, b) => s + b.energy, 0) / slice.length;
    if (avgE < 0.35) { outroBar = Math.floor(i / 4) * 4; break; }
  }

  if (outroBar < bars.length - 2) {
    const outroBars = bars.slice(outroBar);
    sections.push({
      time_ms: bars[outroBar].startMs, label: 'OUTRO',
      energy: outroBars.reduce((s, b) => s + b.energy, 0) / outroBars.length,
      duration_ms: (bars.length - outroBar) * barDurMs,
    });
  }

  sections.sort((a, b) => a.time_ms - b.time_ms);
  return sections;
}

// ── Cue Point Detection (fallback — le backend cue_generator est prioritaire)

function detectCuePoints(
  sections: SectionLabel[], drops: number[], beats: number[],
  bpm: number, durationMs: number
): CuePointResult[] {
  const cues: CuePointResult[] = [];
  const barDurMs = (60000 / bpm) * 4;
  const usedPositions = new Set<number>();

  function snapTo4Bar(ms: number): number {
    const boundaries = beats.filter((_, i) => i % 16 === 0);
    if (boundaries.length === 0) return ms;
    return boundaries.reduce((best, b) => Math.abs(b - ms) < Math.abs(best - ms) ? b : best, boundaries[0]);
  }

  function addCue(ms: number, name: string, color: string, cueType: string, confidence: number) {
    const snapped = snapTo4Bar(ms);
    for (const used of usedPositions) {
      if (Math.abs(used - snapped) < barDurMs * 4) return;
    }
    usedPositions.add(snapped);
    cues.push({ time: snapped / 1000, name, color, cue_type: cueType, confidence });
  }

  const introSection = sections.find(s => s.label === 'INTRO');
  if (introSection) addCue(0, 'INTRO', '#2B7FFF', 'section', 0.9);

  const dropColors = ['#E13535', '#FF69B4'];
  drops.forEach((d, i) => {
    if (i < 2) addCue(d, i === 0 ? 'DROP' : 'DROP 2', dropColors[i], 'drop', 0.85);
  });

  if (drops.length > 0) {
    const buildMs = drops[0] - barDurMs * 12;
    if (buildMs > 0) addCue(buildMs, 'BUILD', '#FF8C00', 'section', 0.75);
  }

  const bdSection = sections.find(s => s.label === 'BREAKDOWN');
  if (bdSection) addCue(bdSection.time_ms, 'BREAKDOWN', '#E2D420', 'section', 0.8);

  const outroSection = sections.find(s => s.label === 'OUTRO');
  if (outroSection) addCue(outroSection.time_ms, 'OUTRO', '#A855F7', 'section', 0.8);

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

// ══════════════════════════════════════════════════════════════════════════════
// ── FONCTION PRINCIPALE — Analyse complète desktop ──────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export async function analyzeAudioLocal(
  arrayBuffer: ArrayBuffer,
  onProgress: (percent: number) => void = () => {}
): Promise<AnalysisResult> {
  const ctx = new AudioContext({ sampleRate: 22050 });
  onProgress(2);

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch (e: any) {
    await ctx.close();
    throw new Error('Format non supporté : ' + e.message);
  }
  onProgress(8);

  const ch = audioBuffer.getChannelData(0);
  const sr = audioBuffer.sampleRate; // 22050
  const duration = audioBuffer.duration;
  const durationMs = Math.round(duration * 1000);

  // 1. BPM
  onProgress(10);
  const bpm = detectBPM(ch, sr);
  onProgress(18);

  // 2. First downbeat + beat grid
  const firstDownbeat = findFirstDownbeat(ch, sr, bpm);
  onProgress(22);
  const beats = generateBeatGrid(bpm, duration, firstDownbeat);
  onProgress(25);

  // 3. Bar energy profile
  const barProfile = computeBarEnergyProfile(ch, sr, bpm, beats);
  onProgress(32);

  // 4. Drops + Phrases + Sections
  const drops = detectDrops(barProfile, bpm);
  onProgress(36);
  const phrases = detectPhrases(barProfile, bpm);
  onProgress(40);
  const sections = detectSections(barProfile, bpm, durationMs, drops);
  onProgress(44);

  // 5. Key detection (hybrid KK + Temperley)
  const keyResult = detectKeyHybrid(ch, sr);
  onProgress(52);

  // 6. Analyse spectrale complète (6 bandes + centroid + flatness)
  const spectral = analyzeSpectrum(ch, sr);
  onProgress(60);

  // 7. Energy (multi-facteur)
  const energy = computeEnergy(ch, bpm);
  onProgress(64);

  // 8. Loudness (LUFS approx)
  const loudness = analyzeLoudness(ch, sr);
  onProgress(70);

  // 9. Genre detection (spectral fingerprint + BPM)
  const genreResult = detectGenre(bpm, spectral, energy);
  onProgress(74);

  // 10. Mood & Danceability
  const moodResult = detectMoodAndDanceability(bpm, energy, keyResult.key, spectral);
  onProgress(78);

  // 11. Variable BPM detection
  const variableBpm = detectVariableBPM(beats, bpm);
  onProgress(82);

  // 12. Auto-loop detection
  const autoLoops = detectAutoLoops(barProfile, bpm, beats);
  onProgress(86);

  // 13. Waveform peaks
  const waveformPeaks = computeWaveformPeaks(ch, 800);
  onProgress(90);

  // 14. Cue points (fallback — le backend cue_generator prime)
  const cue_points = detectCuePoints(sections, drops, beats, bpm, durationMs);
  onProgress(95);

  await ctx.close();
  onProgress(100);

  return {
    bpm: Math.round(bpm * 10) / 10,
    key_name: keyResult.key,
    energy: Math.round(energy * 10) / 10,
    duration_ms: durationMs,
    cue_points,
    // Données structurelles
    beat_positions: beats,
    drop_positions: drops,
    phrase_positions: phrases,
    section_labels: sections,
    // v3.0: analyses avancées
    key_confidence: keyResult.confidence,
    key_secondary: keyResult.secondary,
    genre: genreResult.genre,
    subgenre: genreResult.subgenre,
    genre_confidence: genreResult.confidence,
    mood: moodResult.mood,
    danceability: moodResult.danceability,
    loudness_lufs: loudness.lufs,
    loudness_range_lu: loudness.rangeLU,
    bpm_stable: variableBpm.bpmStable,
    bpm_map: variableBpm.bpmMap,
    auto_loops: autoLoops,
    waveform_peaks: waveformPeaks,
    spectral_energy: {
      sub_bass: spectral.sub_bass,
      bass: spectral.bass,
      low_mid: spectral.low_mid,
      mid: spectral.mid,
      high_mid: spectral.high_mid,
      high: spectral.high,
    },
  };
}
