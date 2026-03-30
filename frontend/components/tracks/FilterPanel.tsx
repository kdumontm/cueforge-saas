'use client';

import { useState } from 'react';
import { Filter, X, RotateCcw } from 'lucide-react';

interface FilterPanelProps {
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
  onFilterChange: (key: string, value: any) => void;
  onReset: () => void;
}

const CAMELOT_KEYS = [
  '8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B',
  '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A', '5A',
];

export function FilterPanel({
  filters,
  genres,
  onFilterChange,
  onReset,
}: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleReset = () => {
    onReset();
    setIsExpanded(false);
  };

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-[var(--text-secondary)]" />
          <span className="font-medium text-[var(--text-primary)]">Filtres</span>
        </div>
        <X
          size={18}
          className={`text-[var(--text-secondary)] transition-transform ${
            isExpanded ? 'rotate-45' : ''
          }`}
        />
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-[var(--border-color)] p-4 space-y-4">
          {/* BPM Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                BPM Min
              </label>
              <input
                type="number"
                value={filters.bpmMin}
                onChange={(e) => onFilterChange('bpmMin', parseInt(e.target.value) || 0)}
                className="w-full px-2 py-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                BPM Max
              </label>
              <input
                type="number"
                value={filters.bpmMax}
                onChange={(e) => onFilterChange('bpmMax', parseInt(e.target.value) || 300)}
                className="w-full px-2 py-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {/* Key Filter */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
              Tonalité
            </label>
            <div className="grid grid-cols-6 gap-1">
              {CAMELOT_KEYS.map((key) => (
                <button
                  key={key}
                  onClick={() =>
                    onFilterChange('keyFilter', filters.keyFilter === key ? null : key)
                  }
                  className={`py-1 px-2 text-xs font-medium rounded transition-colors ${
                    filters.keyFilter === key
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)] hover:border-[var(--accent)]'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>

          {/* Genre Filter */}
          {genres.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Genre
              </label>
              <select
                value={filters.genreFilter || ''}
                onChange={(e) => onFilterChange('genreFilter', e.target.value || null)}
                className="w-full px-2 py-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">Tous les genres</option>
                {genres.map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Energy Range */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
              Énergie: {filters.energyMin} - {filters.energyMax}
            </label>
            <div className="space-y-2">
              <input
                type="range"
                min="0"
                max="100"
                value={filters.energyMin}
                onChange={(e) => onFilterChange('energyMin', parseInt(e.target.value))}
                className="w-full"
              />
              <input
                type="range"
                min="0"
                max="100"
                value={filters.energyMax}
                onChange={(e) => onFilterChange('energyMax', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.showAnalyzedOnly}
                onChange={(e) => onFilterChange('showAnalyzedOnly', e.target.checked)}
                className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-sm text-[var(--text-primary)]">Analysés seulement</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.showFavoritesOnly}
                onChange={(e) => onFilterChange('showFavoritesOnly', e.target.checked)}
                className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-sm text-[var(--text-primary)]">Favoris seulement</span>
            </label>
          </div>

          {/* Reset Button */}
          <button
            onClick={handleReset}
            className="w-full py-2 px-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center justify-center gap-2 transition-colors"
          >
            <RotateCcw size={14} />
            Réinitialiser les filtres
          </button>
        </div>
      )}
    </div>
  );
}
