'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { AlertCircle, Search, Settings } from 'lucide-react';
import {
  fetchMashupSuggestions,
  createMashup,
  MashupSuggestion,
  MashupFilters,
  TrackSummary,
} from '@/lib/api/mashup';
import { getTracks } from '@/lib/api';
import DualDeck from '@/components/mashup/DualDeck';
import MashupSuggestions from '@/components/mashup/MashupSuggestions';

/**
 * Mashup Studio — Composant client principal.
 *
 * État :
 * - trackA : piste sélectionnée Deck A (via query param ou modal)
 * - suggestions : fetched avec SWR (auto-refresh si trackA ou filters changent)
 * - trackB sélectionnée
 * - filters panel
 * - état favoris
 *
 * Layout :
 * - Header : sélecteur trackA, titre
 * - Main : sidebar filters (gauche), DualDeck (centre), MashupSuggestions (droite)
 * - Responsive : stack vertical sur mobile
 */

interface Track {
  id: number;
  title: string;
  artist: string;
  bpm?: number;
  key?: string;
  energy?: number;
  duration?: number;
  artwork_url?: string;
  // Analyse beatgrid (optionnel)
  beatgrid?: Array<{ position_ms: number; beat_number: number }>;
  downbeat_ms?: number;
}

export default function MashupClient() {
  const searchParams = useSearchParams();
  const initialTrackId = searchParams.get('track');

  // État Deck A
  const [trackA, setTrackA] = useState<TrackSummary | null>(null);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(true);
  const [errorTracks, setErrorTracks] = useState('');

  // État Deck B
  const [trackB, setTrackB] = useState<TrackSummary | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<MashupSuggestion | null>(null);

  // Filtres
  const [filters, setFilters] = useState<MashupFilters>({
    energy_min: undefined,
    energy_max: undefined,
    bpm_max_delta: 10,
    limit: 20,
  });
  const [showFilters, setShowFilters] = useState(false);

  // Modal sélection trackA
  const [showTrackModal, setShowTrackModal] = useState(!initialTrackId);
  const [searchQuery, setSearchQuery] = useState('');

  // État sauvegarde mashup
  const [savingMashup, setSavingMashup] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  // ── Charger les pistes de la bibliothèque utilisateur ──
  useEffect(() => {
    const loadTracks = async () => {
      try {
        setLoadingTracks(true);
        const response = await getTracks();
        const tracks = (response.tracks || []) as Track[];
        setAllTracks(tracks);

        // Si track=<id> en query, le sélectionner
        if (initialTrackId) {
          const track = tracks.find((t) => t.id === parseInt(initialTrackId));
          if (track) {
            setTrackA({
              id: track.id,
              title: track.title,
              artist: track.artist,
              bpm: track.bpm,
              key: track.key,
              energy: track.energy,
              duration: track.duration,
              artwork_url: track.artwork_url,
              beatgrid: track.beatgrid,
              downbeat_ms: track.downbeat_ms,
            });
            setShowTrackModal(false);
          }
        }
      } catch (err) {
        setErrorTracks('Erreur chargement bibliothèque');
        console.error(err);
      } finally {
        setLoadingTracks(false);
      }
    };

    loadTracks();
  }, [initialTrackId]);

  // ── SWR : fetch suggestions quand trackA ou filters changent ──
  const { data: suggestions = [], isLoading: loadingSuggestions, error: errorSuggestions } = useSWR(
    trackA ? ['mashup/suggestions', trackA.id, filters] : null,
    async ([, trackId, f]) => {
      try {
        return await fetchMashupSuggestions(trackId, f);
      } catch (err) {
        console.error('Erreur suggestions:', err);
        return [];
      }
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 1000,
    }
  );

  // ── Sélectionner un track pour Deck A ──
  const handleSelectTrackA = (track: Track) => {
    setTrackA({
      id: track.id,
      title: track.title,
      artist: track.artist,
      bpm: track.bpm,
      key: track.key,
      energy: track.energy,
      duration: track.duration,
      artwork_url: track.artwork_url,
      beatgrid: track.beatgrid,
      downbeat_ms: track.downbeat_ms,
    });
    setShowTrackModal(false);
    setTrackB(null); // Reset B
    setSelectedSuggestion(null);
  };

  // ── Sélectionner une suggestion pour Deck B ──
  const handleSelectSuggestion = (suggestion: MashupSuggestion) => {
    setSelectedSuggestion(suggestion);
    setTrackB({
      id: suggestion.track_id,
      title: suggestion.track_title,
      artist: suggestion.track_artist,
      bpm: suggestion.track_bpm,
      key: suggestion.track_key,
      energy: suggestion.track_energy,
      duration: suggestion.track_duration,
      artwork_url: suggestion.track_artwork_url,
      beatgrid: suggestion.track_beatgrid,
      downbeat_ms: suggestion.track_downbeat_ms,
    });
  };

  // ── Preview audio Deck B ──
  const handlePreview = (suggestion: MashupSuggestion) => {
    // TODO Phase 3.5 : lancer un mini-player ou auto-select B
    console.log('Preview:', suggestion.track_title);
  };

  // ── Sauvegarder le mashup ──
  const handleSaveMashup = async () => {
    if (!trackA || !trackB) {
      alert('Sélectionne les deux decks');
      return;
    }

    setSavingMashup(true);
    try {
      await createMashup({
        track_a_id: trackA.id,
        track_b_id: trackB.id,
        pitch_semitones: 0,
      });
      setSavedMessage('Mashup sauvegardé ! 🎉');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (err) {
      alert('Erreur sauvegarde');
      console.error(err);
    } finally {
      setSavingMashup(false);
    }
  };

  // ── Filtres recherche tracks (modal) ──
  const filteredTracks = allTracks.filter((t) =>
    `${t.title} ${t.artist}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── Layout responsive ──
  return (
    <div className="flex flex-col h-full bg-gray-950 text-white">
      {/* ── HEADER ────────────────────────────────────────────────── */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Mashup Studio</h1>
            <p className="text-sm text-gray-400">Teste la compatibilité harmonique</p>
          </div>

          {/* Selector Deck A ou bouton change */}
          {trackA ? (
            <button
              onClick={() => setShowTrackModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition-colors"
            >
              Changer Deck A: {trackA.title}
            </button>
          ) : (
            <button
              onClick={() => setShowTrackModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition-colors"
            >
              Choisir piste (Deck A)
            </button>
          )}
        </div>
      </header>

      {/* ── MODAL Sélection TrackA ────────────────────────────────── */}
      {showTrackModal && (
        <TrackSelectionModal
          tracks={filteredTracks}
          loading={loadingTracks}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelect={handleSelectTrackA}
          onClose={() => setShowTrackModal(false)}
        />
      )}

      {/* ── MAIN : Erreur ou Layout ────────────────────────────────── */}
      {errorTracks ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-red-500 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-2" />
            <p>{errorTracks}</p>
          </div>
        </div>
      ) : !trackA ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500 text-center">
            <Search className="w-12 h-12 mx-auto mb-2" />
            <p>Sélectionne une piste pour Deck A</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex gap-4 p-4 overflow-hidden md:flex-col lg:flex-row">
          {/* ── Sidebar Filters (gauche) ────────────────────── */}
          <div className="hidden lg:block w-64 flex-shrink-0">
            <FiltersPanel
              filters={filters}
              onFiltersChange={setFilters}
              showFilters={showFilters}
              onToggleFilters={() => setShowFilters(!showFilters)}
            />
          </div>

          {/* ── Mobile Filters Toggle ────────────────────────────── */}
          {/* <div className="lg:hidden mb-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Filtres
            </button>
          </div> */}

          {/* ── Center : DualDeck ────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <DualDeck
              trackA={trackA}
              trackB={trackB || undefined}
              audioUrlA={`/api/v1/audio/${trackA.id}`}
              audioUrlB={trackB ? `/api/v1/audio/${trackB.id}` : undefined}
              onSwapB={() => setShowTrackModal(true)}
            />
          </div>

          {/* ── Right : Suggestions ────────────────────────── */}
          <div className="hidden lg:flex w-80 flex-col gap-2">
            {errorSuggestions && (
              <div className="bg-red-900/30 border border-red-700 text-red-200 px-3 py-2 rounded text-sm">
                Erreur suggestions
              </div>
            )}
            <MashupSuggestions
              suggestions={suggestions}
              selectedId={trackB?.id}
              onSelect={handleSelectSuggestion}
              onPreview={handlePreview}
              loading={loadingSuggestions}
            />

            {/* Save Button */}
            <button
              onClick={handleSaveMashup}
              disabled={!trackA || !trackB || savingMashup}
              className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:opacity-50 text-white font-bold rounded transition-colors"
            >
              {savingMashup ? 'Sauvegarde...' : 'Sauvegarder Mashup'}
            </button>

            {savedMessage && (
              <div className="bg-green-900/30 border border-green-700 text-green-200 px-3 py-2 rounded text-sm text-center">
                {savedMessage}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Components Auxiliaires ─────────────────────────────────────────

interface TrackSelectionModalProps {
  tracks: Track[];
  loading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelect: (track: Track) => void;
  onClose: () => void;
}

/**
 * Modal de sélection des pistes.
 */
function TrackSelectionModal({
  tracks,
  loading,
  searchQuery,
  onSearchChange,
  onSelect,
  onClose,
}: TrackSelectionModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-lg w-full max-w-2xl max-h-96 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-gray-800 px-6 py-4">
          <h2 className="text-xl font-bold text-white mb-3">Choisir une piste (Deck A)</h2>
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500"
            autoFocus
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-gray-400 text-center">Chargement...</div>
          ) : tracks.length === 0 ? (
            <div className="p-4 text-gray-400 text-center">Aucune piste trouvée</div>
          ) : (
            <div className="divide-y divide-gray-800">
              {tracks.map((track) => (
                <button
                  key={track.id}
                  onClick={() => onSelect(track)}
                  className="w-full text-left px-6 py-3 hover:bg-gray-800 transition-colors flex items-center gap-3"
                >
                  {track.artwork_url && (
                    <img src={track.artwork_url} alt="" className="w-10 h-10 rounded object-cover" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{track.title}</p>
                    <p className="text-sm text-gray-400 truncate">{track.artist}</p>
                  </div>
                  {track.bpm && <span className="text-xs text-gray-500">{Math.round(track.bpm)} BPM</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

interface FiltersPanelProps {
  filters: MashupFilters;
  onFiltersChange: (f: MashupFilters) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
}

/**
 * Panneau de filtres (Deck B suggestions).
 */
function FiltersPanel({ filters, onFiltersChange, showFilters, onToggleFilters }: FiltersPanelProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
      <h3 className="font-semibold text-gray-100 flex items-center gap-2">
        <Settings className="w-4 h-4" />
        Filtres
      </h3>

      {/* Énergie */}
      <div className="space-y-2">
        <label className="text-sm text-gray-300">Énergie (min - max)</label>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            max="10"
            value={filters.energy_min ?? ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                energy_min: e.target.value ? parseInt(e.target.value) : undefined,
              })
            }
            placeholder="Min"
            className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm"
          />
          <input
            type="number"
            min="0"
            max="10"
            value={filters.energy_max ?? ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                energy_max: e.target.value ? parseInt(e.target.value) : undefined,
              })
            }
            placeholder="Max"
            className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm"
          />
        </div>
      </div>

      {/* BPM Delta */}
      <div className="space-y-2">
        <label className="text-sm text-gray-300">Tolérance BPM (±%)</label>
        <input
          type="number"
          min="0"
          max="100"
          value={filters.bpm_max_delta ?? ''}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              bpm_max_delta: e.target.value ? parseFloat(e.target.value) : undefined,
            })
          }
          className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm"
        />
      </div>

      {/* Harmonic */}
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={filters.require_harmonic !== false}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              require_harmonic: e.target.checked,
            })
          }
          className="rounded"
        />
        Compatibilité harmonique obligatoire
      </label>

      {/* Limit */}
      <div className="space-y-2">
        <label className="text-sm text-gray-300">Nombre de suggestions</label>
        <input
          type="number"
          min="1"
          max="100"
          value={filters.limit ?? '20'}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              limit: parseInt(e.target.value),
            })
          }
          className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm"
        />
      </div>
    </div>
  );
}
