'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  ChevronDown,
  Filter,
  Save,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  GripVertical,
  Search,
} from 'lucide-react';

interface Track {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  key: string;
  genre: string;
  energy: number;
  dateAdded: Date;
  duration: number;
}

interface FilterState {
  bpmMin: number;
  bpmMax: number;
  keys: string[];
  genres: string[];
  energyMin: number;
  energyMax: number;
  dateMin: string;
  dateMax: string;
}

interface FilterPreset {
  id: string;
  name: string;
  filters: FilterState;
}

interface SortConfig {
  key: 'bpm' | 'key' | 'genre' | 'energy' | 'date' | 'title';
  direction: 'asc' | 'desc';
}

interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}

const CAMELOT_KEYS = [
  '1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B', '5A', '5B', '6A', '6B',
  '7A', '7B', '8A', '8B', '9A', '9B', '10A', '10B', '11A', '11B', '12A', '12B',
];

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: 'title', label: 'Title', visible: true, order: 0 },
  { id: 'artist', label: 'Artist', visible: true, order: 1 },
  { id: 'bpm', label: 'BPM', visible: true, order: 2 },
  { id: 'key', label: 'Key', visible: true, order: 3 },
  { id: 'genre', label: 'Genre', visible: true, order: 4 },
  { id: 'energy', label: 'Energy', visible: true, order: 5 },
  { id: 'duration', label: 'Duration', visible: true, order: 6 },
];

const DEFAULT_FILTER: FilterState = {
  bpmMin: 60,
  bpmMax: 180,
  keys: [],
  genres: [],
  energyMin: 0,
  energyMax: 10,
  dateMin: '',
  dateMax: '',
};

interface TrackListAdvancedProps {
  tracks: Track[];
  onTrackSelect?: (trackId: string) => void;
  onTrackEdit?: (trackId: string, updates: Partial<Track>) => void;
  onBulkAction?: (trackIds: string[], action: string) => void;
  height?: number;
}

export const TrackListAdvanced: React.FC<TrackListAdvancedProps> = ({
  tracks,
  onTrackSelect,
  onTrackEdit,
  onBulkAction,
  height = 600,
}) => {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'date',
    direction: 'desc',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([]);
  const [groupBy, setGroupBy] = useState<'none' | 'genre' | 'bpmRange' | 'key'>('none');
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<Track>>({});

  // Load state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('track_list_state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.columns) setColumns(parsed.columns);
        if (parsed.filterPresets) setFilterPresets(parsed.filterPresets);
      } catch (e) {
        console.warn('Failed to load track list state', e);
      }
    }
  }, []);

  // Save state to localStorage
  const saveState = useCallback(() => {
    try {
      localStorage.setItem(
        'track_list_state',
        JSON.stringify({ columns, filterPresets })
      );
    } catch (e) {
      console.warn('Failed to save track list state', e);
    }
  }, [columns, filterPresets]);

  useEffect(() => {
    saveState();
  }, [columns, filterPresets, saveState]);

  // Fuzzy search
  const fuzzyMatch = (str: string, query: string): boolean => {
    const lowerStr = str.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let strIdx = 0;
    for (let queryIdx = 0; queryIdx < lowerQuery.length; queryIdx++) {
      strIdx = lowerStr.indexOf(lowerQuery[queryIdx], strIdx);
      if (strIdx === -1) return false;
      strIdx++;
    }
    return true;
  };

  // Filter and sort tracks
  const filteredTracks = useMemo(() => {
    let result = tracks.filter(track => {
      // Text search
      if (
        searchQuery &&
        !fuzzyMatch(track.title + track.artist, searchQuery)
      ) {
        return false;
      }

      // BPM range
      if (track.bpm < filters.bpmMin || track.bpm > filters.bpmMax) {
        return false;
      }

      // Keys
      if (filters.keys.length > 0 && !filters.keys.includes(track.key)) {
        return false;
      }

      // Genres
      if (
        filters.genres.length > 0 &&
        !filters.genres.includes(track.genre)
      ) {
        return false;
      }

      // Energy
      if (
        track.energy < filters.energyMin ||
        track.energy > filters.energyMax
      ) {
        return false;
      }

      // Date range
      if (filters.dateMin) {
        const trackDate = new Date(track.dateAdded).getTime();
        const filterDate = new Date(filters.dateMin).getTime();
        if (trackDate < filterDate) return false;
      }

      if (filters.dateMax) {
        const trackDate = new Date(track.dateAdded).getTime();
        const filterDate = new Date(filters.dateMax).getTime();
        if (trackDate > filterDate) return false;
      }

      return true;
    });

    // Sort
    result.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      let comparison = 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue);
      } else if (aValue instanceof Date && bValue instanceof Date) {
        comparison = aValue.getTime() - bValue.getTime();
      }

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [tracks, filters, searchQuery, sortConfig]);

  // Group tracks
  const groupedTracks = useMemo(() => {
    if (groupBy === 'none') {
      return { ungrouped: filteredTracks };
    }

    const groups: Record<string, Track[]> = {};
    filteredTracks.forEach(track => {
      let groupKey = '';
      if (groupBy === 'genre') {
        groupKey = track.genre;
      } else if (groupBy === 'key') {
        groupKey = track.key;
      } else if (groupBy === 'bpmRange') {
        const range = Math.floor(track.bpm / 20) * 20;
        groupKey = `${range}-${range + 20}`;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(track);
    });

    return groups;
  }, [filteredTracks, groupBy]);

  const handleSort = (key: SortConfig['key']) => {
    setSortConfig(prev => ({
      key,
      direction:
        prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleSelectTrack = (trackId: string, multi = false) => {
    setSelectedTracks(prev => {
      const next = new Set(prev);
      if (multi) {
        if (next.has(trackId)) {
          next.delete(trackId);
        } else {
          next.add(trackId);
        }
      } else {
        next.clear();
        next.add(trackId);
      }
      return next;
    });
    onTrackSelect?.(trackId);
  };

  const handleSelectAll = () => {
    if (selectedTracks.size === filteredTracks.length) {
      setSelectedTracks(new Set());
    } else {
      setSelectedTracks(new Set(filteredTracks.map(t => t.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedTracks.size === 0) return;
    onBulkAction?.(Array.from(selectedTracks), 'delete');
    setSelectedTracks(new Set());
  };

  const handleSaveFilterPreset = () => {
    const name = prompt('Preset name:');
    if (!name) return;
    const preset: FilterPreset = {
      id: Math.random().toString(36),
      name,
      filters: { ...filters },
    };
    setFilterPresets(prev => [...prev, preset]);
  };

  const handleLoadFilterPreset = (presetId: string) => {
    const preset = filterPresets.find(p => p.id === presetId);
    if (preset) {
      setFilters(preset.filters);
    }
  };

  const handleToggleColumn = (columnId: string) => {
    setColumns(prev =>
      prev.map(col =>
        col.id === columnId ? { ...col, visible: !col.visible } : col
      )
    );
  };

  const handleStartEdit = (track: Track) => {
    setEditingTrackId(track.id);
    setEditValues({ ...track });
  };

  const handleSaveEdit = (trackId: string) => {
    onTrackEdit?.(trackId, editValues);
    setEditingTrackId(null);
    setEditValues({});
  };

  const handleCancelEdit = () => {
    setEditingTrackId(null);
    setEditValues({});
  };

  const visibleColumns = columns
    .filter(c => c.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="w-full h-full flex flex-col bg-slate-900">
      {/* Header & Controls */}
      <div className="flex-shrink-0 bg-slate-800 border-b border-slate-700 p-4 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500"
          />
          <input
            type="text"
            placeholder="Search by title or artist (fuzzy match)..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Controls Row */}
        <div className="flex gap-2 flex-wrap">
          {/* Filter Panel Toggle */}
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-colors ${
              showFilterPanel
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }`}
          >
            <Filter size={16} />
            Filters
          </button>

          {/* Grouping */}
          <select
            value={groupBy}
            onChange={e =>
              setGroupBy(e.target.value as typeof groupBy)
            }
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="none">No grouping</option>
            <option value="genre">Group by Genre</option>
            <option value="key">Group by Key</option>
            <option value="bpmRange">Group by BPM Range</option>
          </select>

          {/* Column Customization */}
          <div className="relative group">
            <button className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">
              Columns
            </button>
            <div className="absolute right-0 top-full mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-lg p-2 hidden group-hover:block z-50 min-w-max">
              {columns.map(col => (
                <button
                  key={col.id}
                  onClick={() => handleToggleColumn(col.id)}
                  className={`block w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                    col.visible
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {col.visible ? '✓ ' : '  '}
                  {col.label}
                </button>
              ))}
            </div>
          </div>

          {/* Presets */}
          {filterPresets.length > 0 && (
            <select
              onChange={e => {
                if (e.target.value) handleLoadFilterPreset(e.target.value);
                e.target.value = '';
              }}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none"
            >
              <option value="">Load Preset...</option>
              {filterPresets.map(preset => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={handleSaveFilterPreset}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors flex items-center gap-1"
          >
            <Save size={14} />
            Save Preset
          </button>

          {/* Bulk Actions */}
          {selectedTracks.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors flex items-center gap-1"
            >
              <Trash2 size={14} />
              Delete ({selectedTracks.size})
            </button>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilterPanel && (
        <div
          className="flex-shrink-0 bg-slate-800 border-b border-slate-700 p-4 space-y-4"
        >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* BPM Range */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase">
                  BPM Range
                </label>
                <div className="flex gap-2 mt-2">
                  <input
                    type="number"
                    value={filters.bpmMin}
                    onChange={e =>
                      setFilters(prev => ({
                        ...prev,
                        bpmMin: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                    placeholder="Min"
                  />
                  <input
                    type="number"
                    value={filters.bpmMax}
                    onChange={e =>
                      setFilters(prev => ({
                        ...prev,
                        bpmMax: parseInt(e.target.value) || 999,
                      }))
                    }
                    className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                    placeholder="Max"
                  />
                </div>
              </div>

              {/* Energy Range */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase">
                  Energy
                </label>
                <div className="flex gap-2 mt-2">
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.5"
                    value={filters.energyMin}
                    onChange={e =>
                      setFilters(prev => ({
                        ...prev,
                        energyMin: parseFloat(e.target.value),
                      }))
                    }
                    className="w-full"
                  />
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {filters.energyMin.toFixed(1)} - {filters.energyMax.toFixed(1)}
                </div>
              </div>

              {/* Key Filter */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase">
                  Key (Camelot)
                </label>
                <div className="flex flex-wrap gap-1 mt-2">
                  {CAMELOT_KEYS.slice(0, 6).map(key => (
                    <button
                      key={key}
                      onClick={() =>
                        setFilters(prev => ({
                          ...prev,
                          keys: prev.keys.includes(key)
                            ? prev.keys.filter(k => k !== key)
                            : [...prev.keys, key],
                        }))
                      }
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        filters.keys.includes(key)
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reset Filters */}
              <div className="flex items-end">
                <button
                  onClick={() => setFilters(DEFAULT_FILTER)}
                  className="w-full px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
                >
                  Reset All
                </button>
              </div>
            </div>
        </div>
      )}

      {/* Track List */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(groupedTracks).map(([groupName, groupTracks]) => (
          <div key={groupName}>
            {groupBy !== 'none' && (
              <div className="sticky top-0 bg-slate-700 px-4 py-2 text-sm font-semibold text-white z-10">
                {groupName} ({groupTracks.length})
              </div>
            )}

            {/* Table Header */}
            <div className="bg-slate-800 sticky top-8 px-4 py-3 border-b border-slate-700 flex gap-3 text-xs font-semibold text-slate-400 uppercase hidden md:flex">
              <div className="w-8 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={selectedTracks.size === groupTracks.length}
                  onChange={handleSelectAll}
                  className="w-4 h-4"
                />
              </div>
              {visibleColumns.map(col => (
                <div
                  key={col.id}
                  onClick={() => handleSort(col.id as SortConfig['key'])}
                  className="flex-1 cursor-pointer hover:text-slate-300 transition-colors flex items-center gap-1"
                >
                  {col.label}
                  {sortConfig.key === col.id && (
                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              ))}
              <div className="w-16 flex-shrink-0" />
            </div>

            {/* Rows */}
            {groupTracks.map((track, idx) => (
              <div
                key={track.id}
                className={`px-4 py-2 border-b border-slate-800 flex gap-3 items-center group hover:bg-slate-800/50 transition-colors ${
                  selectedTracks.has(track.id) ? 'bg-blue-500/10' : ''
                }`}
                onDoubleClick={() => handleStartEdit(track)}
              >
                <input
                  type="checkbox"
                  checked={selectedTracks.has(track.id)}
                  onChange={() => handleSelectTrack(track.id, true)}
                  className="w-4 h-4 flex-shrink-0"
                />

                {editingTrackId === track.id ? (
                  <>
                    {visibleColumns.map(col => (
                      <div key={col.id} className="flex-1 min-w-0">
                        {col.id === 'bpm' ? (
                          <input
                            type="number"
                            value={editValues.bpm ?? track.bpm}
                            onChange={e =>
                              setEditValues(prev => ({
                                ...prev,
                                bpm: parseInt(e.target.value) || track.bpm,
                              }))
                            }
                            className="w-full px-2 py-1 bg-slate-700 border border-blue-500 rounded text-white text-sm"
                            autoFocus
                          />
                        ) : col.id === 'key' ? (
                          <input
                            type="text"
                            value={editValues.key ?? track.key}
                            onChange={e =>
                              setEditValues(prev => ({
                                ...prev,
                                key: e.target.value,
                              }))
                            }
                            className="w-full px-2 py-1 bg-slate-700 border border-blue-500 rounded text-white text-sm"
                          />
                        ) : (
                          <span className="text-slate-300 text-sm truncate">
                            {track[col.id as keyof Track]}
                          </span>
                        )}
                      </div>
                    ))}
                    <div className="w-16 flex-shrink-0 flex gap-1">
                      <button
                        onClick={() => handleSaveEdit(track.id)}
                        className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs hover:bg-green-500/30"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs hover:bg-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {visibleColumns.map(col => (
                      <div
                        key={col.id}
                        className="flex-1 min-w-0 text-slate-300 text-sm truncate"
                      >
                        {col.id === 'bpm'
                          ? `${track.bpm}`
                          : col.id === 'energy'
                            ? `${track.energy.toFixed(1)}`
                            : col.id === 'duration'
                              ? `${Math.floor(track.duration / 60)}:${String(track.duration % 60).padStart(2, '0')}`
                              : String(track[col.id as keyof Track])}
                      </div>
                    ))}
                    <div className="w-16 flex-shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleStartEdit(track)}
                        className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredTracks.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-slate-400 mb-2">No tracks found</p>
            <p className="text-slate-500 text-sm">
              Try adjusting your filters or search terms
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrackListAdvanced;
