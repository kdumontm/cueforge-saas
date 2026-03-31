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

export const WAVEFORM_THEMES: WaveformTheme[] = [
  {
    id: 'spectral',
    label: 'Spectral',
    colors: ['#ef4444', '#22c55e', '#3b82f6'],
    getBarColor: (r, g, b, bright) =>
      `rgb(${Math.min(255, Math.round(r * bright))},${Math.min(255, Math.round(g * bright))},${Math.min(255, Math.round(b * bright))})`,
  },
  {
    id: 'classic',
    label: 'Classic RGB',
    colors: ['#ef4444', '#22c55e', '#3b82f6'],
    getBarColor: (r, g, b, bright) => {
      // Pure red/green/blue based on dominant band
      const max = Math.max(r, g, b);
      if (max < 1) return 'rgb(40,40,40)';
      if (r === max) return `rgb(${Math.round(255 * bright)},${Math.round(30 * bright)},${Math.round(30 * bright)})`;
      if (g === max) return `rgb(${Math.round(30 * bright)},${Math.round(255 * bright)},${Math.round(30 * bright)})`;
      return `rgb(${Math.round(60 * bright)},${Math.round(60 * bright)},${Math.round(255 * bright)})`;
    },
  },
  {
    id: 'neon',
    label: 'Neon',
    colors: ['#ff00ff', '#00ffff', '#ffff00'],
    getBarColor: (r, g, b, bright) => {
      const hue = (r * 0.33 + g * 0.5 + b * 0.17) * 360;
      return `hsl(${hue % 360},100%,${40 + bright * 30}%)`;
    },
  },
  {
    id: 'sunset',
    label: 'Sunset',
    colors: ['#ff4500', '#ff8c00', '#ffd700'],
    getBarColor: (r, g, b, bright) => {
      const rr = Math.min(255, Math.round((r * 0.8 + g * 0.2) * bright * 255));
      const gg = Math.min(255, Math.round((g * 0.5 + b * 0.1) * bright * 180));
      return `rgb(${rr},${gg},30)`;
    },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    colors: ['#0ea5e9', '#22d3ee', '#6366f1'],
    getBarColor: (r, g, b, bright) => {
      const rr = Math.min(255, Math.round(g * 40 * bright));
      const gg = Math.min(255, Math.round((g * 0.5 + b * 0.5) * 200 * bright));
      const bb = Math.min(255, Math.round((b * 0.7 + r * 0.3) * 255 * bright));
      return `rgb(${rr},${gg},${bb})`;
    },
  },
  {
    id: 'fire',
    label: 'Fire',
    colors: ['#ef4444', '#f97316', '#fbbf24'],
    getBarColor: (r, g, b, bright) => {
      const rr = Math.min(255, Math.round((r * 0.7 + g * 0.3) * 255 * bright));
      const gg = Math.min(255, Math.round(g * 150 * bright));
      return `rgb(${rr},${gg},0)`;
    },
  },
  {
    id: 'aurora',
    label: 'Aurora',
    colors: ['#8b5cf6', '#06b6d4', '#10b981'],
    getBarColor: (r, g, b, bright) => {
      const t = (r + g * 2 + b * 3) / 6;
      const rr = Math.min(255, Math.round((1 - t) * 139 * bright));
      const gg = Math.min(255, Math.round(t * 200 * bright));
      const bb = Math.min(255, Math.round((0.5 + t * 0.5) * 200 * bright));
      return `rgb(${rr},${gg},${bb})`;
    },
  },
  {
    id: 'mono',
    label: 'Mono',
    colors: ['#ffffff', '#ffffff', '#ffffff'],
    getBarColor: (_r, _g, _b, bright) => {
      const v = Math.round(255 * bright);
      return `rgb(${v},${v},${v})`;
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
    setLoop?: (inMs: number, outMs: number) => void;
    setPlaybackRate?: (rate: number) => void;
    setEQ?: (low: number, mid: number, high: number) => void;
  } | null>;
  onLoopChange?: (loopIn: number | null, loopOut: number | null, loopActive: boolean) => void;
  onZoomChange?: (pxPerSec: number) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// ── RGB spectral analysis — derivative approach ──
function computeRGBWaveform(buf: AudioBuffer, numBars = 4000): { r: number; g: number; b: number; amp: number }[] {
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

  return bands.map((c) => {
    const lo = c.lo / maxLo;
    const mi = c.mi / maxMi;
    const hi = c.hi / maxHi;

    const loP = Math.pow(lo, 0.65);
    const miP = Math.pow(mi, 0.65);
    const hiP = Math.pow(hi, 0.65);

    // Raw normalized 0-1 for each band
    const r = Math.min(1, loP + miP * 0.23 + hiP * 0.12);
    const g = Math.min(1, miP + hiP * 0.47 + loP * 0.08);
    const b = Math.min(1, hiP + loP * 0.23 + miP * 0.16);

    return { r, g, b, amp: c.amp };
  });
}

// ── Draw overview waveform ──
function drawOverview(
  ctx: CanvasRenderingContext2D,
  colors: { r: number; g: number; b: number; amp: number }[],
  width: number,
  height: number,
  progress: number,
  cuePoints: CuePoint[],
  duration: number,
  theme: WaveformTheme,
) {
  ctx.clearRect(0, 0, width, height);

  const mid = height / 2;
  const numBars = colors.length;

  for (let x = 0; x < width; x++) {
    const ci = Math.min(Math.floor((x / width) * numBars), numBars - 1);
    const { r, g, b, amp } = colors[ci];
    if (amp < 0.003) continue;

    const barH = Math.max(1, amp * mid * 0.92);
    const bright = 0.6 + amp * 0.4;

    const color = theme.getBarColor(r, g, b, bright);

    // Top half
    ctx.fillStyle = color;
    ctx.fillRect(x, mid - barH, 1, barH);

    // Bottom mirror
    ctx.globalAlpha = 0.4;
    ctx.fillRect(x, mid + 1, 1, barH * 0.85);
    ctx.globalAlpha = 1;
  }

  // Cue point markers
  cuePoints.forEach((c) => {
    const xPos = duration > 0 ? (c.position_ms / 1000 / duration) * width : 0;
    const color = c.color || c.color_rgb || '#f59e0b';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(xPos - 3, 0);
    ctx.lineTo(xPos + 3, 0);
    ctx.lineTo(xPos, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color + '66';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xPos, 5);
    ctx.lineTo(xPos, height);
    ctx.stroke();
  });

  // Dim unplayed section
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(progress * width, 0, width - progress * width, height);

  // RED playback position line
  const posX = progress * width;
  ctx.strokeStyle = '#ff3333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(posX, 0);
  ctx.lineTo(posX, height);
  ctx.stroke();
}

// ── Draw zoomed detail waveform ──
function drawDetail(
  ctx: CanvasRenderingContext2D,
  colors: { r: number; g: number; b: number; amp: number }[],
  width: number,
  height: number,
  progress: number,
  duration: number,
  visibleSeconds: number,
  cuePoints: CuePoint[],
  theme: WaveformTheme,
  loopIn: number | null,
  loopOut: number | null,
  loopActive: boolean,
  bpm?: number,
) {
  ctx.clearRect(0, 0, width, height);

  const mid = height / 2;
  const numBars = colors.length;
  const currentTime = progress * duration;
  const secPerPx = visibleSeconds / width;
  const startTime = currentTime - visibleSeconds / 2;

  // Centre axis
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, mid, width, 1);

  // Beat grid
  if (bpm && bpm > 0) {
    const beatInterval = 60 / bpm;
    const barInterval = beatInterval * 4;
    const firstBeat = Math.floor(Math.max(0, startTime) / beatInterval) * beatInterval;

    for (let t = firstBeat; t < startTime + visibleSeconds; t += beatInterval) {
      if (t < 0) continue;
      const x = (t - startTime) / secPerPx;
      if (x < 0 || x >= width) continue;

      const isBar = Math.abs((t / barInterval) - Math.round(t / barInterval)) < 0.01;
      ctx.strokeStyle = isBar ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
      ctx.lineWidth = isBar ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, height);
      ctx.stroke();
    }
  }

  // Loop region overlay
  if (loopIn !== null && loopOut !== null && loopIn < loopOut) {
    const loopStartX = (loopIn - startTime) / secPerPx;
    const loopEndX = (loopOut - startTime) / secPerPx;
    const x1 = Math.max(0, loopStartX);
    const x2 = Math.min(width, loopEndX);
    if (x2 > x1) {
      ctx.fillStyle = loopActive ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.08)';
      ctx.fillRect(x1, 0, x2 - x1, height);
      // Loop boundary lines
      ctx.strokeStyle = loopActive ? '#10b981' : '#3b82f6';
      ctx.lineWidth = 1.5;
      if (loopStartX >= 0 && loopStartX < width) {
        ctx.beginPath();
        ctx.moveTo(loopStartX, 0);
        ctx.lineTo(loopStartX, height);
        ctx.stroke();
      }
      if (loopEndX >= 0 && loopEndX < width) {
        ctx.beginPath();
        ctx.moveTo(loopEndX, 0);
        ctx.lineTo(loopEndX, height);
        ctx.stroke();
      }
    }
  }

  // Waveform
  for (let x = 0; x < width; x++) {
    const t = startTime + x * secPerPx;
    if (t < 0 || t > duration) continue;

    const ci = Math.min(Math.floor((t / duration) * numBars), numBars - 1);
    if (ci < 0 || ci >= numBars) continue;
    const { r, g, b, amp } = colors[ci];
    if (amp < 0.003) continue;

    const barH = Math.max(1, amp * mid * 0.92);
    const bright = 0.55 + amp * 0.45;

    const color = theme.getBarColor(r, g, b, bright);

    ctx.fillStyle = color;
    ctx.fillRect(x, mid - barH, 1, barH);
    ctx.globalAlpha = 0.4;
    ctx.fillRect(x, mid + 1, 1, barH * 0.85);
    ctx.globalAlpha = 1;
  }

  // Cue point markers
  cuePoints.forEach((c) => {
    const cueTime = c.position_ms / 1000;
    const x = (cueTime - startTime) / secPerPx;
    if (x < -5 || x >= width + 5) return;

    const color = c.color || c.color_rgb || '#f59e0b';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 4, 0);
    ctx.lineTo(x + 4, 0);
    ctx.lineTo(x, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color + '55';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x, height);
    ctx.stroke();
  });

  // Fixed RED cursor at center
  const centerX = Math.round(width / 2);
  ctx.strokeStyle = '#ff3333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX, 0);
  ctx.lineTo(centerX, height);
  ctx.stroke();
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

  // ── Animation loop ──
  const renderFrame = useCallback(() => {
    const colors = spectralColorsRef.current;
    if (!colors) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    const ws = wsRef.current;
    const dur = durationRef.current;
    let time = currentTimeRef.current;

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
    const theme = WAVEFORM_THEMES.find((t) => t.id === themeRef.current) || WAVEFORM_THEMES[0];

    // Draw overview
    const overviewCanvas = overviewCanvasRef.current;
    const overviewContainer = overviewContainerRef.current;
    if (overviewCanvas && overviewContainer) {
      const ctx = overviewCanvas.getContext('2d');
      if (ctx) {
        const rect = overviewContainer.getBoundingClientRect();
        drawOverview(ctx, colors, rect.width, rect.height, progress, cuePoints, dur, theme);
      }
    }

    // Draw detail
    const detailCanvas = detailCanvasRef.current;
    const detailContainer = detailContainerRef.current;
    if (detailCanvas && detailContainer) {
      const ctx = detailCanvas.getContext('2d');
      if (ctx) {
        const rect = detailContainer.getBoundingClientRect();
        drawDetail(
          ctx, colors, rect.width, rect.height, progress, dur,
          visibleSecondsRef.current, cuePoints, theme,
          loopInRef.current, loopOutRef.current, loopActiveRef.current,
          bpmRef.current,
        );
      }
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }, [cuePoints]);

  // ── Start/stop animation ──
  useEffect(() => {
    if (spectralReady) {
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

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      if (overviewCanvasRef.current && overviewContainerRef.current)
        setupCanvasSize(overviewCanvasRef.current, overviewContainerRef.current);
      if (detailCanvasRef.current && detailContainerRef.current)
        setupCanvasSize(detailCanvasRef.current, detailContainerRef.current);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setupCanvasSize]);

  // ── Init WaveSurfer (audio engine only) ──
  useEffect(() => {
    let destroyed = false;

    (async () => {
      try {
        const WaveSurfer = (await import('wavesurfer.js')).default;
        if (destroyed) return;

        // Create a tiny but visible container so WaveSurfer fires 'ready'
        const hiddenDiv = document.createElement('div');
        hiddenDiv.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
        document.body.appendChild(hiddenDiv);

        const ws = WaveSurfer.create({
          container: hiddenDiv,
          height: 1,
          normalize: true,
          interact: false,
          cursorWidth: 0,
          waveColor: 'transparent',
          progressColor: 'transparent',
          barWidth: 0,
        });

        ws.on('ready', (dur: number) => {
          if (destroyed) return;
          console.log(`[CueForge] WaveSurfer ready — duration: ${dur}s`);
          setDuration(dur);
          durationRef.current = dur;
          setIsReady(true);
          setLoading(false);
          setError(null);
          if ((ws as any).__readyTimeout) {
            clearTimeout((ws as any).__readyTimeout);
            (ws as any).__readyTimeout = null;
          }

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
          if (!destroyed) { setIsPlaying(true); eqContextRef.current?.resume().catch(() => {}); }
        });
        ws.on('pause', () => !destroyed && setIsPlaying(false));
        ws.on('finish', () => !destroyed && setIsPlaying(false));
        ws.on('timeupdate', (t: number) => {
          if (destroyed) return;
          currentTimeRef.current = t;
          setCurrentTime(t);
          onTimeUpdate?.(t * 1000);
          // Loop enforcement
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
        (wsRef.current as any).__hiddenDiv = hiddenDiv;

        // Expose controls
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
              setVolumeState(vol);
              volumeRef.current = vol;
              ws.setVolume(vol);
            },
            toggleMute: () => {
              setMuted((prev) => {
                const next = !prev;
                ws.setVolume(next ? 0 : volumeRef.current || 0.8);
                return next;
              });
            },
            setLoopIn: () => {
              const t = currentTimeRef.current;
              setLoopIn(t);
              loopInRef.current = t;
            },
            setLoopOut: () => {
              const t = currentTimeRef.current;
              setLoopOut(t);
              loopOutRef.current = t;
              if (loopInRef.current !== null && t > loopInRef.current) {
                setLoopActive(true);
                loopActiveRef.current = true;
              }
            },
            toggleLoop: () => {
              if (loopInRef.current !== null && loopOutRef.current !== null && loopInRef.current < loopOutRef.current) {
                setLoopActive((prev) => {
                  const next = !prev;
                  loopActiveRef.current = next;
                  return next;
                });
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
      if ((wsRef.current as any)?.__readyTimeout) clearTimeout((wsRef.current as any).__readyTimeout);
      const hiddenDiv = (wsRef.current as any)?.__hiddenDiv;
      wsRef.current?.destroy();
      wsRef.current = null;
      if (hiddenDiv?.parentNode) hiddenDiv.parentNode.removeChild(hiddenDiv);
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
    loopInRef.current = null; loopOutRef.current = null; loopActiveRef.current = false;

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

      ws.load(url, [ch0, ch1], decoded.duration);

      // Safety timeout — 30s instead of 15s
      (ws as any).__readyTimeout = setTimeout(() => {
        if (!abort.signal.aborted) {
          // If spectral is ready, audio works — just mark as ready
          if (spectralColorsRef.current) {
            console.warn('[CueForge] WaveSurfer ready timeout — forcing ready (spectral OK)');
            setIsReady(true);
            setLoading(false);
            durationRef.current = decoded.duration;
            setDuration(decoded.duration);
          } else {
            setError('Décodage audio trop long');
            setLoading(false);
          }
        }
      }, 30000);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.warn('Audio load error:', e);
      if (id < 0) {
        setLoading(false); setIsReady(true);
      } else {
        setError('Fichier audio introuvable');
        setLoading(false);
      }
    }
  }, []);

  // Track change
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
    const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    ws.seekTo(progress);
    onSeek?.(progress * durationRef.current * 1000);
  }, [isReady, onSeek]);

  // ── Click on detail → seek ──
  const handleDetailClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const ws = wsRef.current;
    if (!ws || !isReady) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const secPerPx = visibleSecondsRef.current / rect.width;
    const startTime = currentTimeRef.current - visibleSecondsRef.current / 2;
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
  useEffect(() => {
    const el = detailContainerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setVisibleSeconds((prev) => {
        const next = e.deltaY > 0
          ? Math.min(prev * 1.3, 120) // zoom out
          : Math.max(prev / 1.3, 3);  // zoom in
        return next;
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Loop state sync
  useEffect(() => {
    onLoopChange?.(loopIn, loopOut, loopActive);
  }, [loopIn, loopOut, loopActive, onLoopChange]);

  const togglePlay = useCallback(() => wsRef.current?.playPause(), []);
  const skipBack = useCallback(() => wsRef.current?.skip(-10), []);
  const skipFwd = useCallback(() => wsRef.current?.skip(10), []);

  const volumeRef = useRef(0.8);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value) / 100;
    setVolumeState(vol);
    volumeRef.current = vol;
    if (wsRef.current) wsRef.current.setVolume(vol);
    setMuted(false);
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (wsRef.current) wsRef.current.setVolume(next ? 0 : volumeRef.current || 0.8);
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
        title="Vue d'ensemble — clic = naviguer"
        onClick={handleOverviewClick}
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
        title="Clic = seek · Ctrl+Scroll = zoom"
        onClick={handleDetailClick}
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
                  if (wsRef.current) loadAudio(trackId, wsRef.current);
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
