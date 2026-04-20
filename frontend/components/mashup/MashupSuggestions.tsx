'use client';

import React from 'react';
import { Music, Play, CheckCircle2 } from 'lucide-react';
import { MashupSuggestion } from '@/lib/api/mashup';
import CompatibilityScoreComponent from './CompatibilityScore';

interface Props {
  /** Suggestions à afficher */
  suggestions: MashupSuggestion[];
  /** ID du suggestion actuellement sélectionné (Deck B) */
  selectedId?: number;
  /** Callback sélection d'une suggestion */
  onSelect: (s: MashupSuggestion) => void;
  /** Callback preview audio */
  onPreview?: (s: MashupSuggestion) => void;
  /** État loading */
  loading?: boolean;
}

/**
 * Liste de suggestions de mashup (Deck B).
 *
 * Layout :
 * - Scroll horizontal sur desktop
 * - Grid vertical sur mobile
 * - Cards compactes : artwork, titre/artiste, BPM, clé, score, boutons
 *
 * @component
 */
export default function MashupSuggestions({
  suggestions,
  selectedId,
  onSelect,
  onPreview,
  loading = false,
}: Props) {
  return (
    <div className="w-full h-full flex flex-col gap-3">
      {/* Titre */}
      <h2 className="text-lg font-semibold text-gray-800">Suggestions (Deck B)</h2>

      {/* Container scroll ou grid */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          // Skeleton loader
          <div className="flex gap-3 overflow-x-auto pb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-48 h-56 bg-gray-200 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : suggestions.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>Aucune suggestion trouvée</p>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-3 md:overflow-visible">
            {suggestions.map((suggestion) => (
              <MashupSuggestionCard
                key={suggestion.track_id}
                suggestion={suggestion}
                isSelected={suggestion.track_id === selectedId}
                onSelect={onSelect}
                onPreview={onPreview}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface CardProps {
  suggestion: MashupSuggestion;
  isSelected: boolean;
  onSelect: (s: MashupSuggestion) => void;
  onPreview?: (s: MashupSuggestion) => void;
}

/**
 * Card individuelle pour une suggestion.
 */
function MashupSuggestionCard({ suggestion, isSelected, onSelect, onPreview }: CardProps) {
  return (
    <div
      className={`flex-shrink-0 w-48 rounded-lg border-2 transition-all cursor-pointer overflow-hidden ${
        isSelected
          ? 'border-blue-500 bg-blue-50 shadow-lg'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
      onClick={() => onSelect(suggestion)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(suggestion);
      }}
    >
      {/* Artwork + overlay */}
      <div className="relative w-full h-32 bg-gray-100 flex items-center justify-center overflow-hidden">
        {suggestion.track_artwork_url ? (
          <img
            src={suggestion.track_artwork_url}
            alt={suggestion.track_title}
            className="w-full h-full object-cover"
          />
        ) : (
          <Music className="w-12 h-12 text-gray-400" />
        )}

        {/* Overlay preview si sélectionné */}
        {isSelected && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
        )}
      </div>

      {/* Métadonnées */}
      <div className="p-3 space-y-2">
        {/* Titre / Artiste */}
        <div className="space-y-1">
          <p className="font-semibold text-sm text-gray-900 line-clamp-1">
            {suggestion.track_title}
          </p>
          <p className="text-xs text-gray-600 line-clamp-1">
            {suggestion.track_artist}
          </p>
        </div>

        {/* BPM + Clé */}
        <div className="flex gap-2 text-xs text-gray-700">
          {suggestion.track_bpm && <span className="font-medium">{suggestion.track_bpm} BPM</span>}
          {suggestion.track_key && (
            <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-800">
              {suggestion.track_key}
            </span>
          )}
        </div>

        {/* Score compatibilité compact */}
        <div className="flex justify-center py-1">
          <CompatibilityScoreComponent score={suggestion.compatibility} size="sm" />
        </div>

        {/* Boutons */}
        <div className="flex gap-2 pt-1">
          {onPreview && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPreview(suggestion);
              }}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded transition-colors"
              aria-label={`Preview ${suggestion.track_title}`}
            >
              <Play className="w-3 h-3" />
              <span>Preview</span>
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(suggestion);
            }}
            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${
              isSelected
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
            aria-label={`Pick ${suggestion.track_title}`}
          >
            {isSelected ? 'Sélectionné' : 'Choisir'}
          </button>
        </div>
      </div>
    </div>
  );
}
