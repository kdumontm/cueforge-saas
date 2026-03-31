'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { SkipBack, SkipForward } from 'lucide-react';
import dynamic from 'next/dynamic';
import HotCuesBar from './HotCuesBar';
import KeyBadge from '@/components/ui/KeyBadge';
import EnergyBar from '@/components/ui/EnergyBar';

// WaveSurferPlayer chargé côté client uniquement (pas de SSR)
const WaveSurferPlayer = dynamic(() => import('./WaveSurferPlayer'), { ssr: false });

interface CuePoint {
  id: number;
  position_ms: number;
  color?: string | null;
  color_rgb?: string | null;
  name?: string;
  number?: number | null;
  cue_mode?: string;
  time?: string;
  label?: string;
  slot?: number;
}

interface Track {
  id: number;
  title: string;
  artist: string;
  genre?: string;
  bpm?: number | null;
  key?: string | null;
  energy?: number | null;
  duration?: string;
  color?: string | null;
  waveformPeaks?: number[] | null;
}

interface PlayerCardProps {
  track: Track | null;
  cuePoints?: CuePoint[];
  onImportClick?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onTimeUpdate?: (positionMs: number) => void;
  onWaveformClick?: (positionMs: number) => void; // clic sur waveform → poser un cue
  playerRef?: React.MutableRefObject<any>;
}

const ZOOM_LEVELS = [0.5, 1, 2, 4] as const;
type ZoomLevel = typeof ZOOM_LEVELS[number];

// Convertit une durée "m:ss" en secondes
function parseDuration(d?: string): number {
  if (!d) return 0;
  const parts = d.split(':');
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  return 0;
}

// Format seconds to m:ss
function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function PlayerCard({
  track,
  cuePoints = [],
  onImportClick,
  onPrev,
  onNext,
  onTimeUpdate,
  onWaveformClick,
  playerRef,
}: PlayerCardProps) {
  const [zoom, setZoom] = useState<ZoomLevel>(1);
  // Clé pour forcer le remount de WaveSurfer quand le track change
  const [playerKey, setPlayerKey] = useState(0);
  const prevTrackId = useRef<number | null>(null);
  const wsPlayerRef = useRef<any>(null);
  const [loopIn, setLoopIn] = useState<number | null>(null);
  const [loopOut, setLoopOut] = useState<number | null>(null);
  const [loopActive, setLoopActive] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (track && track.id !== prevTrackId.current) {
      prevTrackId.current = track.id;
      setPlayerKey(k => k + 1);
      setZoom(1);
      setLoopIn(null);
      setLoopOut(null);
      setLoopActive(false);
    }
  }, [track?.id]);

  // Hot cues bar : transforme les cue points en format HotCuesBar
  const hotCues = cuePoints.map((c, i) => ({
    slot: c.number ?? i,
    time: c.position_ms
      ? `${Math.floor(c.position_ms / 60000)}:${String(Math.floor((c.position_ms % 60000) / 1000)).padStart(2, '0')}`
      : (c.time || '0:00'),
    label: c.name || c.label || `Cue ${i + 1}`,
  }));

  if (!track) {
    return (
      <div className="bg-[var(--bg-card)] border-2 border-dashed border-[var(--border-default)] rounded-[14px] p-10 flex flex-col items-center gap-4 mb-3">
        <div className="text-5xl opacity-25">🎵</div>
        <div className="text-base font-semibold text-[var(--text-secondary)]">Glisse tes tracks ici</div>
        <div className="text-[13px] text-[var(--text-muted)]">ou sélectionne un track dans la liste ci-dessous</div>
        <button
          onClick={onImportClick}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold cursor-pointer border-none hover:bg-blue-500 transition-colors"
        >
          ⬆️ Importer des tracks
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] mb-3 overflow-hidden">
      {/* Track info row */}
      <div className="flex items-center gap-4 px-[18px] pt-[14px] pb-[10px]">
        <div
          className="w-11 h-11 rounded-[10px] flex items-center justify-center text-xl flex-shrink-0"
          style={{
            background: track.color ? track.color + '30' : 'var(--bg-elevated)',
            border: `1px solid ${track.color || 'var(--border-default)'}40`,
          }}
        >
          🎵
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-[var(--text-primary)] truncate">{track.title}</div>
          <div className="text-xs text-[var(--text-secondary)]">
            {track.artist}{track.genre ? ` · ${track.genre}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {track.bpm && (
            <span className="inline-flex items-center px-[7px] py-[2px] rounded-[5px] text-[10px] font-bold font-mono bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
              {typeof track.bpm === 'number' ? track.bpm.toFixed(1) : track.bpm} BPM
            </span>
          )}
          {track.key && <KeyBadge camelotKey={track.key} />}
          {track.energy != null && <EnergyBar energy={track.energy} showValue width={50} />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onPrev}
            disabled={!onPrev}
            className="bg-transparent border-none cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Track précédent"
          >
            <SkipBack size={18} />
          </button>
          <button
            onClick={onNext}
            disabled={!onNext}
            className="bg-transparent border-none cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Track suivant"
          >
            <SkipForward size={18} />
          </button>
        </div>
      </div>

      {/* WaveSurfer — vrai player interactif */}
      <div className="px-[18px] pb-2">
        <WaveSurferPlayer
          key={`ws-${track.id}-${playerKey}`}
          trackId={track.id}
          trackDuration={parseDuration(track.duration)}
          cuePoints={cuePoints}
          zoom={zoom}
          height={88}
          onTimeUpdate={(ms) => {
            setCurrentTime(ms / 1000);
            onTimeUpdate?.(ms);
          }}
          onWaveformClick={onWaveformClick}
          playerRef={wsPlayerRef}
          onLoopChange={(loopInVal, loopOutVal, loopActiveVal) => {
            setLoopIn(loopInVal);
            setLoopOut(loopOutVal);
            setLoopActive(loopActiveVal);
          }}
          onSetLoopIn={() => {
            setLoopIn(currentTime);
          }}
          onSetLoopOut={() => {
            setLoopOut(currentTime);
            if (loopIn !== null && currentTime > loopIn) setLoopActive(true);
          }}
          onToggleLoop={() => {
            if (loopIn !== null && loopOut !== null && loopIn < loopOut) {
              setLoopActive(prev => !prev);
            }
          }}
        />
      </div>


      {/* Loop / Zoom row */}
      <div className="flex items-center gap-2 px-[18px] py-[6px] pb-[10px] border-t border-[var(--border-subtle)]">
        <button
          onClick={() => wsPlayerRef.current?.setLoopIn?.()}
          className={`px-2.5 py-[3px] rounded-md border text-[11px] cursor-pointer transition-colors ${
            loopIn !== null
              ? 'border-blue-500/50 bg-blue-500/15 text-blue-400 font-semibold'
              : 'border-[var(--border-default)] bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          IN
        </button>
        <button
          onClick={() => wsPlayerRef.current?.toggleLoop?.()}
          disabled={loopIn === null || loopOut === null}
          className={`px-2.5 py-[3px] rounded-md border text-[11px] font-semibold cursor-pointer transition-colors ${
            loopActive
              ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-400'
              : 'border-[var(--border-default)] bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          🔁 LOOP
        </button>
        <button
          onClick={() => wsPlayerRef.current?.setLoopOut?.()}
          className={`px-2.5 py-[3px] rounded-md border text-[11px] cursor-pointer transition-colors ${
            loopOut !== null
              ? 'border-orange-500/50 bg-orange-500/15 text-orange-400 font-semibold'
              : 'border-[var(--border-default)] bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          OUT
        </button>
        {loopIn !== null && loopOut !== null && (
          <div className="text-[10px] text-[var(--text-muted)] font-mono">
            {fmt(loopIn)} → {fmt(loopOut)}
          </div>
        )}
        <div className="flex-1" />
        {/* Zoom buttons — fonctionnels */}
        <span className="text-[10px] text-[var(--text-muted)] mr-1">Zoom:</span>
        {ZOOM_LEVELS.map(z => (
          <button
            key={z}
            onClick={() => setZoom(z)}
            className={`px-[7px] py-[2px] rounded-[5px] border text-[10px] cursor-pointer transition-colors ${
              zoom === z
                ? 'border-blue-500/60 bg-blue-600/25 text-blue-400 font-semibold'
                : 'border-[var(--border-default)] bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {z}×
          </button>
        ))}
      </div>
    </div>
  );
}
