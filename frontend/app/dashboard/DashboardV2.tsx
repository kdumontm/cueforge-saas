// @ts-nocheck
'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Upload, Loader2, Zap, RefreshCw } from 'lucide-react';
import { uploadTrack, analyzeTrack, pollTrackUntilDone, listTracks, deleteTrack, getTrack, getCurrentUser, isAuthenticated } from '@/lib/api';
import type { Track } from '@/types';
import { useDashboardContext } from './DashboardContext';

import PlayerCard from '@/components/player/PlayerCard';
import TrackList from '@/components/tracks/TrackList';
import CuesTab from '@/components/tabs/CuesTab';
import BeatgridTab from '@/components/tabs/BeatgridTab';
import StemsTab from '@/components/tabs/StemsTab';
import EQTab from '@/components/tabs/EQTab';
import FXTab from '@/components/tabs/FXTab';
import MixTab from '@/components/tabs/MixTab';
import PlaylistsTab from '@/components/tabs/PlaylistsTab';
import StatsTab from '@/components/tabs/StatsTab';
import HistoryTab from '@/components/tabs/HistoryTab';

// ── Camelot conversion ─────────────────────────────────────────────────
const CAMELOT_WHEEL_MAP: Record<string, string> = {
  'C': '8B', 'Am': '8A', 'G': '9B', 'Em': '9A', 'D': '10B', 'Bm': '10A',
  'A': '11B', 'F#m': '11A', 'E': '12B', 'C#m': '12A', 'B': '1B', 'G#m': '1A',
  'F#': '2B', 'Ebm': '2A', 'Db': '3B', 'Bbm': '3A', 'Ab': '4B', 'Fm': '4A',
  'Eb': '5B', 'Cm': '5A', 'Bb': '6B', 'Gm': '6A', 'F': '7B', 'Dm': '7A',
  'C#': '3B', 'D#m': '2A', 'G#': '4B', 'A#': '6B', 'D#': '5B',
};

function toCamelot(key: string | null | undefined): string | null {
  if (!key) return null;
  return CAMELOT_WHEEL_MAP[key] || key;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || isNaN(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Tab config ─────────────────────────────────────────────────────────
const TABS = [
  { id: 'cues', label: 'Cues', icon: '🎯' },
  { id: 'beatgrid', label: 'Beatgrid', icon: '⊞' },
  { id: 'stems', label: 'Stems', icon: '🎸' },
  { id: 'eq', label: 'EQ', icon: '〰' },
  { id: 'fx', label: 'FX', icon: '✨' },
  { id: 'mix', label: 'Mix', icon: '🎡' },
  { id: 'playlists', label: 'Playlists', icon: '💿' },
  { id: 'stats', label: 'Stats', icon: '📊' },
  { id: 'history', label: 'Historique', icon: '🕐' },
];

const GLOBAL_TABS = ['stats', 'history', 'playlists'];

// ── Demo tracks (shown when user has no real tracks yet) ──────────────
const DEMO_TRACKS: any[] = [
  { id: -1, title: "Shed My Skin", artist: "Ben Bohmer", genre: "Melodic House", bpm: 124, key: "6A", energy: 72, duration: "6:42", rating: 5, tags: ["peak", "vocal"], analyzed: true, color: "#22c55e" },
  { id: -2, title: "Lost Highway", artist: "Stephan Bodzin", genre: "Techno", bpm: 134, key: "10B", energy: 88, duration: "8:15", rating: 4, tags: ["dark", "peak"], analyzed: true, color: "#ef4444" },
  { id: -3, title: "Equinox", artist: "Solomun", genre: "Deep House", bpm: 122, key: "3A", energy: 65, duration: "7:30", rating: 4, tags: ["warmup"], analyzed: true, color: "#3b82f6" },
  { id: -4, title: "Disco Volante", artist: "ANNA", genre: "Techno", bpm: 136, key: "8A", energy: 91, duration: "7:05", rating: 5, tags: ["peak", "dark"], analyzed: true, color: "#ef4444" },
  { id: -5, title: "Dreamer", artist: "Tale Of Us", genre: "Melodic House", bpm: 120, key: "1A", energy: 58, duration: "9:10", rating: 3, tags: ["warmup", "vocal"], analyzed: true, color: "#06b6d4" },
  { id: -6, title: "Bangalore", artist: "Bicep", genre: "House", bpm: 128, key: "4B", energy: 80, duration: "5:55", rating: 4, tags: ["festival"], analyzed: true, color: "#f97316" },
];

// ── Main Component ─────────────────────────────────────────────────────
export default function DashboardV2() {
  const { activeSection, globalSearch, registerImportHandler } = useDashboardContext();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('cues');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Register import handler so Sidebar/TopBar can trigger file upload
  useEffect(() => {
    registerImportHandler(() => fileRef.current?.click());
  }, [registerImportHandler]);

  // TrackList state
  const [searchQuery, setSearchQuery] = useState('');
  const [gridView, setGridView] = useState(false);
  const [sortBy, setSortBy] = useState('date');
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState({
    bpmMin: 0, bpmMax: 300, keyFilter: null as string | null, genreFilter: null as string | null,
    energyMin: 0, energyMax: 100, showAnalyzedOnly: false, showFavoritesOnly: false,
  });
  const DEFAULT_FILTERS = { bpmMin: 0, bpmMax: 300, keyFilter: null, genreFilter: null, energyMin: 0, energyMax: 100, showAnalyzedOnly: false, showFavoritesOnly: false };

  const genres = useMemo(() => {
    const g = new Set(tracks.map((t: any) => t.analysis?.genre).filter(Boolean));
    return Array.from(g) as string[];
  }, [tracks]);

  // Combine global search with track list search
  const effectiveSearch = globalSearch || searchQuery;

  // Filter tracks based on sidebar section
  const sectionFilteredTracks = useMemo(() => {
    let result = tracks;
    if (activeSection === 'recent') {
      result = [...tracks].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10);
    } else if (activeSection === 'unanalyzed') {
      result = tracks.filter(t => t.status !== 'analyzed');
    } else if (activeSection === 'crate_peak') {
      result = tracks.filter(t => (t.analysis?.energy || 0) >= 0.7);
    } else if (activeSection === 'crate_warmup') {
      result = tracks.filter(t => {
        const e = t.analysis?.energy || 0;
        return e >= 0.3 && e < 0.7;
      });
    } else if (activeSection === 'crate_vocal') {
      // Placeholder — filter by tags containing 'vocal' if available
      result = tracks.filter(t => t.tags?.toLowerCase().includes('vocal'));
    }
    // 'all' and playlist IDs show all tracks (playlists will use API later)
    return result;
  }, [tracks, activeSection]);

  const realDisplayTracks = useMemo(() => sectionFilteredTracks.map(toDisplayTrack), [sectionFilteredTracks]);

  // Use demo tracks when no real tracks exist
  const isDemo = realDisplayTracks.length === 0 && !loading;
  const displayTracks = isDemo ? DEMO_TRACKS : realDisplayTracks;

  // Auto-select first track when loaded (real or demo)
  useEffect(() => {
    if (!selectedTrack && displayTracks.length > 0 && !loading) {
      setSelectedTrack(displayTracks[0]);
    }
  }, [displayTracks, loading]);

  // Load tracks from API
  useEffect(() => {
    loadTracks();
  }, []);

  async function loadTracks() {
    try {
      setLoading(true);
      if (!isAuthenticated()) return;
      const data = await listTracks();
      // Handle both array and {tracks: [...]} response formats
      const trackList = Array.isArray(data) ? data : (data?.tracks || []);
      setTracks(trackList);
    } catch (e: any) {
      console.error('Failed to load tracks:', e);
      // If session expired, don't crash — just show empty state
      if (e?.message === 'Session expired' || e?.message === 'Not authenticated') {
        setTracks([]);
        return;
      }
    } finally {
      setLoading(false);
    }
  }

  // Transform API track to display format
  function toDisplayTrack(t: Track) {
    const analysis = t.analysis || {} as any;
    return {
      id: t.id,
      title: t.title || t.original_filename || t.filename || 'Unknown',
      artist: t.artist || 'Unknown',
      genre: analysis.genre || '—',
      bpm: analysis.bpm ? Math.round(analysis.bpm * 10) / 10 : null,
      key: toCamelot(analysis.key),
      energy: analysis.energy ? Math.round(analysis.energy * 100) : null,
      duration: formatDuration(analysis.duration_ms ? analysis.duration_ms / 1000 : null),
      rating: t.rating || 0,
      tags: t.tags ? (typeof t.tags === 'string' ? t.tags.split(',').filter(Boolean) : t.tags) : [],
      analyzed: t.status === 'analyzed',
      color: null,
      waveformPeaks: analysis.waveform_peaks || null,
    };
  }

  function handleSelectTrack(track: any) {
    setSelectedTrack(track);
  }

  // Navigation prev/next dans la liste
  function handlePrev() {
    if (!selectedTrack || displayTracks.length === 0) return;
    const idx = displayTracks.findIndex((t: any) => t.id === selectedTrack.id);
    if (idx > 0) setSelectedTrack(displayTracks[idx - 1]);
  }

  function handleNext() {
    if (!selectedTrack || displayTracks.length === 0) return;
    const idx = displayTracks.findIndex((t: any) => t.id === selectedTrack.id);
    if (idx < displayTracks.length - 1) setSelectedTrack(displayTracks[idx + 1]);
  }

  // File upload
  async function handleFiles(files: FileList) {
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const uploaded = await uploadTrack(file);
        if (uploaded?.id) {
          await analyzeTrack(uploaded.id);
          await pollTrackUntilDone(uploaded.id);
        }
      } catch (e) {
        console.error('Upload failed:', e);
      }
    }
    await loadTracks();
    setUploading(false);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) handleFiles(e.target.files);
  }

  const unanalyzedCount = tracks.filter(t => t.status !== 'analyzed').length;

  return (
    <div
      className="p-4 space-y-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleFileDrop}
    >
      {/* Demo banner */}
      {isDemo && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-xl">
          <span className="text-sm">🎧</span>
          <span className="text-sm text-[var(--text-primary)]">
            <strong>Mode demo</strong> — Importe tes tracks pour commencer l'analyse !
          </span>
          <button
            onClick={() => fileRef.current?.click()}
            className="ml-auto px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer border-none hover:bg-blue-500 transition-colors"
          >
            Importer
          </button>
        </div>
      )}

      {/* Player Card */}
      <PlayerCard
        track={selectedTrack}
        onImportClick={() => fileRef.current?.click()}
        onPrev={selectedTrack && displayTracks.findIndex((t: any) => t.id === selectedTrack.id) > 0 ? handlePrev : undefined}
        onNext={selectedTrack && displayTracks.findIndex((t: any) => t.id === selectedTrack.id) < displayTracks.length - 1 ? handleNext : undefined}
      />

      {/* Tab Panel */}
      <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] overflow-hidden">
        {/* Tab bar */}
        <div className="flex gap-0 border-b border-[var(--border-subtle)] overflow-x-auto">
          {TABS.map(t => {
            const disabled = !selectedTrack && !GLOBAL_TABS.includes(t.id);
            return (
              <button
                key={t.id}
                onClick={() => !disabled && setActiveTab(t.id)}
                disabled={disabled}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 border-none text-xs whitespace-nowrap transition-all ${
                  activeTab === t.id
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold border-b-2 border-b-blue-500'
                    : disabled
                      ? 'text-[var(--text-muted)] opacity-40 cursor-not-allowed'
                      : 'text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
                style={{
                  borderBottom: activeTab === t.id ? '2px solid #2563eb' : '2px solid transparent',
                  background: activeTab === t.id ? 'var(--bg-elevated)' : 'transparent',
                }}
              >
                <span className="text-[13px]">{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="p-4 min-h-[160px]">
          {activeTab === 'cues' && <CuesTab track={selectedTrack} />}
          {activeTab === 'beatgrid' && <BeatgridTab track={selectedTrack} />}
          {activeTab === 'stems' && <StemsTab track={selectedTrack} />}
          {activeTab === 'eq' && <EQTab />}
          {activeTab === 'fx' && <FXTab />}
          {activeTab === 'mix' && <MixTab track={selectedTrack} tracks={displayTracks} />}
          {activeTab === 'playlists' && <PlaylistsTab playlists={[]} />}
          {activeTab === 'stats' && <StatsTab tracks={displayTracks} />}
          {activeTab === 'history' && <HistoryTab tracks={displayTracks} />}
        </div>
      </div>

      {/* Track List */}
      <TrackList
        tracks={displayTracks}
        selectedTrack={selectedTrack}
        playingTrackId={null}
        favoriteIds={favoriteIds}
        searchQuery={effectiveSearch}
        gridView={gridView}
        sortBy={sortBy}
        filters={filters}
        genres={genres}
        onSelect={handleSelectTrack}
        onDoubleClick={handleSelectTrack}
        onContextMenu={() => {}}
        onFavoriteToggle={(id: number) => setFavoriteIds(prev => {
          const next = new Set(prev);
          next.has(id) ? next.delete(id) : next.add(id);
          return next;
        })}
        onSearchChange={setSearchQuery}
        onSortChange={setSortBy}
        onGridToggle={setGridView}
        onFilterChange={(key: string, value: any) => setFilters(prev => ({ ...prev, [key]: value }))}
        onFilterReset={() => setFilters(DEFAULT_FILTERS)}
        isLoading={loading}
      />

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".mp3,.wav,.flac,.aac,.ogg,.m4a,.aif"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Upload indicator */}
      {uploading && (
        <div className="fixed bottom-4 right-4 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg z-50">
          <Loader2 size={16} className="text-blue-400 animate-spin" />
          <span className="text-sm text-[var(--text-primary)]">Upload en cours...</span>
        </div>
      )}
    </div>
  );
}
