'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
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

export const WAVEFORM_THEMES: WaveformTheme[] = [
  {
    id: 'spectral',
    label: 'Spectral',
    colors: ['#ef4444', '#22c55e', '#3b82f6'],
    getBarColor: (r, g, b, bright) => `rgb(${Math.min(255,Math.round(r*bright))},${Math.min(255,Math.round(g*bright))},${Math.min(255,Math.round(b*bright))})`,
  },
  {
    id: 'neon',
    label: '🌆 Neon',
    colors: ['#ff00ff', '#00ffff', '#ffff00'],
    getBarColor: (r, g, b, bright) => {
      const hue = (r * 0.33 + g * 0.5 + b * 0.17) * 360;
      return `hsl(${hue % 360},100%,${40 + bright * 30}%)`;
    },
  },
  {
    id: 'sunset',
    label: '🌅 Sunset',
    colors: ['#ff4500', '#ff8c00', '#ffd700'],
    getBarColor: (r, g, b, bright) => {
      const rr = Math.min(255, Math.round((r * 0.8 + g * 0.2) * bright * 255));
      const gg = Math.min(255, Math.round((g * 0.5 + b * 0.1) * bright * 180));
      return `rgb(${rr},${gg},30)`;
    },
  },
  {
    id: 'ocean',
    label: '🌊 Ocean',
    colors: ['#0ea5e9', '#22d3ee', '#6366f1'],
    getBarColor: (r, g, b, bright) => {
      const rr = Math.min(255, Math.round(g * 40 * bright));
      const gg = Math.min(255, Math.round((g * 0.5 + b * 0.5) * 200 * bright));
      const bb = Math.min(255, Math.round((b * 0.7 + r * 0.3) * 255 * bright));
      return `rgb(${rr},${gg},${bb})`;
    },
  },
  {
    id: 'forest',
    label: '🌿 Forest',
    colors: ['#22c55e', '#84cc16', '#10b981'],
    getBarColor: (r, g, b, bright) => {
      const rr = Math.min(255, Math.round(r * 60 * bright));
      const gg = Math.min(255, Math.round((g * 0.7 + b * 0.3) * 255 * bright));
      const bb = Math.min(255, Math.round(b * 80 * bright));
      return `rgb(${rr},${gg},${bb})`;
    },
  },
  {
    id: 'fire',
    label: '🔥 Fire',
    colors: ['#ef4444', '#f97316', '#fbbf24'],
    getBarColor: (r, g, b, bright) => {
      const rr = Math.min(255, Math.round((r * 0.7 + g * 0.3) * 255 * bright));
      const gg = Math.min(255, Math.round(g * 150 * bright));
      return `rgb(${rr},${gg},0)`;
    },
  },
  {
    id: 'aurora',
    label: '🌌 Aurora',
    colors: ['#8b5cf6', '#06b6d4', '#10b981'],
    getBarColor: (r, g, b, bright) => {
      const t = (r + g * 2 + b * 3) / 6;
      const rr = Math.min(255, Math.round((1 - t) * 139 * bright));
      const gg = Math.min(255, Math.round(t * 200 * bright));
      const bb = Math.min(255, Math.round((0.5 + t * 0.5) * 200 * bright));
      return `rgb(${rr},${gg},${bb})`;
    },
  },
];

interface WaveSurferPlayerProps {
  trackId: number;
  trackDuration?: number;
  cuePoints?: CuePoint[];
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
    setPlaybackRate?: (rate: number) => void;
    setEQ?: (low: number, mid: number, high: number) => void;
  } | null>;
  onLoopChange?: (loopIn: number | null, loopOut: number | null, loopActive: boolean) => void;
  onZoomChange?: (pxPerSec: number) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// Zoom levels: how many seconds of audio are visible in the detail waveform
const ZOOM_SECONDS: Record<string, number> = {
  '0.5': 60,
  '1':   30,
  '2':   15,
  '4':   8,
};

// ── RGB spectral analysis — derivative approach ──
function computeRGBWaveform(buf: AudioBuffer, numBars = 4000): {r:number,g:number,b:number,amp:number}[] {
  const data = buf.getChannelData(0);
  const segLen = Math.max(1, Math.floor(data.length / numBars));

  const bands: {lo:number,mi:number,hi:number,amp:number}[] = new Array(numBars);
  let maxLo = 1e-9, maxMi = 1e-9, maxHi = 1e-9;

  for (let i = 0; i < numBars; i++) {
    const s = i * segLen;
    const e = Math.min(s + segLen, data.length);
    let lo = 0, mi = 0, hi = 0, peak = 0;
    let prev = s > 0 ? data[s - 1] : 0;
    let prev2 = s > 1 ? data[s - 2] : 0;
    const n = e - s || 1;

    for (let j = s; j < e; j++) {
      const v  = data[j];
      const d1 = v - prev;
      const d2 = v - 2 * prev + prev2;
      lo += v  * v;
      mi += d1 * d1;
      hi += d2 * d2;
      peak = Math.max(peak, Math.abs(v));
      prev2 = prev;
      prev  = v;
    }
    const loR = Math.sqrt(lo / n);
    const miR = Math.sqrt(mi / n);
    const hiR = Math.sqrt(hi / n);
    maxLo = Math.max(maxLo, loR);
    maxMi = Math.max(maxMi, miR);
    maxHi = Math.max(maxHi, hiR);
    bands[i] = { lo: loR, mi: miR, hi: hiR, amp: peak };
  }

  return bands.map(c => {
    const lo = c.lo / maxLo;
    const mi = c.mi / maxMi;
    const hi = c.hi / maxHi;

    const loP = Math.pow(lo, 0.65);
    const miP = Math.pow(mi, 0.65);
    const hiP = Math.pow(hi, 0.65);

    const r = Math.min(255, Math.round(loP * 255 + miP * 60 + hiP * 30));
    const g = Math.min(255, Math.round(miP * 200 + hiP * 120 + loP * 20));
    const b = Math.min(255, Math.round(hiP * 255 + loP * 60 + miP * 40));

    return { r, g, b, amp: c.amp };
  });
}

// ── Draw overview waveform (full track, thin bar) ──
function drawOverview(
  ctx: CanvasRenderingContext2D,
  colors: {r:number,g:number,b:number,amp:number}[],
  width: number,
  height: number,
  progress: number, // 0-1
  cuePoints: CuePoint[],
  duration: number,
) {
  ctx.clearRect(0, 0, width, height);

  const mid = height / 2;
  const numBars = colors.length;

  // Draw waveform bars
  for (let x = 0; x < width; x++) {
    const ci = Math.min(Math.floor((x / width) * numBars), numBars - 1);
    const { r, g, b, amp } = colors[ci];
    if (amp < 0.003) continue;

    const barH = Math.max(1, amp * mid * 0.92);
    const bright = 0.6 + amp * 0.4;

    const rr = Math.min(255, Math.round(r * bright));
    const gg = Math.min(255, Math.round(g * bright));
    const bb = Math.min(255, Math.round(b * bright));

    // Top half
    ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
    ctx.fillRect(x, mid - barH, 1, barH);

    // Bottom mirror (lower opacity)
    ctx.fillStyle = `rgba(${rr},${gg},${bb},0.4)`;
    ctx.fillRect(x, mid + 1, 1, barH * 0.85);
  }

  // Draw cue point markers
  cuePoints.forEach((c) => {
    const xPos = duration > 0 ? (c.position_ms / 1000 / duration) * width : 0;
    const color = c.color || c.color_rgb || '#f59e0b';
    ctx.fillStyle = color;
    // Small triangle at top
    ctx.beginPath();
    ctx.moveTo(xPos - 3, 0);
    ctx.lineTo(xPos + 3, 0);
    ctx.lineTo(xPos, 5);
    ctx.closePath();
    ctx.fill();
    // Thin vertical line
    ctx.strokeStyle = color + '66';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xPos, 5);
    ctx.lineTo(xPos, height);
    ctx.stroke();
  });

  // Playback position line
  const posX = progress * width;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(posX, 0);
  ctx.lineTo(posX, height);
  ctx.stroke();

  // Played section overlay (subtle dimming of unplayed area)
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(posX, 0, width - posX, height);
}

// ── Draw zoomed detail waveform (cursor fixed at center, waveform scrolls) ──
function drawDetail(
  ctx: CanvasRenderingContext2D,
  colors: {r:number,g:number,b:number,amp:number}[],
  width: number,
  height: number,
  progress: number, // 0-1
  duration: number,
  visibleSeconds: number,
  cuePoints: CuePoint[],
  bpm?: number,
) {
  ctx.clearRect(0, 0, width, height);

  const mid = height / 2;
  const numBars = colors.length;
  const currentTime = progress * duration;

  // How many seconds each pixel represents
  const secPerPx = visibleSeconds / width;
  const startTime = currentTime - visibleSeconds / 2;

  // Centre axis line
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, mid, width, 1);

  // Draw beat grid lines if BPM is known
  if (bpm && bpm > 0) {
    const beatInterval = 60 / bpm; // seconds per beat
    const barInterval = beatInterval * 4; // seconds per bar (4 beats)
    const firstBar = Math.floor(startTime / barInterval) * barInterval;

    ctx.lineWidth = 1;
    for (let t = firstBar; t < startTime + visibleSeconds; t += beatInterval) {
      if (t < 0) continue;
      const x = (t - startTime) / secPerPx;
      if (x < 0 || x >= width) continue;

      const isBar = Math.abs(t / barInterval - Math.round(t / barInterval)) < 0.01;
      if (isBar) {
        // Bar line — brighter
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
      } else {
        // Beat line — subtle
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 0.5;
      }
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, height);
      ctx.stroke();
    }
  }

  // Draw waveform
  for (let x = 0; x < width; x++) {
    const t = startTime + x * secPerPx;
    if (t < 0 || t > duration) continue;

    const ci = Math.min(Math.floor((t / duration) * numBars), numBars - 1);
    if (ci < 0 || ci >= numBars) continue;
    const { r, g, b, amp } = colors[ci];
    if (amp < 0.003) continue;

    const barH = Math.max(1, amp * mid * 0.92);
    const bright = 0.55 + amp * 0.45;

    const rr = Math.min(255, Math.round(r * bright));
    const gg = Math.min(255, Math.round(g * bright));
    const bb = Math.min(255, Math.round(b * bright));

    // Top half
    ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
    ctx.fillRect(x, mid - barH, 1, barH);

    // Bottom mirror
    ctx.fillStyle = `rgba(${rr},${gg},${bb},0.4)`;
    ctx.fillRect(x, mid + 1, 1, barH * 0.85);
  }

  // Draw cue point markers on detail
  cuePoints.forEach((c) => {
    const cueTime = c.position_ms / 1000;
    const x = (cueTime - startTime) / secPerPx;
    if (x < 0 || x >= width) return;

    const color = c.color || c.color_rgb || '#f59e0b';
    // Triangle marker at top
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 4, 0);
    ctx.lineTo(x + 4, 0);
    ctx.lineTo(x, 6);
    ctx.closePath();
    ctx.fill();
    // Vertical line
    ctx.strokeStyle = color + '55';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x, height);
    ctx.stroke();
  });

  // Fixed cursor at center (red line like Rekordbox)
  const centerX = Math.round(width / 2);
  ctx.strokeStyle = '#ff3333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX, 0);
  ctx.lineTo(centerX, height);
  ctx.stroke();

  // Small time indicator near cursor
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  const mins = Math.floor(currentTime / 60);
  const secs = Math.floor(currentTime % 60);
  const ms = Math.floor((currentTime % 1) * 10);
  ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}.${ms}`, centerX, height - 3);
}


export default function WaveSurferPlayer({
  trackId,
  trackDuration,
  cuePoints = [],
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
}: WaveSurferPlayerProps) {
  // Audio engine ref (wavesurfer for audio only)
  const wsRef = useRef<any>(null);
  const blobUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevTrackIdRef = useRef<number | null>(null);

  // Canvas refs
  const overviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const detailCanvasRef = useRef<HTMLCanvasElement>(null);
  const overviewContainerRef = useRef<HTMLDivElement>(null);
  const detailContainerRef = useRef<HTMLDivElement>(null);

  // State
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
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [loopIn, setLoopIn] = useState<number | null>(null);
  const [loopOut, setLoopOut] = useState<number | null>(null);
  const [loopActive, setLoopActive] = useState(false);
  const loopInRef = useRef<number | null>(null);
  const loopOutRef = useRef<number | null>(null);
  const loopActiveRef = useRef(false);

  // Spectral data
  const spectralColorsRef = useRef<{r:number,g:number,b:number,amp:number}[] | null>(null);
  const [spectralReady, setSpectralReady] = useState(false);

  // EQ nodes
  const eqLowRef = useRef<BiquadFilterNode | null>(null);
  const eqMidRef = useRef<BiquadFilterNode | null>(null);
  const eqHighRef = useRef<BiquadFilterNode | null>(null);
  const eqContextRef = useRef<AudioContext | null>(null);

  // Animation
  const rafRef = useRef<number>(0);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // Sync refs
  useEffect(() => { loopInRef.current = loopIn; }, [loopIn]);
  useEffect(() => { loopOutRef.current = loopOut; }, [loopOut]);
  useEffect(() => { loopActiveRef.current = loopActive; }, [loopActive]);

  // Track BPM from metadata (could be passed as prop later)
  const bpmRef = useRef<number>(0);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ── Setup canvas sizes ──
  const setupCanvasSize = useCallback((canvas: HTMLCanvasElement, container: HTMLDivElement) => {
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
    return { width: rect.width, height: rect.height };
  }, []);

  // ── Animation loop — redraws both canvases ──
  const renderFrame = useCallback(() => {
    const colors = spectralColorsRef.current;
    if (!colors) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    const ws = wsRef.current;
    const dur = durationRef.current;
    let time = currentTimeRef.current;

    // Get real-time position from wavesurfer
    if (ws) {
      try {
        const t = ws.getCurrentTime?.();
        if (typeof t === 'number' && t >= 0) {
          time = t;
          currentTimeRef.current = t;
        }
      } catch {}
    }

    const progress = dur > 0 ? time / dur : 0;

    // Draw overview
    const overviewCanvas = overviewCanvasRef.current;
    const overviewContainer = overviewContainerRef.current;
    if (overviewCanvas && overviewContainer) {
      const ctx = overviewCanvas.getContext('2d');
      if (ctx) {
        const rect = overviewContainer.getBoundingClientRect();
        drawOverview(ctx, colors, rect.width, rect.height, progress, cuePoints, dur);
      }
    }

    // Draw detail
    const detailCanvas = detailCanvasRef.current;
    const detailContainer = detailContainerRef.current;
    if (detailCanvas && detailContainer) {
      const ctx = detailCanvas.getContext('2d');
      if (ctx) {
        const rect = detailContainer.getBoundingClientRect();
        const visibleSec = ZOOM_SECONDS[String(zoomRef.current)] ?? 30;
        drawDetail(ctx, colors, rect.width, rect.height, progress, dur, visibleSec, cuePoints, bpmRef.current);
      }
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }, [cuePoints]);

  // ── Start/stop animation loop ──
  useEffect(() => {
    if (spectralReady) {
      // Setup canvas sizes
      if (overviewCanvasRef.current && overviewContainerRef.current) {
        setupCanvasSize(overviewCanvasRef.current, overviewContainerRef.current);
      }
      if (detailCanvasRef.current && detailContainerRef.current) {
        setupCanvasSize(detailCanvasRef.current, detailContainerRef.current);
      }
      rafRef.current = requestAnimationFrame(renderFrame);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [spectralReady, renderFrame, setupCanvasSize]);

  // ── Handle window resize ──
  useEffect(() => {
    const handleResize = () => {
      if (overviewCanvasRef.current && overviewContainerRef.current) {
        setupCanvasSize(overviewCanvasRef.current, overviewContainerRef.current);
      }
      if (detailCanvasRef.current && detailContainerRef.current) {
        setupCanvasSize(detailCanvasRef.current, detailContainerRef.current);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setupCanvasSize]);

  // ── Init WaveSurfer (audio engine only, no rendering) ──
  useEffect(() => {
    let destroyed = false;

    (async () => {
      try {
        const WaveSurfer = (await import('wavesurfer.js')).default;
        if (destroyed) return;

        const ws = WaveSurfer.create({
          container: document.createElement('div'), // hidden — no visual
          height: 0,
          normalize: true,
          interact: false,
          cursorWidth: 0,
          waveColor: 'transparent',
          progressColor: 'transparent',
          barWidth: 0,
          backend: 'MediaElement',
        });

        ws.on('ready', (dur: number) => {
          if (destroyed) return;
          console.log(`[CueForge] WaveSurfer ready — duration: ${dur}s`);
          setDuration(dur);
          durationRef.current = dur;
          setIsReady(true);
          setLoading(false);
          setError(null);

          // Setup EQ
          try {
            const mediaEl = ws.getMediaElement?.();
            if (mediaEl && !eqContextRef.current) {
              const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
              const source = audioCtx.createMediaElementSource(mediaEl);
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
        });

        ws.on('play', () => {
          if (!destroyed) {
            setIsPlaying(true);
            eqContextRef.current?.resume().catch(() => {});
          }
        });
        ws.on('pause', () => !destroyed && setIsPlaying(false));
        ws.on('finish', () => !destroyed && setIsPlaying(false));
        ws.on('timeupdate', (t: number) => {
          if (destroyed) return;
          currentTimeRef.current = t;
          setCurrentTime(t);
          onTimeUpdate?.(t * 1000);
          if (loopActiveRef.current && typeof loopInRef.current === 'number' && typeof loopOutRef.current === 'number' && loopInRef.current < loopOutRef.current && t >= loopOutRef.current) {
            const dur = ws.getDuration();
            if (dur > 0) ws.seekTo(loopInRef.current / dur);
          }
        });
        ws.on('error', (err: any) => {
          if (!destroyed) {
            console.warn('WaveSurfer error:', err);
            setError('Audio non disponible');
            setLoading(false);
          }
        });

        wsRef.current = ws;

        // Expose controls to parent
        if (playerRef) {
          playerRef.current = {
            playPause: () => ws.playPause(),
            skip: (s: number) => ws.skip(s),
            seekTo: (ms: number) => {
              const dur = ws.getDuration();
              if (dur > 0) ws.seekTo(Math.max(0, Math.min(1, ms / 1000 / dur)));
            },
            setVolume: (v: number) => {
              const vol = Math.max(0, Math.min(1, v));
              setVolume(vol);
              ws.setVolume(vol);
              if (vol > 0 && muted) setMuted(false);
            },
            toggleMute: () => {
              const next = !muted;
              setMuted(next);
              ws.setVolume(next ? 0 : volume);
            },
            setLoopIn: () => { setLoopIn(currentTimeRef.current); },
            setLoopOut: () => {
              const t = currentTimeRef.current;
              setLoopOut(t);
              if (loopInRef.current !== null && t > loopInRef.current) setLoopActive(true);
            },
            toggleLoop: () => {
              if (loopInRef.current !== null && loopOutRef.current !== null && loopInRef.current < loopOutRef.current) {
                setLoopActive(prev => !prev);
              }
            },
            setLoop: (inMs: number, outMs: number) => {
              const inSec = inMs / 1000;
              const outSec = outMs / 1000;
              setLoopIn(inSec); setLoopOut(outSec);
              loopInRef.current = inSec; loopOutRef.current = outSec;
              setLoopActive(true); loopActiveRef.current = true;
              const dur = ws.getDuration();
              if (dur > 0) ws.seekTo(Math.max(0, Math.min(1, inSec / dur)));
            },
            setPlaybackRate: (rate: number) => {
              try {
                const mediaEl = ws.getMediaElement?.();
                if (mediaEl) mediaEl.playbackRate = rate;
              } catch {}
            },
            setEQ: (low: number, mid: number, high: number) => {
              if (eqLowRef.current) eqLowRef.current.gain.value = low;
              if (eqMidRef.current) eqMidRef.current.gain.value = mid;
              if (eqHighRef.current) eqHighRef.current.gain.value = high;
              eqContextRef.current?.resume().catch(() => {});
            },
          };
        }

        await loadAudio(trackId, ws);
        prevTrackIdRef.current = trackId;
      } catch (e) {
        if (!destroyed) {
          console.error('WaveSurfer init error:', e);
          setError('Impossible de charger le lecteur');
          setLoading(false);
        }
      }
    })();

    return () => {
      destroyed = true;
      abortRef.current?.abort();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      wsRef.current?.destroy();
      wsRef.current = null;
      if (playerRef) playerRef.current = null;
      try { eqContextRef.current?.close(); } catch {}
      eqContextRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load audio ──
  const loadAudio = useCallback(async (id: number, ws: any) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    setIsReady(false);
    setLoading(true);
    setError(null);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    setIsPlaying(false);
    spectralColorsRef.current = null;
    setSpectralReady(false);
    setLoopIn(null); setLoopOut(null); setLoopActive(false);

    try {
      const token = getToken();
      const audioUrl = token
        ? `${API_URL}/tracks/${id}/audio?format=ogg&token=${encodeURIComponent(token)}`
        : `${API_URL}/tracks/${id}/audio?format=ogg`;

      const downloadTimeout = setTimeout(() => {
        if (!abort.signal.aborted) {
          abort.abort();
          setError('Chargement trop long — réessayez');
          setLoading(false);
        }
      }, 45000);

      const res = await fetch(audioUrl, {
        signal: abort.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      clearTimeout(downloadTimeout);
      if (abort.signal.aborted) return;

      console.log(`[CueForge] Audio loaded: ${(blob.size / 1024 / 1024).toFixed(1)} MB (${blob.type})`);

      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      // Decode for spectral analysis
      const arrayBuffer = await blob.arrayBuffer();
      if (abort.signal.aborted) return;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      await audioCtx.resume();
      let decoded: AudioBuffer;
      try {
        decoded = await audioCtx.decodeAudioData(arrayBuffer);
      } catch (decErr) {
        console.error('[CueForge] decodeAudioData failed:', decErr);
        audioCtx.close().catch(() => {});
        setError("Impossible de décoder l'audio");
        setLoading(false);
        return;
      }
      if (abort.signal.aborted) { audioCtx.close().catch(() => {}); return; }

      console.log(`[CueForge] Audio decoded: ${decoded.duration.toFixed(1)}s, ${decoded.numberOfChannels}ch, ${decoded.sampleRate}Hz`);

      // Compute spectral colors
      try {
        const rgbColors = computeRGBWaveform(decoded);
        spectralColorsRef.current = rgbColors;
        setSpectralReady(true);
      } catch (e) {
        console.warn('[CueForge] RGB waveform computation failed:', e);
      }

      const ch0 = decoded.getChannelData(0);
      const ch1 = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : ch0;
      audioCtx.close().catch(() => {});
      if (abort.signal.aborted) return;

      // Load audio in wavesurfer
      ws.load(url, [ch0, ch1], decoded.duration);

      (ws as any).__readyTimeout = setTimeout(() => {
        if (!abort.signal.aborted) {
          console.warn('[CueForge] WaveSurfer ready timeout (15s)');
          setError('Décodage audio trop long — format non supporté ?');
          setLoading(false);
        }
      }, 15000);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.warn('Audio load error:', e);
      if (id < 0) {
        setLoading(false);
        setIsReady(true);
      } else {
        setError('Fichier audio introuvable');
        setLoading(false);
      }
    }
  }, []);

  // ── Track change ──
  useEffect(() => {
    if (!wsRef.current || prevTrackIdRef.current === trackId) return;
    prevTrackIdRef.current = trackId;
    loadAudio(trackId, wsRef.current);
  }, [trackId, loadAudio]);

  // ── Click on overview → seek ──
  const handleOverviewClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const ws = wsRef.current;
    if (!ws || !isReady) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, x / rect.width));
    ws.seekTo(progress);
    onSeek?.(progress * durationRef.current * 1000);
  }, [isReady, onSeek]);

  // ── Click on detail → seek ──
  const handleDetailClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const ws = wsRef.current;
    if (!ws || !isReady) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const visibleSec = ZOOM_SECONDS[String(zoomRef.current)] ?? 30;
    const secPerPx = visibleSec / rect.width;
    const startTime = currentTimeRef.current - visibleSec / 2;
    const clickTime = startTime + x * secPerPx;
    const dur = durationRef.current;
    if (dur > 0) {
      const seekPos = Math.max(0, Math.min(1, clickTime / dur));
      ws.seekTo(seekPos);
      onSeek?.(seekPos * dur * 1000);
      onWaveformClick?.(seekPos * dur * 1000);
    }
  }, [isReady, onSeek, onWaveformClick]);

  // ── Ctrl+Scroll zoom on detail ──
  const onZoomChangeRef = useRef(onZoomChange);
  useEffect(() => { onZoomChangeRef.current = onZoomChange; }, [onZoomChange]);

  useEffect(() => {
    const el = detailContainerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // Adjust visible seconds
      const currentSec = ZOOM_SECONDS[String(zoomRef.current)] ?? 30;
      const next = e.deltaY > 0 ? Math.min(currentSec * 1.4, 120) : Math.max(currentSec / 1.4, 4);
      // Find closest zoom level or emit raw
      onZoomChangeRef.current?.(next);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // ── Loop state sync ──
  useEffect(() => {
    onLoopChange?.(loopIn, loopOut, loopActive);
  }, [loopIn, loopOut, loopActive, onLoopChange]);

  const togglePlay = useCallback(() => wsRef.current?.playPause(), []);
  const skipBack = useCallback(() => wsRef.current?.skip(-5), []);
  const skipFwd = useCallback(() => wsRef.current?.skip(5), []);
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value) / 100;
    setVolume(vol);
    if (wsRef.current) wsRef.current.setVolume(vol);
    if (muted) setMuted(false);
  }, [muted]);
  const handleToggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    if (wsRef.current) wsRef.current.setVolume(next ? 0 : volume);
  }, [muted, volume]);

  return (
    <div className="w-full">
      {/* ── OVERVIEW — full track (Rekordbox-style top strip) ── */}
      <div
        ref={overviewContainerRef}
        className="relative bg-black rounded-t-lg overflow-hidden cursor-pointer"
        style={{ height: overviewHeight, minHeight: overviewHeight }}
        title="Vue d'ensemble — clic = naviguer"
        onClick={handleOverviewClick}
      >
        <canvas
          ref={overviewCanvasRef}
          className="absolute inset-0 w-full h-full"
        />
        {/* Label */}
        <div className="absolute top-0.5 left-1.5 text-[8px] text-white/25 pointer-events-none select-none font-mono uppercase tracking-wider">
          Overview
        </div>
      </div>

      {/* ── Separator ── */}
      <div className="h-[1px] bg-white/10" />

      {/* ── DETAIL — zoomed waveform with fixed center cursor ── */}
      <div
        ref={detailContainerRef}
        className="relative bg-black rounded-b-lg overflow-hidden cursor-crosshair"
        style={{ height, minHeight: height }}
        title="Clic = seek · Ctrl+Scroll = zoom"
        onClick={handleDetailClick}
      >
        <canvas
          ref={detailCanvasRef}
          className="absolute inset-0 w-full h-full"
        />

        {loading && !isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span>Chargement…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400">{error}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setError(null);
                  if (wsRef.current) loadAudio(trackId, wsRef.current);
                }}
                className="text-[10px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}

        {isReady && cuePoints.length === 0 && (
          <div className="absolute bottom-1 right-2 text-[10px] text-white/30 pointer-events-none select-none">
            clic = seek · ctrl+scroll = zoom
          </div>
        )}

        {/* Loop indicator */}
        {loopActive && (
          <div className="absolute top-1 left-2 flex items-center gap-1 pointer-events-none">
            <span className="text-[9px] bg-emerald-500/80 text-white px-1.5 py-0.5 rounded font-bold">LOOP</span>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="flex items-center gap-2 mt-[5px] px-1">
        <span className="text-[11px] text-[var(--text-primary)] font-mono tabular-nums w-9 text-right">
          {fmt(currentTime)}
        </span>
        <span className="text-[11px] text-[var(--text-muted)] font-mono">
          / {fmt(duration)}
        </span>

        <div className="flex items-center gap-1 ml-1">
          <button
            onClick={skipBack}
            disabled={!isReady}
            title="-5s"
            className="px-[5px] py-[2px] rounded text-[10px] border border-[var(--border-default)] bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer disabled:opacity-40"
          >
            ↩ 5s
          </button>
          <button
            onClick={togglePlay}
            disabled={!isReady}
            title={isPlaying ? 'Pause' : 'Play'}
            className={`w-[30px] h-[30px] rounded-full text-white text-sm border-none cursor-pointer flex items-center justify-center transition-colors disabled:opacity-40 ${
              isPlaying ? 'bg-orange-500 hover:bg-orange-400' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            onClick={skipFwd}
            disabled={!isReady}
            title="+5s"
            className="px-[5px] py-[2px] rounded text-[10px] border border-[var(--border-default)] bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer disabled:opacity-40"
          >
            5s ↪
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
            value={muted ? 0 : Math.round(volume * 100)}
            onChange={handleVolumeChange}
            disabled={!isReady}
            className="w-20 h-1.5 rounded-full bg-[var(--bg-hover)] appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #2563eb 0%, #2563eb ${
                muted ? 0 : volume * 100
              }%, var(--bg-hover) ${muted ? 0 : volume * 100}%, var(--bg-hover) 100%)`,
            }}
            title="Volume"
          />
          <span className="text-[10px] text-[var(--text-muted)] w-8 text-right">
            {muted ? '0%' : `${Math.round(volume * 100)}%`}
          </span>
        </div>
      </div>
    </div>
  );
}
