'use client';

import { useMemo, useState } from 'react';
import { Search, Grid3x3, List, Upload } from 'lucide-react';
import { FilterPanel } from './FilterPanel';
import { TrackRow } from './TrackRow';
import { TrackGrid } from './TrackGrid';
import type { Track } from '@/types';

interface TrackListProps {
  tracks: Track[];
  selectedTrack: Track | null;
  playingTrackId: number | null;
  favoriteIds: Set<number>;
  selectedIds?: Set<number>;
  searchQuery: string;
  gridView: boolean;
  sortBy: string;
  filters: {
    bpmMin: number;
    bpmMax: number;
    keyFilter: string | null;
    genreFilter: string | null;
    energyMin: number;
    energyMax: number;
    showAnalyzedOnly: boolean;
    showFavoritesOnly: boolean;
  };
  genres: string[];
  onSelect: (track: Track, e?: React.MouseEvent) => void;
  onDoubleClick: (track: Track) => void;
  onContextMenu: (track: Track, e: React.MouseEvent) => void;
  onFavoriteToggle: (trackId: number) => void;
  onRatingChange?: (trackId: number, rating: number) => void;
  onSearchChange: (query: string) => void;
  onSortChange: (sortBy: string) => void;
  onGridToggle: (gridView: boolean) => void;
  onFilterChange: (key: string, value: any) => void;
  onFilterReset: () => void;
  isLoading?: boolean;
  // Auto-analyse controls (displayed in toolbar)
  unanalyzedCount?: number;
  autoAnalyze?: boolean;
  onToggleAutoAnalyze?: () => void;
  onAnalyzeAll?: () => void;
}

const SORT_OPTIONS = [
  { value: 'date', label: 'Date (récent)' },
  { value: 'bpm', label: 'BPM' },
  { value: 'key', label: 'Tonalité' },
  { value: 'title', label: 'Titre' },
  { value: 'energy', label: 'Énergie' },
  { value: 'genre', label: 'Genre' },
  { value: 'duration', label: 'Durée' },
  { value: 'rating', label: 'Évaluation' },
];

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  return m + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
};

const COLUMN_HEADERS = [
  { key: 'index', label: '#', width: '40px' },
  { key: 'play', label: '', width: '40px' },
  { key: 'title', label: 'Titre', width: '2fr' },
  { key: 'bpm', label: 'BPM', width: '80px' },
  { key: 'key', label: 'Tonalité', width: '80px' },
  { key: 'energy', label: 'Énergie', width: '120px' },
  { key: 'genre', label: 'Genre', width: '100px' },
  { key: 'duration', label: 'Durée', width: '80px' },
  { key: 'rating', label: '', width: '40px' },
  { key: 'actions', label: '', width: '40px' },
];

export function TrackList({
  tracks,
  selectedTrack,
  playingTrackId,
  favoriteIds,
  searchQuery,
  gridView,
  sortBy,
  filters,
  genres,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onFavoriteToggle,
  onRatingChange,
  onSearchChange,
  onSortChange,
  onGridToggle,
  onFilterChange,
  selectedIds = new Set(),
  onFilterReset,
  isLoading = false,
  unanalyzedCount = 0,
  autoAnalyze = false,
  onToggleAutoAnalyze,
  onAnalyzeAll,
}: TrackListProps) {
  const [showFilters, setShowFilters] = useState(false);

  // Filter and sort tracks
  const filteredTracks = useMemo(() => {
    let result = [...tracks];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.artist.toLowerCase().includes(query) ||
          (t.genre && t.genre.toLowerCase().includes(query))
      );
    }

    // BPM filter
    if (filters.bpmMin > 0 || filters.bpmMax < 300) {
      result = result.filter(
        (t) => t.bpm && t.bpm >= filters.bpmMin && t.bpm <= filters.bpmMax
      );
    }

    // Key filter
    if (filters.keyFilter) {
      result = result.filter((t) => t.key === filters.keyFilter);
    }

    // Genre filter
    if (filters.genreFilter) {
      result = result.filter((t) => t.genre === filters.genreFilter);
    }

    // Energy filter
    if (filters.energyMin > 0 || filters.energyMax < 100) {
      result = result.filter(
        (t) =>
          t.energy !== undefined &&
          t.energy >= filters.energyMin &&
          t.energy <= filters.energyMax
      );
    }

    // Analyzed only
    if (filters.showAnalyzedOnly) {
      result = result.filter((t) => t.analyzed !== false);
    }

    // Favorites only
    if (filters.showFavoritesOnly) {
      result = result.filter((t) => favoriteIds.has(t.id));
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'bpm':
          return (b.bpm || 0) - (a.bpm || 0);
        case 'key':
          return (a.key || '').localeCompare(b.key || '');
        case 'title':
          return a.title.localeCompare(b.title);
        case 'energy':
          return (b.energy || 0) - (a.energy || 0);
        case 'genre':
          return (a.genre || '').localeCompare(b.genre || '');
        case 'duration':
          return (b.duration || 0) - (a.duration || 0);
        case 'rating':
          return (favoriteIds.has(b.id) ? 1 : 0) - (favoriteIds.has(a.id) ? 1 : 0);
        case 'date':
        default:
          return (b.id || 0) - (a.id || 0);
      }
    });

    return result;
  }, [tracks, searchQuery, filters, favoriteIds, sortBy]);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)]">
      {/* Toolbar compact */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
        {/* Auto-analyse toggle */}
        {onToggleAutoAnalyze && (
          <button
            onClick={onToggleAutoAnalyze}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] whitespace-nowrap cursor-pointer transition-all flex-shrink-0 ${
              autoAnalyze
                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-400 font-semibold'
                : 'bg-transparent border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--border-default)]'
            }`}
            title={autoAnalyze ? 'Auto-analyse activée' : 'Auto-analyse désactivée'}
          >
            <span className={`w-5 h-2.5 rounded-full relative flex-shrink-0 transition-colors ${autoAnalyze ? 'bg-emerald-500' : 'bg-[var(--bg-elevated)]'}`}>
              <span className={`absolute top-0.5 w-1.5 h-1.5 rounded-full bg-white shadow transition-transform ${autoAnalyze ? 'translate-x-2.5' : 'translate-x-0.5'}`} />
            </span>
            Auto
          </button>
        )}

        {/* Unanalyzed badge + Analyser tout */}
        {unanalyzedCount > 0 && onAnalyzeAll && (
          <button
            onClick={onAnalyzeAll}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-400 text-[11px] font-semibold whitespace-nowrap cursor-pointer hover:bg-amber-500/20 transition-colors flex-shrink-0"
            title={`${unanalyzedCount} tracks à analyser — cliquer pour lancer`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
            {unanalyzedCount} à analyser
          </button>
        )}

        {/* Search Input */}
        <div className="flex-1 relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        {/* Sort Dropdown compact */}
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
          className="px-2 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        {/* View Toggle compact */}
        <div className="flex gap-0.5 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md p-0.5">
          <button
            onClick={() => onGridToggle(false)}
            className={`p-1 rounded transition-colors ${!gridView ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
          >
            <List size={13} />
          </button>
          <button
            onClick={() => onGridToggle(true)}
            className={`p-1 rounded transition-colors ${gridView ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
          >
            <Grid3x3 size={13} />
          </button>
        </div>

        {/* Filter Panel inline */}
        <FilterPanel
          filters={filters}
          genres={genres}
          onFilterChange={onFilterChange}
          onReset={onFilterReset}
        />
      </div>

      {/* Track Count */}
      <div className="px-4 py-2 text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
        {filteredTracks.length} morceau{filteredTracks.length !== 1 ? 'x' : ''}
        {tracks.length !== filteredTracks.length &&
          ` (${tracks.length} total)`}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          // Loading Skeleton
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-10 bg-[var(--bg-secondary)] rounded animate-pulse"
              />
            ))}
          </div>
        ) : filteredTracks.length === 0 ? (
          // Empty State
          <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
            <Upload size={48} className="text-[var(--text-secondary)] opacity-50" />
            <div>
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-1">
                Aucun morceau
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Commencez par importer vos pistes audio
              </p>
            </div>
          </div>
        ) : gridView ? (
          // Grid View
          <TrackGrid
            tracks={filteredTracks}
            selectedTrack={selectedTrack}
            playingTrackId={playingTrackId}
            favoriteIds={favoriteIds}
            onSelect={onSelect}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            onFavoriteToggle={onFavoriteToggle}
            onRatingChange={onRatingChange}
          />
        ) : (
          // List View
          <div className="flex flex-col">
            {/* Column Headers */}
            <div className="sticky top-0 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] px-4 py-2">
              <div
                className="grid gap-3 text-xs font-medium text-[var(--text-secondary)]"
                style={{
                  gridTemplateColumns: COLUMN_HEADERS.map((h) => h.width).join(' '),
                }}
              >
                {COLUMN_HEADERS.map((header) => (
                  <button
                    key={header.key}
                    onClick={() => {
                      if (header.key !== 'index' && header.key !== 'play') {
                        onSortChange(header.key);
                      }
                    }}
                    className={`text-left hover:text-[var(--text-primary)] transition-colors ${
                      header.key === 'index' || header.key === 'play'
                        ? 'cursor-default'
                        : 'cursor-pointer'
                    }`}
                  >
                    {header.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Rows */}
            {filteredTracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index}
                isSelected={selectedTrack?.id === track.id}
                isMultiSelected={selectedIds.has(track.id)}
                isPlaying={playingTrackId === track.id}
                isFavorite={favoriteIds.has(track.id)}
                onSelect={onSelect}
                onDoubleClick={onDoubleClick}
                onContextMenu={onContextMenu}
                onFavoriteToggle={onFavoriteToggle}
                onRatingChange={onRatingChange}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TrackList;
