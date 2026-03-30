'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const ZOOM_PX_PER_SEC: Record<string, number> = {
  '0.5': 12,
  '1':   30,
  '2':   70,
  '4':  160,
};

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

  // --- Formatage temps ---
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

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
      </div>
    </div>
  );
}
