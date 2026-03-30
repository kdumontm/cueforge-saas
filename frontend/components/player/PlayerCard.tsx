'use client';
import { useState } from 'react';
import { SkipBack, SkipForward, Play, Pause } from 'lucide-react';
import WaveformDisplay from './WaveformDisplay';
import HotCuesBar from './HotCuesBar';
import KeyBadge from '@/components/ui/KeyBadge';
import EnergyBar from '@/components/ui/EnergyBar';

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
}

interface PlayerCardProps {
  track: Track | null;
}

// Mock hot cues — will come from API
const MOCK_HOT_CUES = [
  { slot: 0, time: "0:32", label: "Intro" },
  { slot: 2, time: "1:45", label: "Drop" },
  { slot: 4, time: "4:10", label: "Break" },
  { slot: 6, time: "5:55", label: "Outro" },
];

export default function PlayerCard({ track }: PlayerCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  if (!track) {
    return (
      <div className="bg-[var(--bg-card)] border-2 border-dashed border-[var(--border-default)] rounded-[14px] p-10 flex flex-col items-center gap-4 mb-3">
        <div className="text-5xl opacity-25">🎵</div>
        <div className="text-base font-semibold text-[var(--text-secondary)]">Glisse tes tracks ici</div>
        <div className="text-[13px] text-[var(--text-muted)]">ou sélectionne un track dans la liste ci-dessous</div>
        <button className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold cursor-pointer border-none">
          ⬆️ Importer des tracks
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] mb-3 overflow-hidden">
      {/* Track info row */}
      <div className="flex items-center gap-4 px-[18px] pt-[14px] pb-[10px]">
        {/* Artwork placeholder */}
        <div
          className="w-11 h-11 rounded-[10px] flex items-center justify-center text-xl"
          style={{
            background: track.color ? track.color + '30' : 'var(--bg-elevated)',
            border: `1px solid ${track.color || 'var(--border-default)'}40`,
          }}
        >
          🎵
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-[var(--text-primary)] truncate">{track.title}</div>
          <div className="text-xs text-[var(--text-secondary)]">
            {track.artist}{track.genre ? ` · ${track.genre}` : ''}
          </div>
        </div>
        {/* Badges */}
        <div className="flex items-center gap-2">
          {track.bpm && (
            <span className="inline-flex items-center px-[7px] py-[2px] rounded-[5px] text-[10px] font-bold font-mono bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
              {track.bpm} BPM
            </span>
          )}
          {track.key && <KeyBadge camelotKey={track.key} />}
          {track.energy != null && <EnergyBar energy={track.energy} showValue width={50} />}
        </div>
        {/* Transport controls */}
        <div className="flex items-center gap-2">
          <button className="bg-transparent border-none cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1">
            <SkipBack size={18} />
          </button>
          <button
            onClick={() => setIsPlaying(p => !p)}
            className="w-[38px] h-[38px] rounded-full bg-blue-600 border-none cursor-pointer flex items-center justify-center text-white hover:bg-blue-500 transition-colors"
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </button>
          <button className="bg-transparent border-none cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1">
            <SkipForward size={18} />
          </button>
        </div>
      </div>

      {/* Waveform overview */}
      <div className="px-[18px] pb-1">
        <div className="bg-[var(--bg-elevated)] rounded-md overflow-hidden h-8">
          <WaveformDisplay height={32} overview />
        </div>
      </div>

      {/* Waveform detailed */}
      <div className="px-[18px] py-1">
        <div className="bg-[var(--bg-primary)] rounded-lg overflow-hidden h-20 relative">
          <WaveformDisplay height={80} hotCues={MOCK_HOT_CUES} />
          {/* Beatgrid lines */}
          {Array.from({ length: 32 }, (_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0"
              style={{
                left: `${(i / 32) * 100}%`,
                width: 1,
                background: i % 4 === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Hot Cues row */}
      <HotCuesBar hotCues={MOCK_HOT_CUES} />

      {/* Time / Loop row */}
      <div className="flex items-center gap-4 px-[18px] py-[6px] pb-[10px] border-t border-[var(--border-subtle)]">
        <span className="text-xs text-[var(--text-primary)] font-mono">2:21</span>
        <span className="text-xs text-[var(--text-muted)] font-mono">-4:21</span>
        <span className="text-xs text-[var(--text-muted)] font-mono">/ {track.duration || '0:00'}</span>
        <div className="flex-1" />
        <button className="px-2.5 py-[3px] rounded-md border border-[var(--border-default)] bg-transparent text-[var(--text-muted)] text-[11px] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors">
          IN
        </button>
        <button className="px-2.5 py-[3px] rounded-md border border-emerald-500/50 bg-emerald-500/15 text-emerald-400 text-[11px] font-semibold cursor-pointer">
          🔁 LOOP
        </button>
        <button className="px-2.5 py-[3px] rounded-md border border-[var(--border-default)] bg-transparent text-[var(--text-muted)] text-[11px] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors">
          OUT
        </button>
        <div className="flex gap-1 ml-2">
          {["0.5×", "1×", "2×", "4×"].map(z => (
            <button
              key={z}
              className={`px-[7px] py-[2px] rounded-[5px] border text-[10px] cursor-pointer transition-colors ${
                z === "1×"
                  ? 'border-blue-500/40 bg-blue-600/20 text-blue-400'
                  : 'border-[var(--border-default)] bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {z}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
