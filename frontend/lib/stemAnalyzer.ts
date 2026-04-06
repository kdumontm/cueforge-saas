// ─── CueForge Stem Analyzer v1.0 — Analyse par stems pour précision DJ ─────
// Utilise les 4 stems séparés par Demucs (drums, bass, vocals, other) pour
// affiner l'analyse audio bien au-delà de ce que le mix complet permet.
//
// Avantages stem-enhanced :
//   - Drums isolé → beats/onsets ultra-précis, sans pollution mélodique
//   - Bass isolé → détection drops/breakdowns basée sur le vrai kick+sub
//   - Vocals isolé → sections vocales, build-ups avec chant
//   - Other (mélodies/synths) → transitions, changements de texture
//
// Nécessite : Demucs local via bridge Electron (bridge.stems.separate)

'use strict';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StemAnalysisResult {
  // Données améliorées par les stems
  enhanced_beat_positions: number[];    // Beats recalculés depuis drum stem
  enhanced_drop_positions: number[];    // Drops recalculés depuis bass stem
  vocal_sections: VocalSection[];       // Sections avec/sans voix
  drum_energy_curve: number[];          // Énergie du drum stem par mesure (0-1)
  bass_energy_curve: number[];          // Énergie du bass stem par mesure (0-1)
  vocal_energy_curve: number[];         // Énergie du vocal stem par mesure (0-1)
  vocal_percentage: number;             // % du morceau avec voix (0-100)
  has_stems: true;
  stem_model: string;
}

export interface VocalSection {
  start_ms: number;
  end_ms: number;
  energy: number;   // 0-1
  label: 'vocal' | 'instrumental';
}

// ── FFT (copie locale pour ne pas importer circularement) ───────────────────

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

// ── BPM depuis drum stem (beaucoup plus précis) ─────────────────────────────

function detectBPMFromDrums(drums: Float32Array, sr: number): {
  bpm: number;
  beats: number[];
  confidence: number;
} {
  // Onset detection sur le drum stem = ultra-clean (pas de mélodies parasites)
  const winSize = Math.floor(sr * 0.023);
  const hopSize = Math.floor(winSize / 2);
  const energies: number[] = [];

  for (let i = 0; i + winSize < drums.length; i += hopSize) {
    let e = 0;
    for (let j = 0; j < winSize; j++) e += drums[i + j] ** 2;
    energies.push(Math.sqrt(e / winSize));
  }

  // Onset detection plus sensible car le signal est propre
  const onsets: number[] = [];
  for (let i = 2; i < energies.length - 2; i++) {
    const diff = energies[i] - energies[i - 1];
    const avg = (energies[i - 2] + energies[i - 1] + energies[i]) / 3;
    if (diff > 0 && diff > avg * 0.08 && energies[i] > 0.002) {
      onsets.push(i * hopSize / sr);
    }
  }

  if (onsets.length < 8) return { bpm: 120, beats: [], confidence: 0 };

  // Histogramme BPM
  const histSize = 161;
  const hist = new Float32Array(histSize);
  for (let i = 1; i < Math.min(onsets.length, 500); i++) {
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
    for (let trial = candidate - 0.5; trial <= candidate + 0.5; trial += 0.05) {
      const beatInterval = 60 / trial;
      let corr = 0;
      for (const onset of onsets) {
        const nearestBeat = Math.round(onset / beatInterval) * beatInterval;
        const dist = Math.abs(onset - nearestBeat);
        if (dist < beatInterval * 0.12) corr += 1;
      }
      if (corr > bestCorr) { bestCorr = corr; bestBPM = trial; }
    }
  }

  const bpm = Math.round(bestBPM * 10) / 10;
  const confidence = Math.min(1, bestCorr / onsets.length);

  // Générer le beat grid depuis le drum stem
  const beatDuration = 60 / bpm;
  const durationSec = drums.length / sr;

  // Trouver le premier downbeat (phase)
  const beatSamples = Math.floor(beatDuration * sr);
  const barDuration = beatDuration * 4;
  let bestPhase = 0, bestPhaseScore = -1;

  for (let p = 0; p < 32; p++) {
    const phase = (p / 32) * beatDuration;
    let score = 0;
    for (let bar = 0; bar < 8; bar++) {
      const sampleIdx = Math.floor((phase + bar * barDuration) * sr);
      if (sampleIdx + beatSamples < drums.length) {
        let e = 0;
        for (let j = 0; j < Math.min(beatSamples, 2048); j++) e += drums[sampleIdx + j] ** 2;
        score += Math.sqrt(e / Math.min(beatSamples, 2048));
      }
    }
    if (score > bestPhaseScore) { bestPhaseScore = score; bestPhase = phase; }
  }

  // Générer tous les beats
  const beats: number[] = [];
  let start = bestPhase;
  while (start - beatDuration >= 0) start -= beatDuration;
  for (let t = start; t < durationSec; t += beatDuration) {
    if (t >= 0) beats.push(Math.round(t * 1000));
  }

  return { bpm, beats, confidence };
}

// ── Drop detection depuis bass stem ─────────────────────────────────────────

function detectDropsFromBass(
  bass: Float32Array, sr: number, bpm: number, beats: number[]
): number[] {
  if (beats.length < 32) return [];

  const barDurMs = (60000 / bpm) * 4;
  const barEnergies: number[] = [];

  // Énergie du bass stem par mesure
  for (let barIdx = 0; barIdx < Math.floor(beats.length / 4); barIdx++) {
    const startSample = Math.floor((beats[barIdx * 4] / 1000) * sr);
    const endSample = Math.min(
      startSample + Math.floor((barDurMs / 1000) * sr), bass.length
    );
    if (endSample - startSample < 100) { barEnergies.push(0); continue; }

    let sum = 0;
    for (let j = startSample; j < endSample; j++) sum += bass[j] ** 2;
    barEnergies.push(Math.sqrt(sum / (endSample - startSample)));
  }

  // Normaliser
  const maxE = Math.max(...barEnergies, 0.001);
  const norm = barEnergies.map(e => e / maxE);

  // Lissage 4 bars
  const smoothed: number[] = [];
  for (let i = 0; i < norm.length; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - 1); j <= Math.min(norm.length - 1, i + 2); j++) { s += norm[j]; c++; }
    smoothed.push(s / c);
  }

  // Détection des drops : montée significative de bass energy
  const drops: { ms: number; score: number }[] = [];
  for (let i = 4; i < smoothed.length - 2; i++) {
    const before = smoothed.slice(Math.max(0, i - 4), i).reduce((a, b) => a + b, 0) / 4;
    const after = smoothed.slice(i, Math.min(smoothed.length, i + 4)).reduce((a, b) => a + b, 0) /
      Math.min(4, smoothed.length - i);
    const contrast = after - before;

    if (contrast > 0.12 && after > 0.5) {
      drops.push({ ms: beats[i * 4] || (i * barDurMs), score: contrast + after * 0.3 });
    }
  }

  drops.sort((a, b) => b.score - a.score);
  const filtered: number[] = [];
  for (const d of drops) {
    if (!filtered.some(f => Math.abs(f - d.ms) < barDurMs * 16)) filtered.push(d.ms);
    if (filtered.length >= 4) break;
  }

  return filtered.sort((a, b) => a - b);
}

// ── Vocal section detection ─────────────────────────────────────────────────

function detectVocalSections(
  vocals: Float32Array, sr: number, bpm: number, beats: number[]
): { sections: VocalSection[]; percentage: number; curve: number[] } {
  if (beats.length < 8) return { sections: [], percentage: 0, curve: [] };

  const barDurMs = (60000 / bpm) * 4;
  const barEnergies: number[] = [];

  // Énergie du vocal stem par mesure
  for (let barIdx = 0; barIdx < Math.floor(beats.length / 4); barIdx++) {
    const startSample = Math.floor((beats[barIdx * 4] / 1000) * sr);
    const endSample = Math.min(
      startSample + Math.floor((barDurMs / 1000) * sr), vocals.length
    );
    if (endSample - startSample < 100) { barEnergies.push(0); continue; }

    let sum = 0;
    for (let j = startSample; j < endSample; j++) sum += vocals[j] ** 2;
    barEnergies.push(Math.sqrt(sum / (endSample - startSample)));
  }

  const maxE = Math.max(...barEnergies, 0.001);
  const norm = barEnergies.map(e => e / maxE);

  // Seuil adaptatif pour détecter les sections vocales
  const mean = norm.reduce((a, b) => a + b, 0) / norm.length;
  const threshold = Math.max(0.15, mean * 0.6);

  // Grouper les mesures consécutives en sections vocales/instrumentales
  const sections: VocalSection[] = [];
  let currentLabel: 'vocal' | 'instrumental' = norm[0] > threshold ? 'vocal' : 'instrumental';
  let startBar = 0;

  for (let i = 1; i <= norm.length; i++) {
    const label = i < norm.length ? (norm[i] > threshold ? 'vocal' : 'instrumental') : 'end' as any;

    if (label !== currentLabel || i === norm.length) {
      const startMs = startBar < beats.length / 4 ? beats[startBar * 4] || 0 : startBar * barDurMs;
      const endMs = i < beats.length / 4 ? beats[i * 4] || (i * barDurMs) : i * barDurMs;
      const sectionBars = norm.slice(startBar, i);
      const avgE = sectionBars.reduce((a, b) => a + b, 0) / sectionBars.length;

      // Minimum 2 mesures pour être une vraie section
      if (i - startBar >= 2) {
        sections.push({
          start_ms: startMs,
          end_ms: endMs,
          energy: Math.round(avgE * 100) / 100,
          label: currentLabel,
        });
      }

      startBar = i;
      if (i < norm.length) currentLabel = label as 'vocal' | 'instrumental';
    }
  }

  // Pourcentage vocal
  const vocalBars = norm.filter(e => e > threshold).length;
  const percentage = Math.round((vocalBars / norm.length) * 100);

  return { sections, percentage, curve: norm };
}

// ── Energy curves par stem (pour chaque mesure) ─────────────────────────────

function computeStemEnergyCurve(
  stem: Float32Array, sr: number, bpm: number, beats: number[]
): number[] {
  const barDurMs = (60000 / bpm) * 4;
  const energies: number[] = [];

  for (let barIdx = 0; barIdx < Math.floor(beats.length / 4); barIdx++) {
    const startSample = Math.floor((beats[barIdx * 4] / 1000) * sr);
    const endSample = Math.min(
      startSample + Math.floor((barDurMs / 1000) * sr), stem.length
    );
    if (endSample - startSample < 100) { energies.push(0); continue; }

    let sum = 0;
    for (let j = startSample; j < endSample; j++) sum += stem[j] ** 2;
    energies.push(Math.sqrt(sum / (endSample - startSample)));
  }

  const maxE = Math.max(...energies, 0.001);
  return energies.map(e => Math.round((e / maxE) * 1000) / 1000);
}

// ══════════════════════════════════════════════════════════════════════════════
// ── FONCTION PRINCIPALE — Analyse stem-enhanced ─────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export async function analyzeStemsLocal(
  stemBuffers: Record<string, ArrayBuffer>,
  bpm: number,
  beats: number[],
  onProgress: (pct: number) => void = () => {}
): Promise<StemAnalysisResult> {
  const ctx = new AudioContext({ sampleRate: 22050 });
  onProgress(0);

  // Décoder les 4 stems
  const stemData: Record<string, Float32Array> = {};
  const stemNames = ['drums', 'bass', 'vocals', 'other'];
  let decoded = 0;

  for (const name of stemNames) {
    if (stemBuffers[name]) {
      try {
        const ab = await ctx.decodeAudioData(stemBuffers[name].slice(0));
        stemData[name] = ab.getChannelData(0);
      } catch (e) {
        console.warn(`[StemAnalyzer] Failed to decode ${name} stem:`, e);
      }
    }
    decoded++;
    onProgress(Math.round((decoded / stemNames.length) * 20));
  }

  const sr = 22050;

  // 1. BPM + beats depuis drum stem (ultra-précis)
  let enhancedBeats = beats;
  let enhancedBpm = bpm;

  if (stemData.drums) {
    onProgress(25);
    const drumBpm = detectBPMFromDrums(stemData.drums, sr);
    if (drumBpm.confidence > 0.3) {
      enhancedBpm = drumBpm.bpm;
      enhancedBeats = drumBpm.beats;
    }
    onProgress(40);
  }

  // 2. Drops depuis bass stem
  let enhancedDrops: number[] = [];
  if (stemData.bass) {
    onProgress(45);
    enhancedDrops = detectDropsFromBass(stemData.bass, sr, enhancedBpm, enhancedBeats);
    onProgress(55);
  }

  // 3. Vocal sections
  let vocalResult = { sections: [] as VocalSection[], percentage: 0, curve: [] as number[] };
  if (stemData.vocals) {
    onProgress(60);
    vocalResult = detectVocalSections(stemData.vocals, sr, enhancedBpm, enhancedBeats);
    onProgress(70);
  }

  // 4. Energy curves par stem
  onProgress(75);
  const drumCurve = stemData.drums
    ? computeStemEnergyCurve(stemData.drums, sr, enhancedBpm, enhancedBeats)
    : [];
  onProgress(80);
  const bassCurve = stemData.bass
    ? computeStemEnergyCurve(stemData.bass, sr, enhancedBpm, enhancedBeats)
    : [];
  onProgress(85);
  const vocalCurve = vocalResult.curve.length > 0
    ? vocalResult.curve
    : (stemData.vocals ? computeStemEnergyCurve(stemData.vocals, sr, enhancedBpm, enhancedBeats) : []);
  onProgress(90);

  await ctx.close();
  onProgress(100);

  return {
    enhanced_beat_positions: enhancedBeats,
    enhanced_drop_positions: enhancedDrops,
    vocal_sections: vocalResult.sections,
    drum_energy_curve: drumCurve,
    bass_energy_curve: bassCurve,
    vocal_energy_curve: vocalCurve,
    vocal_percentage: vocalResult.percentage,
    has_stems: true,
    stem_model: 'htdemucs',
  };
}
