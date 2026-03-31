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
  colors: [string, string, string]; // R-G-B channels in CSS color
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
  trackDuration?: number; // secondes
  cuePoints?: CuePoint[];
  onTimeUpdate?: (positionMs: number) => void;
  onSeek?: (positionMs: number) => void;
  onWaveformClick?: (positionMs: number) => void;
  zoom?: number;
  height?: number;
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
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const ZOOM_PX_PER_SEC: Record<string, number> = {
  '0.5': 12,
  '1':   30,
  '2':   70,
  '4':  160,
};

// ── RGB spectral analysis — derivative approach (fast, no OfflineAudioContext) ──
// Principle: d0=RMS signal → bass content  |  d1=RMS 1st derivative → mids
//            d2=RMS 2nd derivative → highs (transients, cymbals, hats)
// Each band normalized independently → colors are always vivid regardless of volume
function computeRGBWaveform(buf: AudioBuffer, numBars = 2000): {r:number,g:number,b:number}[] {
  const data = buf.getChannelData(0);
  const segLen = Math.max(1, Math.floor(data.length / numBars));

  const bands: {lo:number,mi:number,hi:number}[] = new Array(numBars);
  let maxLo = 1e-9, maxMi = 1e-9, maxHi = 1e-9;

  for (let i = 0; i < numBars; i++) {
    const s = i * segLen;
    const e = Math.min(s + segLen, data.length);
    let lo = 0, mi = 0, hi = 0;
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
      prev2 = prev;
      prev  = v;
    }
    const loR = Math.sqrt(lo / n);
    const miR = Math.sqrt(mi / n);
    const hiR = Math.sqrt(hi / n);
    maxLo = Math.max(maxLo, loR);
    maxMi = Math.max(maxMi, miR);
    maxHi = Math.max(maxHi, hiR);
    bands[i] = { lo: loR, mi: miR, hi: hiR };
  }

  return bands.map(c => {
    const lo = c.lo / maxLo;  // 0-1 — bass  (kick, sub)
    const mi = c.mi / maxMi;  // 0-1 — mids  (synths, vocals)
    const hi = c.hi / maxHi;  // 0-1 — highs (hats, transients)

    // Rekordbox color palette:
    //   bass only  → orange-red  rgb(255, 80, 10)
    //   mids only  → yellow-green rgb(120, 220, 40)
    //   highs only → cyan        rgb(20, 200, 255)
    //   all        → white
    const r = Math.min(255, Math.round(lo * 255 + mi * 80));
    const g = Math.min(255, Math.round(mi * 210 + hi * 90 + lo * 40));
    const b = Math.min(255, Math.round(hi * 255 + mi * 60));

    return { r, g, b };
  });
}

export default function WaveSurferPlayer({
  trackId,
  trackDuration,
  cuePoints = [],
  onTimeUpdate,
  onSeek,
  onWaveformClick,
  zoom = 1,
  height = 96,
  waveformTheme = 'spectral',
  playerRef,
  onLoopChange,
}: WaveSurferPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<any>(null);
  const regionsRef = useRef<any>(null);
  const blobUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevTrackIdRef = useRef<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const currentTimeRef = useRef(0);
  const [duration, setDuration] = useState(trackDuration ?? 0);
  useEffect(() => {
    if (trackDuration && duration === 0) setDuration(trackDuration);
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
  const spectralColorsRef = useRef<{r:number,g:number,b:number}[] | null>(null);
  const themeRef = useRef<string>(waveformTheme);
  const [spectralReady, setSpectralReady] = useState(false);

  // EQ nodes
  const eqLowRef = useRef<BiquadFilterNode | null>(null);
  const eqMidRef = useRef<BiquadFilterNode | null>(null);
  const eqHighRef = useRef<BiquadFilterNode | null>(null);
  const eqContextRef = useRef<AudioContext | null>(null);

  // Format time
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Sync refs
  useEffect(() => { loopInRef.current = loopIn; }, [loopIn]);
  useEffect(() => { loopOutRef.current = loopOut; }, [loopOut]);
  useEffect(() => { loopActiveRef.current = loopActive; }, [loopActive]);
  useEffect(() => { themeRef.current = waveformTheme; }, [waveformTheme]);

  // --- Init WaveSurfer ---
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    (async () => {
      try {
        const WaveSurfer = (await import('wavesurfer.js')).default;
        const RegionsPlugin = (await import('wavesurfer.js/dist/plugins/regions.esm.js')).default;
        if (destroyed) return;

        const regions = RegionsPlugin.create();
        regionsRef.current = regions;

        const ws = WaveSurfer.create({
          container: containerRef.current!,
          height,
          normalize: true,
          fillParent: true,
          minPxPerSec: ZOOM_PX_PER_SEC[String(zoom)] ?? 30,
          autoScroll: true,
          autoCenter: true,
          interact: true,
          dragToSeek: true,
          cursorColor: 'rgba(255,255,255,0.9)',
          cursorWidth: 2,
          barWidth: 2,
          barGap: 1,
          barRadius: 3,
          waveColor: ['#ef4444cc', '#22c55ecc', '#3b82f6cc'],
          progressColor: ['#ef4444', '#22c55e', '#3b82f6'],
          renderFunction: (peaks: any, ctx: CanvasRenderingContext2D) => {
            try {
            const colors = spectralColorsRef.current;
            const { width, height: h } = ctx.canvas;
            const ch = peaks?.[0] as Float32Array;
            if (!ch || ch.length === 0) return;
            const mid = h / 2;

            ctx.fillStyle = '#08080e';
            ctx.fillRect(0, 0, width, h);
            ctx.fillStyle = 'rgba(255,255,255,0.07)';
            ctx.fillRect(0, mid - 0.5, width, 1);

            if (!colors) {
              for (let x = 0; x < width; x += 2) {
                const si = Math.min(Math.floor((x / width) * ch.length), ch.length - 1);
                const amp = Math.abs(ch[si] || 0);
                if (amp < 0.003) continue;
                const bH = Math.max(2, amp * mid * 0.9);
                const lum = Math.round(40 + amp * 100);
                ctx.fillStyle = `rgb(${lum},${Math.round(lum * 1.3)},${Math.round(lum * 2.2)})`;
                ctx.fillRect(x, mid - bH, 2, bH * 2);
              }
              return;
            }

            const samplesPerPx = ch.length / width;
            for (let x = 0; x < width; x += 2) {
              const s0 = Math.floor(x * samplesPerPx);
              const s1 = Math.min(Math.floor((x + 2) * samplesPerPx), ch.length - 1);
              let amp = 0;
              for (let s = s0; s <= s1; s++) amp = Math.max(amp, Math.abs(ch[s] || 0));
              amp = Math.min(1, amp);
              if (amp < 0.003) continue;

              const ci = Math.min(Math.floor((x / width) * colors.length), colors.length - 1);
              const { r, g, b } = colors[ci];
              const bright = 0.28 + amp * 0.72;
              const rr = Math.min(255, Math.round(r * bright));
              const gg = Math.min(255, Math.round(g * bright));
              const bb = Math.min(255, Math.round(b * bright));
              const barH = Math.max(2, amp * mid * 0.96);

              ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
              ctx.fillRect(x, mid - barH, 2, barH);
              ctx.fillStyle = `rgb(${Math.round(rr * 0.65)},${Math.round(gg * 0.65)},${Math.round(bb * 0.65)})`;
              ctx.fillRect(x, mid, 2, barH);
            }
            } catch (e) {
              console.error('[CueForge] renderFunction crash:', e);
            }
          },
          plugins: [regions],
        });

        ws.on('ready', (dur: number) => {
          if (destroyed) return;
          setDuration(dur);
          setIsReady(true);
          setLoading(false);
          setError(null);

          // Setup EQ via MediaElementSource
          try {
            const mediaEl = ws.getMediaElement?.();
            if (mediaEl && !eqContextRef.current) {
              const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
              const source = audioCtx.createMediaElementSource(mediaEl);
              const lowFilter = audioCtx.createBiquadFilter();
              lowFilter.type = 'lowshelf';
              lowFilter.frequency.value = 250;
              lowFilter.gain.value = 0;
              const midFilter = audioCtx.createBiquadFilter();
              midFilter.type = 'peaking';
              midFilter.frequency.value = 1000;
              midFilter.Q.value = 1;
              midFilter.gain.value = 0;
              const highFilter = audioCtx.createBiquadFilter();
              highFilter.type = 'highshelf';
              highFilter.frequency.value = 4000;
              highFilter.gain.value = 0;
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
        ws.on('interaction', (t: number) => {
          if (destroyed) return;
          onSeek?.(t * 1000);
        });
        ws.on('click', (relX: number) => {
          if (destroyed) return;
          const dur = ws.getDuration() || (trackDuration ?? 0);
          if (dur > 0) onWaveformClick?.(relX * dur * 1000);
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
            setLoopIn: () => {
              const t = currentTimeRef.current;
              setLoopIn(t);
            },
            setLoopOut: () => {
              const t = currentTimeRef.current;
              setLoopOut(t);
              if (loopInRef.current !== null && t > loopInRef.current) {
                setLoopActive(true);
              }
            },
            toggleLoop: () => {
              if (loopInRef.current !== null && loopOutRef.current !== null && loopInRef.current < loopOutRef.current) {
                setLoopActive(prev => !prev);
              }
            },
            // Set loop from cue point (inMs + outMs in milliseconds), seek to start and activate
            setLoop: (inMs: number, outMs: number) => {
              const inSec = inMs / 1000;
              const outSec = outMs / 1000;
              setLoopIn(inSec);
              setLoopOut(outSec);
              loopInRef.current = inSec;
              loopOutRef.current = outSec;
              setLoopActive(true);
              loopActiveRef.current = true;
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
      eqLowRef.current = null;
      eqMidRef.current = null;
      eqHighRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Load audio blob ---
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
    // Reset loop state on track change
    setLoopIn(null);
    setLoopOut(null);
    setLoopActive(false);

    try {
      const token = getToken();
      // Pass token both as query param AND header for full compatibility
      const audioUrl = token
        ? `${API_URL}/tracks/${id}/audio?token=${encodeURIComponent(token)}`
        : `${API_URL}/tracks/${id}/audio`;
      const res = await fetch(audioUrl, {
        signal: abort.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (abort.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      ws.load(url);

      // RGB waveform computation — derivative approach, synchronous, works on any track
      try {
        const arrayBuffer = await blob.arrayBuffer();
        if (abort.signal.aborted) return;
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const decoded = await audioContext.decodeAudioData(arrayBuffer);
        audioContext.close().catch(() => {});
        if (abort.signal.aborted) return;
        // computeRGBWaveform is now synchronous — no await, no OfflineAudioContext crash
        const rgbColors = computeRGBWaveform(decoded);
        spectralColorsRef.current = rgbColors;
        setSpectralReady(true);
      } catch (e) {
        console.warn('RGB waveform computation failed:', e);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.warn('Audio load error (demo mode?):', e);
      if (id < 0) {
        setLoading(false);
        setIsReady(true);
      } else {
        setError('Fichier audio introuvable');
        setLoading(false);
      }
    }
  }, []);

  // --- Track change ---
  useEffect(() => {
    if (!wsRef.current || prevTrackIdRef.current === trackId) return;
    prevTrackIdRef.current = trackId;
    loadAudio(trackId, wsRef.current);
  }, [trackId, loadAudio]);

  // --- Zoom change + re-render when spectral colors arrive ---
  useEffect(() => {
    if (!wsRef.current || !isReady) return;
    try {
      wsRef.current.zoom(ZOOM_PX_PER_SEC[String(zoom)] ?? 30);
    } catch {}
  }, [zoom, isReady, spectralReady]);

  // --- Cue points → RegionsPlugin markers ---
  useEffect(() => {
    const ws = wsRef.current;
    const regions = regionsRef.current;
    if (!ws || !regions || !isReady) return;

    // Remove all non-loop regions
    try {
      const allRegions = regions.getRegions?.() || [];
      allRegions.forEach((r: any) => {
        if (!r.id?.startsWith('loop-')) r.remove?.();
      });
      // fallback
      if (!regions.getRegions) regions.clearRegions?.();
    } catch {
      try { regions.clearRegions?.(); } catch {}
    }

    cuePoints.forEach((c) => {
      const color = c.color || c.color_rgb || '#f59e0b';
      try {
        regions.addRegion({
          id: `cue-${c.id}`,
          start: c.position_ms / 1000,
          end: c.position_ms / 1000 + 0.01,
          color: color + '22',
          drag: false,
          resize: false,
          content: c.name?.charAt(0) || 'C',
        });
      } catch {}
    });
  }, [cuePoints, isReady]);

  // --- Loop region visualization ---
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions || !isReady) return;

    // Remove existing loop region
    try {
      const allRegions = regions.getRegions?.() || [];
      allRegions.forEach((r: any) => {
        if (r.id === 'loop-region') r.remove?.();
      });
    } catch {}

    if (loopIn !== null && loopOut !== null && loopIn < loopOut) {
      try {
        regions.addRegion({
          id: 'loop-region',
          start: loopIn,
          end: loopOut,
          color: loopActive ? 'rgba(16,185,129,0.18)' : 'rgba(59,130,246,0.12)',
          drag: false,
          resize: false,
        });
      } catch {}
    }
  }, [loopIn, loopOut, loopActive, isReady]);

  // --- Ctrl+Scroll zoom ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const ws = wsRef.current;
      if (!ws) return;
      const current = ZOOM_PX_PER_SEC[String(zoom)] ?? 30;
      const next = e.deltaY < 0 ? Math.min(current * 1.4, 250) : Math.max(current / 1.4, 8);
      try { ws.zoom(next); } catch {}
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [zoom]);

  // Sync loop state changes to parent
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
      {/* Waveform */}
      <div
        className="relative bg-black/30 rounded-lg overflow-hidden cursor-crosshair"
        style={{ height, minHeight: height }}
        title="Clic = placer un cue · Ctrl+Scroll = zoom"
      >
        <div ref={containerRef} className="w-full h-full" />

        {loading && !isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span>Chargement…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <span className="text-xs text-red-400">{error}</span>
          </div>
        )}

        {isReady && cuePoints.length === 0 && (
          <div className="absolute bottom-1 right-2 text-[10px] text-white/30 pointer-events-none select-none">
            clic = cue · ctrl+scroll = zoom
          </div>
        )}

        {/* Loop indicator */}
        {loopActive && (
          <div className="absolute top-1 left-2 flex items-center gap-1 pointer-events-none">
            <span className="text-[9px] bg-emerald-500/80 text-white px-1.5 py-0.5 rounded font-bold">🔁 LOOP</span>
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
