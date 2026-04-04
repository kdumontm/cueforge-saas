// ─── Analyse audio 100% locale (Web Audio API + algorithmes JS) ───────────────
// Tourne dans le renderer Chromium — utilise le CPU de l'utilisateur, PAS les serveurs

'use strict';

// Profils Krumhansl-Kessler
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// FFT Radix-2 Cooley-Tukey (in-place, O(N log N))
function fft(re, im) {
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
        const ur = re[i+j], ui = im[i+j];
        const vr = re[i+j+len/2] * cr - im[i+j+len/2] * ci;
        const vi = re[i+j+len/2] * ci + im[i+j+len/2] * cr;
        re[i+j] = ur + vr; im[i+j] = ui + vi;
        re[i+j+len/2] = ur - vr; im[i+j+len/2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

/**
 * Analyse complète d'un ArrayBuffer audio
 * @param {ArrayBuffer} arrayBuffer
 * @param {function} onProgress (0-100)
 * @returns {{ bpm, key_name, energy, cue_points }}
 */
async function analyzeAudio(arrayBuffer, onProgress = () => {}) {
  // Contexte à 22050 Hz (downsample) pour économiser CPU/RAM
  const ctx = new AudioContext({ sampleRate: 22050 });
  onProgress(5);

  let audioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch (e) {
    await ctx.close();
    throw new Error('Format non supporté : ' + e.message);
  }
  onProgress(20);

  const ch       = audioBuffer.getChannelData(0);
  const sr       = audioBuffer.sampleRate;   // 22050
  const duration = audioBuffer.duration;
  onProgress(30);

  const bpm      = detectBPM(ch, sr);        onProgress(50);
  const key_name = detectKey(ch, sr);        onProgress(70);
  const energy   = computeRMS(ch);           onProgress(80);
  const cue_points = detectCuePoints(ch, sr, duration, bpm); onProgress(100);

  await ctx.close();

  return {
    bpm:       Math.round(bpm * 10) / 10,
    key_name,
    energy:    Math.round(energy * 1000) / 10,
    duration_ms: Math.round(duration * 1000),
    cue_points,
  };
}

// ─── BPM ───────────────────────────────────────────────────────────────────────
function detectBPM(samples, sr) {
  const winSize = Math.floor(sr * 0.023); // ~512 samples @22050
  const hopSize = Math.floor(winSize / 2);
  const energies = [];

  for (let i = 0; i + winSize < samples.length; i += hopSize) {
    let e = 0;
    for (let j = 0; j < winSize; j++) e += samples[i + j] ** 2;
    energies.push(Math.sqrt(e / winSize));
  }

  // Onset detection (energy flux)
  const onsets = [];
  for (let i = 2; i < energies.length - 2; i++) {
    const diff = energies[i] - energies[i - 1];
    const avg  = (energies[i-2] + energies[i-1] + energies[i]) / 3;
    if (diff > 0 && diff > avg * 0.12 && energies[i] > 0.003) {
      onsets.push(i * hopSize / sr);
    }
  }

  if (onsets.length < 8) return 120;

  // Histogram via intervalles inter-onsets
  const hist = new Float32Array(141); // 60-200 BPM
  for (let i = 1; i < Math.min(onsets.length, 300); i++) {
    const interval = onsets[i] - onsets[i - 1];
    if (interval < 0.01) continue;
    for (let mult = 1; mult <= 4; mult++) {
      const bpm = 60 / (interval * mult);
      const idx = Math.round(bpm) - 60;
      if (idx >= 0 && idx <= 140) hist[idx] += 1 / mult;
    }
  }

  // Lissage + peak (plage DJ: 80-175)
  let maxVal = 0, maxIdx = 60;
  for (let i = 20; i <= 115; i++) {
    const v = (hist[i-1] + hist[i] * 2 + hist[i+1]) / 4;
    if (v > maxVal) { maxVal = v; maxIdx = i; }
  }
  return maxIdx + 60;
}

// ─── Tonalité (Krumhansl-Kessler + FFT Cooley-Tukey) ──────────────────────────
function detectKey(samples, sr) {
  const fftSize = 4096;
  const hopSize = 2048;
  const chroma  = new Float32Array(12);

  // Analyser 30s au milieu du morceau
  const from = Math.floor(samples.length * 0.2);
  const len  = Math.min(Math.floor(sr * 30), Math.floor(samples.length * 0.6));
  const seg  = samples.slice(from, from + len);

  const freqPerBin = sr / fftSize;

  // Fenêtre de Hann
  const hann = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / fftSize));

  let frameCount = 0;
  for (let offset = 0; offset + fftSize < seg.length; offset += hopSize) {
    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) re[i] = seg[offset + i] * hann[i];

    fft(re, im); // O(N log N)

    // Mapper bins → classes de pitch (20 Hz – 4 kHz)
    for (let bin = 1; bin < fftSize / 2; bin++) {
      const freq = bin * freqPerBin;
      if (freq < 20 || freq > 4000) continue;
      const mag  = Math.sqrt(re[bin] ** 2 + im[bin] ** 2);
      const midi = 12 * Math.log2(freq / 440) + 69;
      const pc   = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pc] += mag;
    }
    frameCount++;
    if (frameCount > 100) break; // max 100 frames pour la perf
  }

  // Normaliser
  const sum = chroma.reduce((a, b) => a + b, 0);
  if (sum === 0) return 'C maj';
  for (let i = 0; i < 12; i++) chroma[i] /= sum;

  // Corrélation de Pearson contre les 24 profils
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

function pearson(a, b) {
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

// ─── RMS ───────────────────────────────────────────────────────────────────────
function computeRMS(s) {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s[i] ** 2;
  return Math.sqrt(sum / s.length);
}

// ─── Cue Points ────────────────────────────────────────────────────────────────
function detectCuePoints(samples, sr, duration, bpm) {
  const winSize  = Math.floor(sr * 1.0); // fenêtres de 1s
  const energies = [];

  for (let i = 0; i + winSize < samples.length; i += winSize) {
    let e = 0;
    for (let j = 0; j < winSize; j++) e += samples[i + j] ** 2;
    energies.push({ time: i / sr, e: Math.sqrt(e / winSize) });
  }

  if (energies.length < 4) {
    return ['Intro', 'Drop', 'Breakdown', 'Outro'].map((n, i) => ({
      time: duration * [0, 0.25, 0.5, 0.75][i], name: n
    }));
  }

  const maxE    = Math.max(...energies.map(e => e.e));
  const normE   = energies.map(e => ({ time: e.time, norm: e.e / maxE }));

  // Transitions d'énergie
  const trans = [];
  for (let i = 2; i < normE.length - 2; i++) {
    const prev  = (normE[i-2].norm + normE[i-1].norm) / 2;
    const curr  = (normE[i].norm   + normE[i+1].norm) / 2;
    const delta = curr - prev;
    if (Math.abs(delta) > 0.12) trans.push({ time: normE[i].time, delta });
  }

  trans.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top4 = trans.slice(0, 4);

  // Fallback si pas assez de transitions
  const barDur = (60 / bpm) * 4;
  const fallbacks = [8, 16, 32, 64].map(b => ({ time: b * barDur, delta: 0 }));
  while (top4.length < 4) top4.push(fallbacks[top4.length]);

  top4.sort((a, b) => a.time - b.time);

  return top4.map((t, i) => ({
    time:  Math.round(t.time * 100) / 100,
    name:  ['Intro', 'Drop', 'Breakdown', 'Outro'][i],
    color: ['#FF0000', '#FF6600', '#FFFF00', '#00FF00'][i],
  }));
}

// Export
if (typeof module !== 'undefined') module.exports = { analyzeAudio };
