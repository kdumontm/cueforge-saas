'use client';
import { useState } from 'react';
import { Search, SlidersHorizontal, List, Grid3X3, Upload, Star, Zap, Check } from 'lucide-react';
import KeyBadge from '@/components/ui/KeyBadge';
import EnergyBar from '@/components/ui/EnergyBar';

interface Track {
  id: number;
  title: string;
  artist: string;
  genre: string;
  bpm: number | null;
  key: string | null;
  energy: number | null;
  duration: string;
  rating: number;
  tags: string[];
  analyzed: boolean;
  color: string | null;
}

const MOCK_TRACKS: Track[] = [
  { id: 1, title: "Shed My Skin", artist: "Ben Böhmer", genre: "Melodic House", bpm: 124, key: "6A", energy: 72, duration: "6:42", rating: 5, tags: ["peak", "vocal"], analyzed: true, color: "#22c55e" },
  { id: 2, title: "Lost Highway", artist: "Stephan Bodzin", genre: "Techno", bpm: 134, key: "10B", energy: 88, duration: "8:15", rating: 4, tags: ["dark", "peak"], analyzed: true, color: "#ef4444" },
  { id: 3, title: "Equinox", artist: "Solomun", genre: "Deep House", bpm: 122, key: "3A", energy: 65, duration: "7:30", rating: 4, tags: ["warmup"], analyzed: true, color: "#3b82f6" },
  { id: 4, title: "Disco Volante", artist: "ANNA", genre: "Techno", bpm: 136, key: "8A", energy: 91, duration: "7:05", rating: 5, tags: ["peak", "dark"], analyzed: true, color: "#ef4444" },
  { id: 5, title: "Dreamer", artist: "Tale Of Us", genre: "Melodic House", bpm: 120, key: "1A", energy: 58, duration: "9:10", rating: 3, tags: ["warmup", "vocal"], analyzed: true, color: "#06b6d4" },
  { id: 6, title: "Bangalore", artist: "Bicep", genre: "House", bpm: 128, key: "4B", energy: 80, duration: "5:55", rating: 4, tags: ["festival"], analyzed: true, color: "#f97316" },
  { id: 7, title: "New Track 01.flac", artist: "Unknown", genre: "—", bpm: null, key: null, energy: null, duration: "5:20", rating: 0, tags: [], analyzed: false, color: null },
  { id: 8, title: "New Track 02.wav", artist: "Unknown", genre: "—", bpm: null, key: null, energy: null, duration: "7:45", rating: 0, tags: [], analyzed: false, color: null },
];

interface TrackListProps {
  onSelectTrack?: (track: Track) => void;
  selectedTrackId?: number | null;
}

export default function TrackList({ onSelectTrack, selectedTrackId }: TrackListProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  return (
    <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border-subtle)]">
        <span className="text-sm font-bold text-[var(--text-primary)]">Tracks</span>
        <span className="inline-flex items-center px-[7px] py-[2px] rounded-[5px] text-[10px] font-bold font-mono bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-default)]">
          {MOCK_TRACKS.length}
        </span>
        <div className="flex-1" />
        {/* Search */}
        <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg px-2.5 py-[5px]">
          <Search size={12} className="text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Rechercher des tracks..."
            className="bg-transparent border-none outline-none text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] w-[150px]"
          />
        </div>
        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-[5px] rounded-lg text-xs cursor-pointer transition-colors ${
            showFilters
              ? 'border border-blue-500/50 bg-blue-600/15 text-blue-400 font-semibold'
              : 'border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
          }`}
        >
          <SlidersHorizontal size={12} /> Filtres
        </button>
        {/* View toggle */}
        <div className="flex border border-[var(--border-default)] rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('list')}
            className={`px-2.5 py-[5px] border-none text-xs cursor-pointer ${
              viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
            }`}
          >
            <List size={13} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`px-2.5 py-[5px] border-none text-xs cursor-pointer ${
              viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
            }`}
          >
            <Grid3X3 size={13} />
          </button>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-[5px] rounded-lg bg-blue-600 text-white text-[11px] font-semibold cursor-pointer border-none">
          <Upload size={12} /> Upload
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] flex gap-5 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="text-[10px] font-semibold text-[var(--text-muted)] mb-1.5">BPM Range</div>
            <div className="flex gap-1.5 flex-wrap">
              {[100, 110, 120, 125, 128, 130, 135, 140, 145].map(bpm => (
                <button key={bpm} className="px-[7px] py-[2px] rounded-[5px] border border-[var(--border-default)] bg-transparent text-[var(--text-muted)] text-[10px] cursor-pointer hover:bg-[var(--bg-hover)]">
                  {bpm}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-[var(--text-muted)] mb-1.5">Tonalité</div>
            <div className="flex gap-1">
              {["Am", "Em", "Bm", "Dm"].map(k => (
                <button key={k} className="px-[7px] py-[2px] rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-muted)] text-[10px] cursor-pointer">{k}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-[var(--text-muted)] mb-1.5">Genre</div>
            <div className="flex gap-1">
              {["Techno", "House", "Melodic"].map(g => (
                <button key={g} className="px-[7px] py-[2px] rounded-[5px] border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-muted)] text-[10px] cursor-pointer">{g}</button>
              ))}
            </div>
          </div>
          <button className="px-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-transparent text-[var(--text-muted)] text-[11px] cursor-pointer">
            Reset
          </button>
        </div>
      )}

      {/* Column headers */}
      <div className="grid gap-0 px-4 py-[7px] border-b border-[var(--border-subtle)]" style={{ gridTemplateColumns: '28px 1fr 80px 70px 60px 70px 80px 60px 80px' }}>
        {["", "TITRE", "BPM", "TONALITÉ", "ÉNERGIE", "DURÉE", "GENRE", "RATING", "TAGS"].map((h, i) => (
          <div key={i} className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider pr-2">{h}</div>
        ))}
      </div>

      {/* Rows */}
      {MOCK_TRACKS.map(t => (
        <div
          key={t.id}
          onClick={() => onSelectTrack?.(t)}
          className={`grid gap-0 px-4 py-[9px] border-b border-[var(--border-subtle)] cursor-pointer items-center transition-colors ${
            selectedTrackId === t.id ? 'bg-blue-600/10' : 'hover:bg-[var(--bg-hover)]'
          }`}
          style={{ gridTemplateColumns: '28px 1fr 80px 70px 60px 70px 80px 60px 80px' }}
        >
          {/* Status */}
          <div className="flex items-center justify-center">
            {t.analyzed ? (
              <Check size={13} className="text-emerald-500" />
            ) : (
              <Zap size={13} className="text-amber-400 cursor-pointer" title="Analyser" />
            )}
          </div>
          {/* Title */}
          <div className="min-w-0 pr-3">
            <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{t.title}</div>
            <div className="text-[11px] text-[var(--text-muted)]">{t.artist}</div>
          </div>
          {/* BPM */}
          <div>
            {t.bpm ? (
              <span className="text-xs font-semibold text-[var(--text-primary)] font-mono">{t.bpm}</span>
            ) : (
              <button className="px-[7px] py-[2px] rounded-[5px] border border-amber-500/40 bg-amber-500/15 text-amber-400 text-[10px] cursor-pointer">
                Analyser
              </button>
            )}
          </div>
          {/* Key */}
          <div>{t.key ? <KeyBadge camelotKey={t.key} /> : <span className="text-[var(--text-muted)]">—</span>}</div>
          {/* Energy */}
          <div><EnergyBar energy={t.energy} width={36} /></div>
          {/* Duration */}
          <div className="text-xs text-[var(--text-secondary)] font-mono">{t.duration}</div>
          {/* Genre */}
          <div className="text-[11px] text-[var(--text-secondary)] truncate">{t.genre}</div>
          {/* Rating */}
          <div className="flex items-center gap-0.5">
            {t.rating > 0 ? (
              Array.from({ length: 5 }, (_, i) => (
                <Star key={i} size={10} className={i < t.rating ? 'text-amber-400 fill-amber-400' : 'text-[var(--text-muted)]'} />
              ))
            ) : (
              <span className="text-[var(--text-muted)]">—</span>
            )}
          </div>
          {/* Tags */}
          <div className="flex gap-1 flex-wrap">
            {t.tags.map(tag => (
              <span key={tag} className="px-[5px] py-[1px] rounded text-[9px] font-semibold bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-default)]">
                {tag}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
