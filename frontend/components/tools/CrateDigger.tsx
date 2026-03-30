// @ts-nocheck
'use client';

import { useState, useMemo } from 'react';
import { Shuffle, Play, Star, ChevronRight, Disc3, Zap, Music } from 'lucide-react';
import type { Track } from '@/types';

interface CrateDiggerProps {
  tracks: Track[];
  onSelectTrack?: (track: Track) => void;
  currentTrack?: Track | null;
}

type DigMode = 'random' | 'energy_journey' | 'genre_explore' | 'hidden_gems';

const DIG_MODES = [
  { id: 'random' as DigMode, label: 'Aléatoire', icon: Shuffle, desc: 'Track au hasard', color: '#3b82f6' },
  { id: 'energy_journey' as DigMode, label: 'Voyage Énergétique', icon: Zap, desc: 'Exploration par énergie', color: '#f59e0b' },
  { id: 'genre_explore' as DigMode, label: 'Explorer le Genre', icon: Music, desc: 'Découvrir des genres', color: '#8b5cf6' },
  { id: 'hidden_gems' as DigMode, label: 'Perles Cachées', icon: Star, desc: 'Tracks peu jouées', color: '#ec4899' },
];

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function formatDuration(ms: number | null | undefined) {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function CrateDigger({ tracks, onSelectTrack, currentTrack }: CrateDiggerProps) {
  const [mode, setMode] = useState<DigMode>('random');
  const [suggestions, setSuggestions] = useState<Track[]>([]);
  const [digCount, setDigCount] = useState(0);

  function dig() {
    if (tracks.length === 0) return;

    let pool: Track[] = [];

    switch (mode) {
      case 'random':
        pool = shuffleArray(tracks);
        break;

      case 'energy_journey': {
        // Group tracks by energy level and pick one from each band
        const bands = [
          { min: 0, max: 0.3, label: 'Chill' },
          { min: 0.3, max: 0.5, label: 'Warm' },
          { min: 0.5, max: 0.7, label: 'Medium' },
          { min: 0.7, max: 0.85, label: 'High' },
          { min: 0.85, max: 1.0, label: 'Peak' },
        ];
        pool = bands.flatMap(band => {
          const bandTracks = tracks.filter(t => {
            const energy = t.analysis?.energy || 0;
            return energy >= band.min && energy < band.max;
          });
          return shuffleArray(bandTracks).slice(0, 1);
        }).filter(Boolean);
        if (pool.length === 0) pool = shuffleArray(tracks);
        break;
      }

      case 'genre_explore': {
        // Pick tracks from genres you have fewer tracks in (variety)
        const genreCount: Record<string, number> = {};
        tracks.forEach(t => {
          const g = t.genre || 'Unknown';
          genreCount[g] = (genreCount[g] || 0) + 1;
        });
        // Sort by least represented genres
        const sortedGenres = Object.entries(genreCount)
          .sort((a, b) => a[1] - b[1])
          .map(([g]) => g);

        // Pick one from each of the 5 rarest genres
        pool = sortedGenres.slice(0, 5).flatMap(genre => {
          const genreTracks = tracks.filter(t => (t.genre || 'Unknown') === genre);
          return shuffleArray(genreTracks).slice(0, 1);
        }).filter(Boolean);
        if (pool.length === 0) pool = shuffleArray(tracks);
        break;
      }

      case 'hidden_gems': {
        // Tracks with low play count and high rating
        const gems = tracks
          .filter(t => (t.played_count || 0) <= 2)
          .sort((a, b) => (b.rating || 0) - (a.rating || 0));
        pool = gems.length > 0 ? shuffleArray(gems) : shuffleArray(tracks);
        break;
      }
    }

    setSuggestions(pool.slice(0, 5));
    setDigCount(prev => prev + 1);
  }

  return (
    <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Disc3 size={16} className="text-blue-400" />
        <span className="text-sm font-bold text-[var(--text-primary)]">Crate Digger</span>
        {digCount > 0 && (
          <span className="text-[11px] text-[var(--text-muted)] ml-auto">{digCount} dig{digCount > 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {DIG_MODES.map(m => {
          const Icon = m.icon;
          const isActive = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all cursor-pointer text-left"
              style={{
                borderColor: isActive ? m.color + '60' : 'var(--border-subtle)',
                background: isActive ? m.color + '15' : 'var(--bg-elevated)',
              }}
            >
              <Icon size={14} style={{ color: isActive ? m.color : 'var(--text-muted)' }} />
              <div>
                <div className="text-[12px] font-medium" style={{ color: isActive ? m.color : 'var(--text-secondary)' }}>
                  {m.label}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">{m.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Dig button */}
      <button
        onClick={dig}
        disabled={tracks.length === 0}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-bold cursor-pointer border-none hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Shuffle size={16} />
        Dig !
      </button>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {suggestions.map((track, idx) => (
            <button
              key={track.id}
              onClick={() => onSelectTrack?.(track)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-default)] transition-all cursor-pointer text-left"
            >
              <span className="text-[11px] font-mono text-[var(--text-muted)] w-4">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                  {track.title || track.original_filename}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] flex gap-2">
                  <span>{track.artist || 'Inconnu'}</span>
                  {track.analysis?.bpm && <span>· {Math.round(track.analysis.bpm)} BPM</span>}
                  {track.analysis?.key && <span>· {track.analysis.key}</span>}
                </div>
              </div>
              {track.analysis?.energy !== undefined && (
                <div className="w-12 h-1.5 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-pink-500 rounded-full"
                    style={{ width: `${(track.analysis.energy || 0) * 100}%` }}
                  />
                </div>
              )}
              <ChevronRight size={14} className="text-[var(--text-muted)]" />
            </button>
          ))}
        </div>
      )}

      {suggestions.length === 0 && tracks.length > 0 && (
        <p className="text-[12px] text-[var(--text-muted)] text-center mt-4">
          Clique sur "Dig" pour découvrir des tracks !
        </p>
      )}
    </div>
  );
}
