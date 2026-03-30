'use client';

import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';

interface TransportControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  onVolumeChange: (v: number) => void;
  onMuteToggle: () => void;
  onSeek: (time: number) => void;
}

function formatTime(s: number): string {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function TransportControls({
  isPlaying, onPlayPause, onSkipBack, onSkipForward,
  currentTime, duration, volume, muted, onVolumeChange, onMuteToggle, onSeek,
}: TransportControlsProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-4 px-4 py-2">
      {/* Transport buttons */}
      <div className="flex items-center gap-2">
        <button onClick={onSkipBack} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors">
          <SkipBack size={14} />
        </button>
        <button onClick={onPlayPause} className="w-9 h-9 rounded-full bg-cyan-500 hover:bg-cyan-400 text-white flex items-center justify-center transition-colors shadow-lg shadow-cyan-500/20">
          {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>
        <button onClick={onSkipForward} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors">
          <SkipForward size={14} />
        </button>
      </div>

      {/* Time + Seek */}
      <span className="text-[10px] font-mono text-[var(--text-muted)] w-10 text-right">{formatTime(currentTime)}</span>
      <div className="flex-1 relative h-5 flex items-center group cursor-pointer" onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        onSeek(pct * duration);
      }}>
        <div className="w-full h-1 rounded-full bg-[var(--bg-primary)] overflow-hidden group-hover:h-1.5 transition-all">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `calc(${progress}% - 5px)` }} />
      </div>
      <span className="text-[10px] font-mono text-[var(--text-muted)] w-10">{formatTime(duration)}</span>

      {/* Volume */}
      <div className="flex items-center gap-1.5">
        <button onClick={onMuteToggle} className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          {muted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <input
          type="range" min={0} max={1} step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="w-16 h-1 accent-cyan-500 cursor-pointer"
        />
      </div>
    </div>
  );
}
