'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX, SkipBack, SkipForward, Play, Pause } from 'lucide-react';
import { getToken } from '@/lib/api';

interface CuePoint {
  id: number;
  position_ms: number;
  color?: string | null;
  color_rgb?: string | null;
  name?: string;
  number?: number | null;
  cue_mode?: string;
}

export interface WaveformTheme {
  id: string;
  label: string;
  colors: [string, string, string];
  getBarColor: (r: number, g: number, b: number, brightness: number) => string;
}

// colors = [bass, mids, highs] — getBarColor receives (bass, mids, highs, brightness)
// Rekordbox style: each bar = ONE blended color based on dominant frequency
export const WAVEFORM_THEMES: WaveformTheme[] = [
  {
    id: 'spectral',
    label: 'Rekordbox',
    colors: ['#ef4444', '#22c55e', '#3b82f6'],
    getBarColor: (bass, mids, highs, bright) => {
      // Rekordbox-style: vibrant color blend. Dominant band wins, smooth transitions.
      const total = bass + mids + highs;
      if (total < 0.01) return 'rgb(20,20,20)';
      // Normalize so they sum to 1
      const bN = bass / total;
      const mN = mids / total;
      const hN = highs / total;
      // Red=bass, Green=mids, Blue=highs — weighted color mix with saturation boost
      const rr = Math.min(255, Math.round((bN * 255 + mN * 60 + hN * 40) * bright));
      const gg = Math.min(255, Math.round((bN * 20 + mN * 220 + hN * 60) * bright));
      const bb = Math.min(255, Math.round((bN * 20 + mN * 40 + hN * 255) * bright));
      return `rgb(${rr},${gg},${bb})`;
    },
  },
  {
    id: 'classic',
    label: 'Classic RGB',
    colors: ['#ff0000', '#00ff00', '#0066ff'],
    getBarColor: (bass, mids, highs, bright) => {
      // Pure hard RGB: dominant band gets full color
      const max = Math.max(bass, mids, highs);
      if (max < 0.01) return 'rgb(20,20,20)';
      if (bass >= mids && bass >= highs) return `rgb(${Math.round(255 * bright)},${Math.round(20 * bright)},${Math.round(20 * bright)})`;
      if (mids >= bass && mids >= highs) return `rgb(${Math.round(20 * bright)},${Math.round(220 * bright)},${Math.round(20 * bright)})`;
      return `rgb(${Math.round(30 * bright)},${Math.round(60 * bright)},${Math.round(255 * bright)})`;
    },
  },
  {
    id: 'neon',
    label: 'Neon',
    colors: ['#ff00ff', '#00ffff', '#ffff00'],
    getBarColor: (bass, mids, highs, bright) => {
      const total = bass + mids + highs;
      if (total < 0.01) return 'rgb(20,20,20)';
      const bN = bass / total, mN = mids / total, hN = highs / total;
      // Magenta=bass, Cyan=mids, Yellow=highs
      const rr = Math.min(255, Math.round((bN * 255 + hN * 255) * bright));
      const gg = Math.min(255, Math.round((mN * 255 + hN * 255) * bright));
      const bb = Math.min(255, Math.round((bN * 255 + mN * 255) * bright));
      return `rgb(${rr},${gg},${bb})`;
    },
  },
  {
    id: 'sunset',
    label: 'Sunset',
    colors: ['#ff4500', '#ff8c00', '#ffd700'],
    getBarColor: (bass, mids, highs, bright) => {
      const total = bass + mids + highs;
      if (total < 0.01) return 'rgb(20,20,20)';
      const bN = bass / total, mN = mids / total, hN = highs / total;
      const rr = Math.min(255, Math.round((bN * 255 + mN * 255 + hN * 255) * bright));
      const gg = Math.min(255, Math.round((bN * 30 + mN * 140 + hN * 215) * bright));
      const bb = Math.min(255, Math.round((bN * 0 + mN * 0 + hN * 30) * bright));
      return `rgb(${rr},${gg},${bb})`;
    },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    colors: ['#0077cc', '#00bbee', '#6366f1'],
    getBarColor: (bass, mids, highs, bright) => {
      const total = bass + mids + highs;
      if (total < 0.01) return 'rgb(20,20,20)';
      const bN = bass / total, mN = mids / total, hN = highs / total;
      const rr = Math.min(255, Math.round((bN * 0 + mN * 30 + hN * 99) * bright));
      const gg = Math.min(255, Math.round((bN * 119 + mN * 187 + hN * 102) * bright));
      const bb = Math.min(255, Math.round((bN * 204 + mN * 238 + hN * 241) * bright));
      return `rgb(${rr},${gg},${bb})`;
    },
  },
  {
    id: 'fire',
    label: 'Fire',
    colors: ['#ff1111', '#ff6600', '#ffcc00'],
    getBarColor: (bass, mids, highs, bright) => {
      const total = bass + mids + highs;
      if (total < 0.01) return 'rgb(20,20,20)';
      const bN = bass / total, mN = mids / total, hN = highs / total;
      const rr = Math.min(255, Math.round(255 * bright));
      const gg = Math.min(255, Math.round((bN * 17 + mN * 102 + hN * 204) * bright));
      const bb = Math.min(255, Math.round((bN * 17 + mN * 0 + hN * 0) * bright));
      return `rgb(${rr},${gg},${bb})`;
    },
  },
  {
    id: 'aurora',
    label: 'Aurora',
    colors: ['#8b5cf6', '#06b6d4', '#10b981'],
    getBarColor: (bass, mids, highs, bright) => {
      const total = bass + mids + highs;
      if (total < 0.01) return 'rgb(20,20,20)';
      const bN = bass / total, mN = mids / total, hN = highs / total;
      // Purple=bass, Cyan=mids, Green=highs
      const rr = Math.min(255, Math.round((bN * 139 + mN * 6 + hN * 16) * bright));
      const gg = Math.min(255, Math.round((bN * 92 + mN * 182 + hN * 185) * bright));
      const bb = Math.min(255, Math.round((bN * 246 + mN * 212 + hN * 129) * bright));
      return `rgb(${rr},${gg},${bb})`;
    },
  },
  {
    id: 'mono',
    label: 'Mono',
    colors: ['#aaaaaa', '#cccccc', '#ffffff'],
    getBarColor: (_bass, _mids, _highs, bright) => {
      const v = Math.round(240 * bright);
      return `rgb(${v},${v},${v})`;
    },
  },
];

interface WaveSurferPlayerProps {
  trackId: number;
  trackDuration?: number;
  cuePoints?: CuePoint[];
  beatPositions?: number[]; // timestamps en ms
  onTimeUpdate?: (positionMs: number) => void;
  onSeek?: (positionMs: number) => void;
  onWaveformClick?: (positionMs: number) => void;
  zoom?: number;
  height?: number;
  overviewHeight?: number;
  waveformTheme?: string;
  playerRef?: React.MutableRefObject<{
    playPause: () => void;
    skip: (s: number) => void;
    seekTo: (ms: number) => void;
    setVolume?: (v: number) => void;
    toggleMute?: () => void;
    setLoopIn?: () => void;
    setLoopOut?: () => void;
    toggleLoop?: () => void;
    setLoop?: (inMs: number, outMs: number) => void;
    setPlaybackRate?: (rate: number) => void;
    setEQ?: (low: number, mid: number, high: number) => void;
    getAudio?: () => HTMLAudioElement | null;
  } | null>;
  onLoopChange?: (loopIn: number | null, loopOut: number | null, loopActive: boolean) => void;
  onZoomChange?: (pxPerSec: number) => void;
  onPlay?: () => void;
  mutedStems?: Set<string>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// ── RGB spectral analysis — derivative approach (Rekordbox-style stacked bands) ──
function computeRGBWaveform(buf: AudioBuffer, numBars = 8000): { r: number; g: number; b: number; amp: number }[] {
  const data = buf.getChannelData(0);
  const segLen = Math.max(1, Math.floor(data.length / numBars));

  const bands: { lo: number; mi: number; hi: number; amp: number }[] = new Array(numBars);
  let maxLo = 1e-9,
    maxMi = 1e-9,
    maxHi = 1e-9;

  for (let i = 0; i < numBars; i++) {
    const s = i * segLen;
    const e = Math.min(s + segLen, data.length);
    let lo = 0,
      mi = 0,
      hi = 0,
      peak = 0;
    let prev = s > 0 ? data[s - 1] : 0;
    let prev2 = s > 1 ? data[s - 2] : 0;
    const n = e - s || 1;

    for (let j = s; j < e; j++) {
      const v = data[j];
      const d1 = v - prev;
      const d2 = v - 2 * prev + prev2;
      lo += v * v;
      mi += d1 * d1;
      hi += d2 * d2;
      peak = Math.max(peak, Math.abs(v));
      prev2 = prev;
      prev = v;
    }
    const loR = Math.sqrt(lo / n);
    const miR = Math.sqrt(mi / n);
    const hiR = Math.sqrt(hi / n);
    maxLo = Math.max(maxLo, loR);
    maxMi = Math.max(maxMi, miR);
    maxHi = Math.max(maxHi, hiR);
    bands[i] = { lo: loR, mi: miR, hi: hiR, amp: peak };
  }

  // Return SEPARATE band energies (not mixed) — r=bass, g=mids, b=highs
  return bands.map((c) => {
    const r = Math.pow(c.lo / maxLo, 0.55); // bass
    const g = Math.pow(c.mi / maxMi, 0.55); // mids
    const b = Math.pow(c.hi / maxHi, 0.55); // highs
    return { r, g, b, amp: c.amp };
  });
}

// ── Stem mask — gray-out frequency bands for muted stems on waveform ──
// bass_url → r (red/bass), vocals_url → g (green/mids), other_url → b (blue/highs)
// drums_url → percussive (all bands dimmed)
function applyStemMask(
  r: number, g: number, b: number,
  muted: Set<string>,
): { r: number; g: number; b: number } {
  if (!muted.size) return { r, g, b };
  const GRAY = 0.12;
  let mr = r, mg = g, mb = b;
  if (muted.has('bass_url'))   mr = r * GRAY;
  if (muted.has('vocals_url')) mg = g * GRAY;
  if (muted.has('other_url'))  mb = b * GRAY;
  if (muted.has('drums_url'))  { mr *= 0.4; mg *= 0.4; mb *= 0.4; }
  return { r: mr, g: mg, b: mb };
}

// ── Pre-render full waveform strip to an offscreen canvas (called ONCE) ──
// Each bar = ONE blended color based on frequency content (like Rekordbox)
function preRenderWaveformStrip(
  colors: { r: number; g: number; b: number; amp: number }[],
  stripHeight: number,
  theme: WaveformTheme,
  mutedStems?: Set<string>,
): HTMLCanvasElement {
  const numBars = colors.length;
  const canvas = document.createElement('canvas');
  canvas.width = numBars;
  canvas.height = stripHeight;
  const ctx = canvas.getContext('2d')!;

  const mid = stripHeight / 2;

  const muted = mutedStems ?? new Set<string>();

  for (let i = 0; i < numBars; i++) {
    const raw = colors[i];
    if (raw.amp < 0.003) continue;
    const { r, g, b } = applyStemMask(raw.r, raw.g, raw.b, muted);
    const amp = raw.amp;

    const barH = Math.max(1, amp * mid * 0.92);
    const bright = 0.55 + amp * 0.45;

    // Single blended color per bar (Rekordbox style)
    const color = theme.getBarColor(r, g, b, bright);

    // Top half
    ctx.fillStyle = color;
    ctx.fillRect(i, mid - barH, 1, barH);

    // Bottom mirror (dimmed)
    ctx.globalAlpha = 0.35;
    ctx.fillRect(i, mid + 1, 1, barH * 0.85);
    ctx.globalAlpha = 1;
  }

  return canvas;
}

export default function WaveSurferPlayer({
  trackId,
  trackDuration,
  cuePoints = [],
  beatPositions = [],
  onTimeUpdate,
  onSeek,
  onWaveformClick,
  zoom = 1,
  height = 128,
  overviewHeight = 48,
  waveformTheme = 'spectral',
  playerRef,
  onLoopChange,
  onZoomChange,
  onPlay: onPlayCallback,
  mutedStems,
}: WaveSurferPlayerProps) {
  const wsRef = useRef<any>(null);
  const blobUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevTrackIdRef = useRef<number | null>(null);

  const overviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const detailCanvasRef = useRef<HTMLCanvasElement>(null);
  const overviewContainerRef = useRef<HTMLDivElement>(null);
  const detailContainerRef = useRef<HTMLDivElement>(null);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const currentTimeRef = useRef(0);
  const [duration, setDuration] = useState(trackDuration ?? 0);
  const durationRef = useRef(trackDuration ?? 0);
  useEffect(() => {
    if (trackDuration && duration === 0) {
      setDuration(trackDuration);
      durationRef.current = trackDuration;
    }
  }, [trackDuration]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [muted, setMuted] = useState(false);

  // Loop state
  const [loopIn, setLoopIn] = useState<number | null>(null);
  const [loopOut, setLoopOut] = useState<number | null>(null);
  const [loopActive, setLoopActive] = useState(false);
  const loopInRef = useRef<number | null>(null);
  const loopOutRef = useRef<number | null>(null);
  const loopActiveRef = useRef(false);

  // Spectral data
  const spectralColorsRef = useRef<{ r: number; g: number; b: number; amp: number }[] | null>(null);
  const [spectralReady, setSpectralReady] = useState(false);

  // Stems mute → waveform visual dimming
  const mutedStemsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    mutedStemsRef.current = mutedStems ?? new Set();
  }, [mutedStems]);

  // Raw audio samples (downsampled for smooth waveform at high zoom)
  const rawSamplesRef = useRef<Float32Array | null>(null);
  const rawSampleRateRef = useRef(0); // samples per second in downsampled data

  // Pre-rendered waveform strip (rendered ONCE, blitted every frame)
  const waveformStripRef = useRef<HTMLCanvasElement | null>(null);

  // EQ
  const eqLowRef = useRef<BiquadFilterNode | null>(null);
  const eqMidRef = useRef<BiquadFilterNode | null>(null);
  const eqHighRef = useRef<BiquadFilterNode | null>(null);
  const eqContextRef = useRef<AudioContext | null>(null);

  // Animation
  const rafRef = useRef<number>(0);

  // Zoom: internal visible seconds state (driven by prop + scroll)
  const ZOOM_SEC_MAP: Record<string, number> = { '0.5': 60, '1': 30, '2': 15, '4': 8 };
  const [visibleSeconds, setVisibleSeconds] = useState(ZOOM_SEC_MAP[String(zoom)] ?? 30);
  const visibleSecondsRef = useRef(visibleSeconds);
  useEffect(() => {
    const sec = ZOOM_SEC_MAP[String(zoom)] ?? 30;
    setVisibleSeconds(sec);
    visibleSecondsRef.current = sec;
  }, [zoom]);
  useEffect(() => {
    visibleSecondsRef.current = visibleSeconds;
  }, [visibleSeconds]);

  // Theme ref
  const themeRef = useRef(waveformTheme);
  useEffect(() => {
    themeRef.current = waveformTheme;
  }, [waveformTheme]);

  // BPM
  const bpmRef = useRef<number>(0);

  // Sync refs
  useEffect(() => { loopInRef.current = loopIn; }, [loopIn]);
  useEffect(() => { loopOutRef.current = loopOut; }, [loopOut]);
  useEffect(() => { loopActiveRef.current = loopActive; }, [loopActive]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ── Setup canvas sizes + cache dimensions ──
  const setupCanvasSize = useCallback((canvas: HTMLCanvasElement, container: HTMLDivElement, sizeRef: React.MutableRefObject<{ w: number; h: number }>) => {
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
    sizeRef.current = { w: rect.width, h: rect.height };
    return { width: rect.width, height: rect.height };
  }, []);

  // ── Cached canvas dimensions (avoid getBoundingClientRect every frame) ──
  const overviewSizeRef = useRef({ w: 0, h: 0 });
  const detailSizeRef = useRef({ w: 0, h: 0 });

  // ── Build/rebuild the pre-rendered waveform strip when data or theme changes ──
  const buildStrip = useCallback(() => {
    const colors = spectralColorsRef.current;
    if (!colors) return;
    const theme = WAVEFORM_THEMES.find((t) => t.id === themeRef.current) || WAVEFORM_THEMES[0];
    waveformStripRef.current = preRenderWaveformStrip(colors, 256, theme, mutedStemsRef.current);
  }, []);

  // Rebuild strip when theme or muted stems change
  useEffect(() => {
    if (spectralReady) buildStrip();
  }, [waveformTheme, spectralReady, mutedStems, buildStrip]);

  // ── Animation loop — FAST: just drawImage + lightweight overlays ──
  const renderFrame = useCallback(() => {
    const strip = waveformStripRef.current;
    const dur = durationRef.current;
    if (!strip || dur <= 0) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    let time = currentTimeRef.current;
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      time = audio.currentTime;
      currentTimeRef.current = time;
    }
    const progress = dur > 0 ? time / dur : 0;
    const numBars = strip.width;

    // ── OVERVIEW: drawImage from strip + overlays ──
    const oc = overviewCanvasRef.current;
    const ocSize = overviewSizeRef.current;
    if (oc && ocSize.w > 0) {
      const ctx = oc.getContext('2d')!;
      const w = ocSize.w, h = ocSize.h;
      ctx.clearRect(0, 0, w, h);

      // Blit the pre-rendered strip scaled to overview size
      ctx.drawImage(strip, 0, 0, numBars, 256, 0, 0, w, h);

      // Dim unplayed
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(progress * w, 0, w - progress * w, h);

      // Beat grid — downbeats every 4 beats are brighter
      if (beatPositions.length > 0 && dur > 0) {
        beatPositions.forEach((bMs, idx) => {
          const xPos = (bMs / 1000 / dur) * w;
          const isDownbeat = idx % 4 === 0;
          ctx.strokeStyle = isDownbeat ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
          ctx.lineWidth = isDownbeat ? 1 : 0.5;
          ctx.beginPath();
          ctx.moveTo(xPos, isDownbeat ? 0 : h * 0.6);
          ctx.lineTo(xPos, h);
          ctx.stroke();
        });
      }

      // Cue points
      cuePoints.forEach((c) => {
        const xPos = dur > 0 ? (c.position_ms / 1000 / dur) * w : 0;
        const color = c.color || c.color_rgb || '#f59e0b';
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(xPos - 3, 0); ctx.lineTo(xPos + 3, 0); ctx.lineTo(xPos, 5); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = color + '66'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xPos, 5); ctx.lineTo(xPos, h); ctx.stroke();
      });

      // Red cursor
      const posX = progress * w;
      ctx.strokeStyle = '#ff3333'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(posX, 0); ctx.lineTo(posX, h); ctx.stroke();
    }

    // ── DETAIL: crop strip around current time + overlays ──
    const dc = detailCanvasRef.current;
    const dcSize = detailSizeRef.current;
    if (dc && dcSize.w > 0) {
      const ctx = dc.getContext('2d')!;
      const w = dcSize.w, h = dcSize.h;
      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(0, h / 2, w, 1);

      const visSec = visibleSecondsRef.current;
      const currentT = progress * dur;
      const startTime = currentT - visSec / 2;
      const secPerPx = visSec / w;

      // Beat grid
      const bpm = bpmRef.current;
      if (bpm && bpm > 0) {
        const beatInt = 60 / bpm;
        const barInt = beatInt * 4;
        const firstBeat = Math.floor(Math.max(0, startTime) / beatInt) * beatInt;
        for (let t = firstBeat; t < startTime + visSec; t += beatInt) {
          if (t < 0) continue;
          const x = (t - startTime) / secPerPx;
          if (x < 0 || x >= w) continue;
          const isBar = Math.abs((t / barInt) - Math.round(t / barInt)) < 0.01;
          ctx.strokeStyle = isBar ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
          ctx.lineWidth = isBar ? 1 : 0.5;
          ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); ctx.stroke();
        }
      }

      // Loop region
      const lIn = loopInRef.current, lOut = loopOutRef.current, lAct = loopActiveRef.current;
      if (lIn !== null && lOut !== null && lIn < lOut) {
        const lsx = (lIn - startTime) / secPerPx;
        const lex = (lOut - startTime) / secPerPx;
        const x1 = Math.max(0, lsx), x2 = Math.min(w, lex);
        if (x2 > x1) {
          ctx.fillStyle = lAct ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.08)';
          ctx.fillRect(x1, 0, x2 - x1, h);
          ctx.strokeStyle = lAct ? '#10b981' : '#3b82f6'; ctx.lineWidth = 1.5;
          if (lsx >= 0 && lsx < w) { ctx.beginPath(); ctx.moveTo(lsx, 0); ctx.lineTo(lsx, h); ctx.stroke(); }
          if (lex >= 0 && lex < w) { ctx.beginPath(); ctx.moveTo(lex, 0); ctx.lineTo(lex, h); ctx.stroke(); }
        }
      }

      // ── Waveform rendering: bars (zoomed out) vs smooth wave (zoomed in) ──
      const rawSamples = rawSamplesRef.current;
      const rawRate = rawSampleRateRef.current;
      const samplesPerPixel = rawRate * secPerPx;
      const colors = spectralColorsRef.current;
      const theme = WAVEFORM_THEMES.find((t) => t.id === themeRef.current) || WAVEFORM_THEMES[0];
      const mid = h / 2;

      // Threshold: if we have fewer than ~4 raw samples per pixel, draw smooth wave
      const useSmooth = rawSamples && rawRate > 0 && samplesPerPixel < 4;

      if (useSmooth && rawSamples && colors) {
        // ── SMOOTH WAVEFORM (zoomed in) — draw filled path with spectral colors ──
        // Draw per-pixel: get sample value, draw as filled column with spectral color
        for (let x = 0; x < w; x++) {
          const t = startTime + x * secPerPx;
          if (t < 0 || t > dur) continue;

          // Get raw sample value at this time
          const sampleIdx = Math.floor(t * rawRate);
          if (sampleIdx < 0 || sampleIdx >= rawSamples.length) continue;

          // Interpolate between adjacent samples for smoothness
          const frac = (t * rawRate) - sampleIdx;
          const s0 = rawSamples[sampleIdx];
          const s1 = sampleIdx + 1 < rawSamples.length ? rawSamples[sampleIdx + 1] : s0;
          const sample = s0 + (s1 - s0) * frac;

          // Get spectral color at this position (with stem mask)
          const ci = Math.min(Math.floor((t / dur) * colors.length), colors.length - 1);
          if (ci < 0) continue;
          const masked = applyStemMask(colors[ci].r, colors[ci].g, colors[ci].b, mutedStemsRef.current);
          const bright = 0.6 + Math.abs(sample) * 0.4;
          const color = theme.getBarColor(masked.r, masked.g, masked.b, bright);

          // Draw as filled column from center
          const barH = Math.abs(sample) * mid * 0.92;
          if (barH < 0.5) continue;

          ctx.fillStyle = color;
          if (sample >= 0) {
            ctx.fillRect(x, mid - barH, 1, barH);
          } else {
            ctx.fillRect(x, mid, 1, barH);
          }

          // Mirror (dimmer)
          ctx.globalAlpha = 0.3;
          if (sample >= 0) {
            ctx.fillRect(x, mid + 1, 1, barH * 0.6);
          } else {
            ctx.fillRect(x, mid - barH * 0.6, 1, barH * 0.6);
          }
          ctx.globalAlpha = 1;
        }
      } else {
        // ── BARS (zoomed out) — blit from pre-rendered strip ──
        // rawSrcX can be negative (when near track start, cursor is centered)
        const rawSrcX = (startTime / dur) * numBars;
        const srcW = (visSec / dur) * numBars;
        const clampedSrcX = Math.max(0, rawSrcX);
        const clampedSrcEnd = Math.min(numBars, rawSrcX + srcW);
        const clampedSrcW = clampedSrcEnd - clampedSrcX;

        if (clampedSrcW > 0) {
          // dstX offsets the draw when startTime < 0 (waveform starts mid-screen)
          const dstX = ((clampedSrcX - rawSrcX) / srcW) * w;
          const dstW = (clampedSrcW / srcW) * w;
          ctx.drawImage(strip, clampedSrcX, 0, clampedSrcW, 256, dstX, 0, dstW, h);
        }
      }

      // Beat grid — visible dans la vue détaillée
      if (beatPositions.length > 0) {
        beatPositions.forEach((bMs, idx) => {
          const bT = bMs / 1000;
          const x = (bT - startTime) / secPerPx;
          if (x < -2 || x >= w + 2) return;
          const isDownbeat = idx % 4 === 0;
          ctx.strokeStyle = isDownbeat ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.15)';
          ctx.lineWidth = isDownbeat ? 1 : 0.5;
          ctx.beginPath();
          ctx.moveTo(x, isDownbeat ? 0 : h * 0.55);
          ctx.lineTo(x, h);
          ctx.stroke();
        });
      }

      // Cue points
      cuePoints.forEach((c) => {
        const cueT = c.position_ms / 1000;
        const x = (cueT - startTime) / secPerPx;
        if (x < -5 || x >= w + 5) return;
        const color = c.color || c.color_rgb || '#f59e0b';
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(x - 4, 0); ctx.lineTo(x + 4, 0); ctx.lineTo(x, 6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = color + '55'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x, h); ctx.stroke();
      });

      // Fixed red cursor at center
      const cx = Math.round(w / 2);
      ctx.strokeStyle = '#ff3333'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }, [cuePoints, beatPositions]);

  // ── Start/stop animation ──
  useEffect(() => {
    if (spectralReady) {
      buildStrip();
      if (overviewCanvasRef.current && overviewContainerRef.current) {
        setupCanvasSize(overviewCanvasRef.current, overviewContainerRef.current, overviewSizeRef);
      }
      if (detailCanvasRef.current && detailContainerRef.current) {
        setupCanvasSize(detailCanvasRef.current, detailContainerRef.current, detailSizeRef);
      }
      rafRef.current = requestAnimationFrame(renderFrame);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [spectralReady, renderFrame, setupCanvasSize, buildStrip]);

  // Resize handler (debounced 150ms to avoid thrashing canvas on every pixel)
  useEffect(() => {
    let rafId = 0;
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (overviewCanvasRef.current && overviewContainerRef.current)
          setupCanvasSize(overviewCanvasRef.current, overviewContainerRef.current, overviewSizeRef);
        if (detailCanvasRef.current && detailContainerRef.current)
          setupCanvasSize(detailCanvasRef.current, detailContainerRef.current, detailSizeRef);
      });
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => { window.removeEventListener('resize', handleResize); cancelAnimationFrame(rafId); };
  }, [setupCanvasSize]);

  // ── Audio element ref (replaces wavesurfer) ──
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Init audio engine (native <audio> — no wavesurfer, no timeout) ──
  useEffect(() => {
    let destroyed = false;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = volumeRef.current;
    audioRef.current = audio;
    wsRef.current = audio; // keep wsRef for compat

    const onLoadedMetadata = () => {
      if (destroyed) return;
      const dur = audio.duration || 0;
      setDuration(dur);
      durationRef.current = dur;
      setIsReady(true);
      setLoading(false);
      setError(null);

      // Setup EQ
      try {
        if (!eqContextRef.current) {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const source = audioCtx.createMediaElementSource(audio);
          const lowFilter = audioCtx.createBiquadFilter();
          lowFilter.type = 'lowshelf'; lowFilter.frequency.value = 250; lowFilter.gain.value = 0;
          const midFilter = audioCtx.createBiquadFilter();
          midFilter.type = 'peaking'; midFilter.frequency.value = 1000; midFilter.Q.value = 1; midFilter.gain.value = 0;
          const highFilter = audioCtx.createBiquadFilter();
          highFilter.type = 'highshelf'; highFilter.frequency.value = 4000; highFilter.gain.value = 0;
          source.connect(lowFilter).connect(midFilter).connect(highFilter).connect(audioCtx.destination);
          eqLowRef.current = lowFilter;
          eqMidRef.current = midFilter;
          eqHighRef.current = highFilter;
          eqContextRef.current = audioCtx;
        }
      } catch {}
    };

    const onPlay = () => { if (!destroyed) { setIsPlaying(true); eqContextRef.current?.resume().catch(() => {}); onPlayCallback?.(); } };
    const onPause = () => { if (!destroyed) setIsPlaying(false); };
    const onEnded = () => { if (!destroyed) setIsPlaying(false); };
    let lastExternalUpdate = 0;
    const handleTimeUpdate = () => {
      if (destroyed) return;
      const t = audio.currentTime;
      currentTimeRef.current = t;
      setCurrentTime(t);
      // Throttle external callback to 100ms to avoid excessive parent re-renders
      const now = performance.now();
      if (now - lastExternalUpdate > 100) { lastExternalUpdate = now; onTimeUpdate?.(t * 1000); }
      // Loop enforcement
      if (loopActiveRef.current && typeof loopInRef.current === 'number' && typeof loopOutRef.current === 'number' && loopInRef.current < loopOutRef.current && t >= loopOutRef.current) {
        audio.currentTime = loopInRef.current;
      }
    };
    const onError = () => {
      if (!destroyed) {
        setError('Audio non disponible');
        setLoading(false);
      }
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('error', onError);

    // Expose controls to parent
    if (playerRef) {
      playerRef.current = {
        playPause: () => { audio.paused ? audio.play().catch(() => {}) : audio.pause(); },
        skip: (s: number) => { audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + s)); },
        seekTo: (ms: number) => { audio.currentTime = Math.max(0, Math.min(audio.duration || 0, ms / 1000)); },
        setVolume: (v: number) => {
          const vol = Math.max(0, Math.min(1, v));
          setVolumeState(vol);
          volumeRef.current = vol;
          audio.volume = vol;
        },
        toggleMute: () => {
          setMuted((prev) => {
            const next = !prev;
            audio.volume = next ? 0 : volumeRef.current || 0.8;
            return next;
          });
        },
        setLoopIn: () => {
          const t = currentTimeRef.current;
          setLoopIn(t); loopInRef.current = t;
        },
        setLoopOut: () => {
          const t = currentTimeRef.current;
          setLoopOut(t); loopOutRef.current = t;
          if (loopInRef.current !== null && t > loopInRef.current) {
            setLoopActive(true); loopActiveRef.current = true;
          }
        },
        toggleLoop: () => {
          if (loopInRef.current !== null && loopOutRef.current !== null && loopInRef.current < loopOutRef.current) {
            setLoopActive((prev) => { const next = !prev; loopActiveRef.current = next; return next; });
          }
        },
        setLoop: (inMs: number, outMs: number) => {
          const inSec = inMs / 1000; const outSec = outMs / 1000;
          setLoopIn(inSec); setLoopOut(outSec);
          loopInRef.current = inSec; loopOutRef.current = outSec;
          setLoopActive(true); loopActiveRef.current = true;
          audio.currentTime = inSec;
        },
        setPlaybackRate: (rate: number) => { audio.playbackRate = rate; },
        setEQ: (low: number, mid: number, high: number) => {
          if (eqLowRef.current) eqLowRef.current.gain.value = low;
          if (eqMidRef.current) eqMidRef.current.gain.value = mid;
          if (eqHighRef.current) eqHighRef.current.gain.value = high;
          eqContextRef.current?.resume().catch(() => {});
        },
        getAudio: () => audio,
      };
    }

    loadAudio(trackId, audio);
    prevTrackIdRef.current = trackId;

    return () => {
      destroyed = true;
      abortRef.current?.abort();
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('error', onError);
      audio.src = '';
      audioRef.current = null;
      wsRef.current = null;
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      if (playerRef) playerRef.current = null;
      try { eqContextRef.current?.close(); } catch {}
      eqContextRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load audio (native) ──
  const loadAudio = useCallback(async (id: number, audio: HTMLAudioElement) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }

    setIsReady(false); setLoading(true); setError(null);
    setCurrentTime(0); currentTimeRef.current = 0; setIsPlaying(false);
    spectralColorsRef.current = null; setSpectralReady(false);
    setLoopIn(null); setLoopOut(null); setLoopActive(false);
    loopInRef.current = null; loopOutRef.current = null; loopActiveRef.current = false;

    try {
      const token = getToken();
      const audioUrl = token
        ? `${API_URL}/tracks/${id}/audio?format=ogg&token=${encodeURIComponent(token)}`
        : `${API_URL}/tracks/${id}/audio?format=ogg`;

      const downloadTimeout = setTimeout(() => {
        if (!abort.signal.aborted) {
          abort.abort(); setError('Chargement trop long — réessayez'); setLoading(false);
        }
      }, 60000);

      const res = await fetch(audioUrl, {
        signal: abort.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      clearTimeout(downloadTimeout);
      if (abort.signal.aborted) return;

      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      // Set audio source — this triggers loadedmetadata when ready
      audio.src = url;

      // Decode for spectral waveform (in parallel, doesn't block playback)
      try {
        const arrayBuffer = await blob.arrayBuffer();
        if (abort.signal.aborted) return;
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        await audioCtx.resume();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        audioCtx.close().catch(() => {});
        if (abort.signal.aborted) return;
        // Fallback: set duration from decoded buffer if not yet available
        if (!durationRef.current || durationRef.current <= 0) {
          durationRef.current = decoded.duration;
          setDuration(decoded.duration);
        }

        const rgbColors = computeRGBWaveform(decoded);
        spectralColorsRef.current = rgbColors;

        // Downsample raw audio for smooth waveform at high zoom (~4000 samples/sec)
        const rawData = decoded.getChannelData(0);
        const targetRate = 4000; // samples per second
        const factor = Math.max(1, Math.floor(decoded.sampleRate / targetRate));
        const dsLen = Math.ceil(rawData.length / factor);
        const downsampled = new Float32Array(dsLen);
        for (let i = 0; i < dsLen; i++) {
          // Peak value in each chunk (preserves waveform shape)
          const start = i * factor;
          const end = Math.min(start + factor, rawData.length);
          let peak = 0;
          for (let j = start; j < end; j++) {
            const v = rawData[j];
            if (Math.abs(v) > Math.abs(peak)) peak = v;
          }
          downsampled[i] = peak;
        }
        rawSamplesRef.current = downsampled;
        rawSampleRateRef.current = decoded.sampleRate / factor;

        setSpectralReady(true);
      } catch (e) {
        // Spectral computation failed — audio still plays
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      if (id < 0) { setLoading(false); setIsReady(true); }
      else { setError('Fichier audio introuvable'); setLoading(false); }
    }
  }, []);

  // Track change
  useEffect(() => {
    if (!audioRef.current || prevTrackIdRef.current === trackId) return;
    prevTrackIdRef.current = trackId;
    loadAudio(trackId, audioRef.current);
  }, [trackId, loadAudio]);

  // ── Drag-to-scrub state ──
  const isDraggingOverview = useRef(false);
  const isDraggingDetail = useRef(false);

  // ── Overview: mousedown starts drag, mousemove scrubs, mouseup ends ──
  const seekOverviewAt = useCallback((clientX: number, container: HTMLDivElement) => {
    const audio = audioRef.current;
    if (!audio) return;
    const rect = container.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = progress * durationRef.current;
    currentTimeRef.current = audio.currentTime;
    onSeek?.(audio.currentTime * 1000);
  }, [onSeek]);

  const handleOverviewMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isReady) return;
    e.preventDefault();
    isDraggingOverview.current = true;
    const container = e.currentTarget;
    seekOverviewAt(e.clientX, container);

    const onMove = (ev: MouseEvent) => {
      if (isDraggingOverview.current) seekOverviewAt(ev.clientX, container);
    };
    const onUp = () => {
      isDraggingOverview.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [isReady, seekOverviewAt]);

  // ── Detail: mousedown starts drag, mousemove scrubs, mouseup ends ──
  const seekDetailAt = useCallback((clientX: number, container: HTMLDivElement) => {
    const audio = audioRef.current;
    if (!audio) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const secPerPx = visibleSecondsRef.current / rect.width;
    const startTime = currentTimeRef.current - visibleSecondsRef.current / 2;
    const clickTime = startTime + x * secPerPx;
    const dur = durationRef.current;
    if (dur > 0) {
      const seekTime = Math.max(0, Math.min(dur, clickTime));
      audio.currentTime = seekTime;
      currentTimeRef.current = seekTime;
      onSeek?.(seekTime * 1000);
      onWaveformClick?.(seekTime * 1000);
    }
  }, [onSeek, onWaveformClick]);

  const handleDetailMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isReady) return;
    e.preventDefault();
    isDraggingDetail.current = true;
    const container = e.currentTarget;
    seekDetailAt(e.clientX, container);

    const onMove = (ev: MouseEvent) => {
      if (isDraggingDetail.current) seekDetailAt(ev.clientX, container);
    };
    const onUp = () => {
      isDraggingDetail.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [isReady, seekDetailAt]);

  // ── Zoom: Ctrl+Scroll OR Mac trackpad pinch-to-zoom ──
  // On Mac, pinch-to-zoom fires wheel events with ctrlKey=true (synthetic)
  // We also listen for gesturestart/gesturechange for Safari
  useEffect(() => {
    const el = detailContainerRef.current;
    if (!el) return;

    // Wheel handler (works for Ctrl+Scroll AND Mac trackpad pinch in Chrome)
    const wheelHandler = (e: WheelEvent) => {
      // Mac trackpad pinch sends ctrlKey=true with fractional deltaY
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      setVisibleSeconds((prev) => {
        const factor = Math.abs(e.deltaY) < 10 ? 1.08 : 1.25; // smaller steps for trackpad
        const next = e.deltaY > 0
          ? Math.min(prev * factor, 120)  // zoom out
          : Math.max(prev / factor, 3);   // zoom in
        return next;
      });
    };

    // Gesture handler for Safari trackpad
    let lastScale = 1;
    const gestureStart = (e: any) => { e.preventDefault(); lastScale = 1; };
    const gestureChange = (e: any) => {
      e.preventDefault();
      const scale = e.scale as number;
      setVisibleSeconds((prev) => {
        const factor = scale > lastScale ? 0.97 : 1.03;
        lastScale = scale;
        return Math.max(3, Math.min(120, prev * factor));
      });
    };

    el.addEventListener('wheel', wheelHandler, { passive: false });
    el.addEventListener('gesturestart', gestureStart as any, { passive: false });
    el.addEventListener('gesturechange', gestureChange as any, { passive: false });
    return () => {
      el.removeEventListener('wheel', wheelHandler);
      el.removeEventListener('gesturestart', gestureStart as any);
      el.removeEventListener('gesturechange', gestureChange as any);
    };
  }, []);

  // Loop state sync
  useEffect(() => {
    onLoopChange?.(loopIn, loopOut, loopActive);
  }, [loopIn, loopOut, loopActive, onLoopChange]);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.paused ? a.play().catch(() => {}) : a.pause();
  }, []);
  const skipBack = useCallback(() => {
    const a = audioRef.current;
    if (a) a.currentTime = Math.max(0, a.currentTime - 10);
  }, []);
  const skipFwd = useCallback(() => {
    const a = audioRef.current;
    if (a) a.currentTime = Math.min(a.duration || 0, a.currentTime + 10);
  }, []);

  const volumeRef = useRef(0.8);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value) / 100;
    setVolumeState(vol);
    volumeRef.current = vol;
    if (audioRef.current) audioRef.current.volume = vol;
    setMuted(false);
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (audioRef.current) audioRef.current.volume = next ? 0 : volumeRef.current || 0.8;
      return next;
    });
  }, []);

  return (
    <div className="w-full">
      {/* ── OVERVIEW ── */}
      <div
        ref={overviewContainerRef}
        className="relative bg-black rounded-t-lg overflow-hidden cursor-pointer"
        style={{ height: overviewHeight, minHeight: overviewHeight }}
        title="Vue d'ensemble — clic/drag = naviguer"
        onMouseDown={handleOverviewMouseDown}
      >
        <canvas ref={overviewCanvasRef} className="absolute inset-0 w-full h-full" />
        <div className="absolute top-0.5 left-1.5 text-[8px] text-white/20 pointer-events-none select-none font-mono uppercase tracking-wider">
          Overview
        </div>
      </div>

      <div className="h-[1px] bg-white/10" />

      {/* ── DETAIL ── */}
      <div
        ref={detailContainerRef}
        className="relative bg-black rounded-b-lg overflow-hidden cursor-crosshair"
        style={{ height, minHeight: height }}
        title="Clic/drag = seek · Ctrl+Scroll = zoom"
        onMouseDown={handleDetailMouseDown}
      >
        <canvas ref={detailCanvasRef} className="absolute inset-0 w-full h-full" />

        {loading && !isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span>Chargement…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400">{error}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setError(null);
                  if (audioRef.current) loadAudio(trackId, audioRef.current);
                }}
                className="text-[10px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}

        {loopActive && (
          <div className="absolute top-1 left-2 flex items-center gap-1 pointer-events-none">
            <span className="text-[9px] bg-emerald-500/80 text-white px-1.5 py-0.5 rounded font-bold">LOOP</span>
          </div>
        )}
      </div>

      {/* ── Controls bar ── */}
      <div className="flex items-center gap-3 mt-2 px-1">
        {/* Time display */}
        <span className="text-[11px] text-[var(--text-primary)] font-mono tabular-nums w-9 text-right">
          {fmt(currentTime)}
        </span>
        <span className="text-[11px] text-[var(--text-muted)] font-mono">/ {fmt(duration)}</span>

        {/* Transport buttons */}
        <div className="flex items-center gap-1.5 ml-1">
          <button
            onClick={skipBack}
            disabled={!isReady}
            title="-10s"
            className="w-8 h-8 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <SkipBack size={14} />
          </button>
          <button
            onClick={togglePlay}
            disabled={!isReady}
            title={isPlaying ? 'Pause' : 'Play'}
            className={`w-9 h-9 rounded-full text-white text-sm border-none cursor-pointer flex items-center justify-center transition-all disabled:opacity-40 shadow-lg ${
              isPlaying
                ? 'bg-orange-500 hover:bg-orange-400'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {isPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" />}
          </button>
          <button
            onClick={skipFwd}
            disabled={!isReady}
            title="+10s"
            className="w-8 h-8 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <SkipForward size={14} />
          </button>
        </div>

        <div className="flex-1" />

        {/* Volume */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleToggleMute}
            disabled={!isReady}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5 disabled:opacity-40"
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            defaultValue={80}
            onChange={handleVolumeChange}
            disabled={!isReady}
            className="w-20 h-1.5 rounded-full appearance-none cursor-pointer"
            title="Volume"
          />
        </div>
      </div>
    </div>
  );
}
