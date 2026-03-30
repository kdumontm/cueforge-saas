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

interface WaveSurferPlayerProps {
  trackId: number;
  trackDuration?: number; // secondes
  cuePoints?: CuePoint[];
  onTimeUpdate?: (positionMs: number) => void;
  onSeek?: (positionMs: number) => void;
  /** Clic sur la waveform → position en ms (pour créer un cue à cet endroit) */
  onWaveformClick?: (positionMs: number) => void;
  zoom?: number; // 0.5 | 1 | 2 | 4
  height?: number;
  /** Exposer les contrôles play/pause/skip depuis le parent */
  playerRef?: React.MutableRefObject<{
    playPause: () => void;
    skip: (s: number) => void;
    seekTo: (ms: number) => void;
  } | null>;
  onLoopChange?: (loopIn: number | null, loopOut: number | null, loopActive: boolean) => void;
  onSetLoopIn?: () => void;
  onSetLoopOut?: () => void;
  onToggleLoop?: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const ZOOM_PX_PER_SEC: Record<string, number> = {
  '0.5': 12,
  '1':   30,
  '2':   70,
  '4':  160,
};

// RGB spectral analysis
async function filterBand(buf: AudioBuffer, type: BiquadFilterType, freq: number, freq2?: number): Promise<Float32Array> {
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

async function computeRGBWaveform(buf: AudioBuffer, numBars = 1200): Promise<{r:number,g:number,b:number}[]> {
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

export default function WaveSurferPlayer({
  trackId,
  trackDuration,
  cuePoints = [],
  onTimeUpdate,
  onSeek,
  onWaveformClick,
  zoom = 1,
  height = 96,
  playerRef,
  onLoopChange,
  onSetLoopIn,
  onSetLoopOut,
  onToggleLoop,
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
  const [duration, setDuration] = useState(trackDuration ?? 0);
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

  // --- Formatage temps ---
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Sync loop refs
  useEffect(() => { loopInRef.current = loopIn; }, [loopIn]);
  useEffect(() => { loopOutRef.current = loopOut; }, [loopOut]);
  useEffect(() => { loopActiveRef.current = loopActive; }, [loopActive]);

  // --- Initialisation WaveSurfer (une seule fois) ---
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
            const colors = spectralColorsRef.current;
            const { width, height: h } = ctx.canvas;
            const ch = peaks[0] as Float32Array;
            if (!ch || ch.length === 0) return;
            const mid = h / 2;
            ctx.clearRect(0, 0, width, h);
            const barCount = Math.max(1, Math.min(Math.floor(width / 3), ch.length / 2));
            for (let x = 0; x < width; x += 2) {
              const idx = Math.floor((x / width) * barCount);
              const sampleIdx = Math.floor((idx / barCount) * ch.length);
              let amp = Math.abs(ch[sampleIdx] || 0);
              for (let s = -1; s <= 1; s++) {
                const si = Math.max(0, Math.min(ch.length - 2, sampleIdx + s * 2));
                amp = Math.max(amp, Math.abs(ch[si] || 0), Math.abs(ch[si + 1] || 0));
              }
              const barH = Math.max(1, amp * mid * 0.92);
              const ci = colors ? Math.min(Math.floor((x / width) * colors.length), colors.length - 1) : -1;
              const c = ci >= 0 && colors ? colors[ci] : { r: 124, g: 58, b: 237 };
              const brightness = 0.55 + amp * 0.45;
              const r = Math.min(255, Math.round(c.r * brightness));
              const g = Math.min(255, Math.round(c.g * brightness));
              const b = Math.min(255, Math.round(c.b * brightness));
              ctx.fillStyle = `rgb(${r},${g},${b})`;
              ctx.fillRect(x, mid - barH / 2, 2, barH);
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
        });
        ws.on('play', () => !destroyed && setIsPlaying(true));
        ws.on('pause', () => !destroyed && setIsPlaying(false));
        ws.on('finish', () => !destroyed && setIsPlaying(false));
        ws.on('timeupdate', (t: number) => {
          if (destroyed) return;
          setCurrentTime(t);
          onTimeUpdate?.(t * 1000);
          // Handle loop playback
          if (loopActiveRef.current && typeof loopInRef.current === 'number' && typeof loopOutRef.current === 'number' && loopInRef.current < loopOutRef.current && t >= loopOutRef.current) {
            const dur = ws.getDuration();
            if (dur > 0) ws.seekTo(loopInRef.current / dur);
          }
        });
        ws.on('interaction', (t: number) => {
          if (destroyed) return;
          onSeek?.(t * 1000);
        });
        // Clic sur waveform → poser un cue
        ws.on('click', (relX: number) => {
          if (destroyed) return;
          const dur = ws.getDuration();
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

        // Exposer contrôles au parent
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
          };
        }

        // Charger le premier track
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Charger un track dans WaveSurfer via blob URL ---
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
    setIsPlaying(false);
    spectralColorsRef.current = null;

    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/tracks/${id}/audio`, {
        signal: abort.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (abort.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      ws.load(url);

      // Compute RGB spectral colors async
      if (id > 0) {
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const decoded = await audioContext.decodeAudioData(arrayBuffer);
          const rgbColors = await computeRGBWaveform(decoded);
          if (!abort.signal.aborted) {
            spectralColorsRef.current = rgbColors;
          }
        } catch (e) {
          console.warn('RGB waveform computation failed:', e);
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('Audio load error:', e);
      setError('Fichier audio introuvable');
      setLoading(false);
    }
  }, []);

  // --- Track change → recharger ---
  useEffect(() => {
    if (!wsRef.current || prevTrackIdRef.current === trackId) return;
    prevTrackIdRef.current = trackId;
    loadAudio(trackId, wsRef.current);
  }, [trackId, loadAudio]);

  // --- Zoom change ---
  useEffect(() => {
    if (!wsRef.current || !isReady) return;
    try {
      wsRef.current.zoom(ZOOM_PX_PER_SEC[String(zoom)] ?? 30);
    } catch {}
  }, [zoom, isReady]);

  // --- Cue points → RegionsPlugin ---
  useEffect(() => {
    const ws = wsRef.current;
    const regions = regionsRef.current;
    if (!ws || !regions || !isReady) return;

    // Supprimer toutes les régions existantes
    try { regions.clearRegions?.(); } catch {}

    // Ajouter une région 0-largeur pour chaque cue point
    cuePoints.forEach((c) => {
      const color = c.color || c.color_rgb || '#f59e0b';
      try {
        regions.addRegion({
          id: `cue-${c.id}`,
          start: c.position_ms / 1000,
          end: c.position_ms / 1000 + 0.01, // région quasi-nulle = marqueur
          color: color + '22',
          drag: false,
          resize: false,
          content: c.name?.charAt(0) || 'C',
        });
      } catch {}
    });
  }, [cuePoints, isReady]);

  // --- Wheel zoom (Ctrl + molette) ---
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

  // --- Contrôles ---
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
  const handleSetLoopIn = useCallback(() => {
    setLoopIn(currentTime);
  }, [currentTime]);
  const handleSetLoopOut = useCallback(() => {
    setLoopOut(currentTime);
    if (loopIn !== null && currentTime > loopIn) setLoopActive(true);
  }, [currentTime, loopIn]);
  const handleToggleLoop = useCallback(() => {
    if (loopIn !== null && loopOut !== null && loopIn < loopOut) {
      setLoopActive(prev => !prev);
    }
  }, [loopIn, loopOut]);

  // Sync loop changes to parent
  useEffect(() => {
    onLoopChange?.(loopIn, loopOut, loopActive);
  }, [loopIn, loopOut, loopActive, onLoopChange]);

  return (
    <div className="w-full">
      {/* Waveform */}
      <div
        className="relative bg-black/30 rounded-lg overflow-hidden cursor-crosshair"
        style={{ height, minHeight: height }}
        title="Clic = placer un cue · Ctrl+Scroll = zoom"
      >
        <div ref={containerRef} className="w-full h-full" />

        {/* Loading overlay */}
        {loading && !isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span>Chargement…</span>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <span className="text-xs text-red-400">{error}</span>
          </div>
        )}

        {/* Hint overlay quand prêt */}
        {isReady && cuePoints.length === 0 && (
          <div className="absolute bottom-1 right-2 text-[10px] text-white/30 pointer-events-none select-none">
            clic = cue · ctrl+scroll = zoom
          </div>
        )}
      </div>

      {/* Barre de contrôles */}
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

        {/* Volume Controls */}
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
