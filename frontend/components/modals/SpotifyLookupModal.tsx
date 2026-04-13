// @ts-nocheck
'use client';

import { useState } from 'react';
import { X, Loader2, Music } from 'lucide-react';
import { spotifyLookup, spotifyApply, type SpotifyApplyData } from '@/lib/api';

interface SpotifyLookupModalProps {
  trackId: number;
  onClose: () => void;
  onApply: () => void;
}

interface SpotifyTrack {
  name?: string;
  artists?: Array<{ name: string }>;
  album?: {
    name: string;
    images?: Array<{ url: string }>;
    release_date?: string;
  };
  popularity?: number;
  genres?: string[];
  id?: string;
  external_urls?: { spotify?: string };
}

export default function SpotifyLookupModal({ trackId, onClose, onApply }: SpotifyLookupModalProps) {
  const [loading, setLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SpotifyTrack | null>(null);
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleLookup = async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    setSelectedResult(null);
    try {
      const data = await spotifyLookup(trackId, searchQuery || undefined);
      if (data.status === 'success' && data.results && data.results.length > 0) {
        setResults(data.results);
        setSelectedResult(data.results[0]);
      } else {
        setError(data.message || 'Aucune correspondance trouvée sur Spotify');
      }
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la recherche Spotify');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!selectedResult) return;
    setApplying(true);
    try {
      const applyData: SpotifyApplyData = {
        spotify_id: selectedResult.id || '',
        title: selectedResult.name,
        artist: selectedResult.artists?.[0]?.name,
        album: selectedResult.album?.name,
        year: selectedResult.album?.release_date ? parseInt(selectedResult.album.release_date.split('-')[0]) : undefined,
        artwork_url: selectedResult.album?.images?.[0]?.url,
        spotify_url: selectedResult.external_urls?.spotify,
      };
      await spotifyApply(trackId, applyData);
      onApply();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'application des données');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Music size={16} className="text-green-500" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Enrichir via Spotify</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--bg-hover)] transition-colors text-[var(--text-muted)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {results.length === 0 && (
            <>
              <div className="space-y-2">
                <label className="block text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
                  Recherche (optionnel)
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ex: artiste - titre"
                  className="w-full px-2.5 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-md text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
                  onKeyPress={(e) => e.key === 'Enter' && handleLookup()}
                />
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Rechercher les informations de ce morceau sur Spotify
              </p>
              <button
                onClick={handleLookup}
                disabled={loading}
                className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-all mx-auto ${
                  loading
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-500'
                }`}
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                {loading ? 'Recherche...' : 'Rechercher sur Spotify'}
              </button>
            </>
          )}

          {error && (
            <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-400">
              {error}
            </div>
          )}

          {results.length > 0 && selectedResult && (
            <div className="space-y-3">
              {/* Album Art */}
              {selectedResult.album?.images?.[0]?.url && (
                <div className="flex justify-center">
                  <img
                    src={selectedResult.album.images[0].url}
                    alt="Album"
                    className="w-32 h-32 rounded-lg shadow-md"
                    loading="lazy"
                  />
                </div>
              )}

              {/* Track Info */}
              <div className="space-y-2 text-xs">
                {selectedResult.name && (
                  <div>
                    <label className="block text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-0.5">
                      Titre
                    </label>
                    <p className="text-[var(--text-primary)]">{selectedResult.name}</p>
                  </div>
                )}

                {selectedResult.artists?.[0]?.name && (
                  <div>
                    <label className="block text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-0.5">
                      Artiste
                    </label>
                    <p className="text-[var(--text-primary)]">{selectedResult.artists.map(a => a.name).join(', ')}</p>
                  </div>
                )}

                {selectedResult.album?.name && (
                  <div>
                    <label className="block text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-0.5">
                      Album
                    </label>
                    <p className="text-[var(--text-primary)]">{selectedResult.album.name}</p>
                  </div>
                )}

                {selectedResult.album?.release_date && (
                  <div>
                    <label className="block text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-0.5">
                      Date de sortie
                    </label>
                    <p className="text-[var(--text-primary)]">{selectedResult.album.release_date}</p>
                  </div>
                )}

                {selectedResult.popularity !== undefined && (
                  <div>
                    <label className="block text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-0.5">
                      Popularité
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500"
                          style={{ width: `${selectedResult.popularity}%` }}
                        />
                      </div>
                      <span className="text-[var(--text-secondary)]">{selectedResult.popularity}%</span>
                    </div>
                  </div>
                )}
              </div>

              {selectedResult.external_urls?.spotify && (
                <a
                  href={selectedResult.external_urls.spotify}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-green-500 hover:text-green-400 underline block text-center"
                >
                  Ouvrir sur Spotify
                </a>
              )}

              {results.length > 1 && (
                <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                  <label className="block text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                    Autres résultats
                  </label>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {results.slice(1).map((track, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedResult(track)}
                        className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-[var(--bg-primary)] transition-colors"
                      >
                        <p className="text-[var(--text-primary)]">{track.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {track.artists?.[0]?.name} • {track.album?.name}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && selectedResult && (
          <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]">
            <button
              onClick={onClose}
              className="flex-1 px-3 py-1.5 rounded-md text-xs font-semibold text-[var(--text-secondary)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleApply}
              disabled={applying}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                applying
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-500'
              }`}
            >
              {applying && <Loader2 size={12} className="animate-spin" />}
              {applying ? 'Application...' : 'Appliquer'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
