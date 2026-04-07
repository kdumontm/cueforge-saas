// @ts-nocheck
'use client';

import { useState } from 'react';
import { X, Loader2, Music } from 'lucide-react';
import { spotifyLookup, spotifyApply, type SpotifyResult } from '@/lib/api';

interface SpotifyLookupModalProps {
  trackId: number;
  onClose: () => void;
  onApply: () => void;
}

export default function SpotifyLookupModal({ trackId, onClose, onApply }: SpotifyLookupModalProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SpotifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const handleLookup = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await spotifyLookup(trackId);
      if (data.status === 'found' && data.result) {
        setResult(data.result);
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
    if (!result) return;
    setApplying(true);
    try {
      await spotifyApply(trackId);
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
          {!result && !error && (
            <div className="text-center py-6">
              <p className="text-xs text-[var(--text-muted)] mb-4">
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
            </div>
          )}

          {error && (
            <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-400">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              {/* Album Art */}
              {result.album_art_url && (
                <div className="flex justify-center">
                  <img
                    src={result.album_art_url}
                    alt="Album"
                    className="w-32 h-32 rounded-lg shadow-md"
                  />
                </div>
              )}

              {/* Track Info */}
              <div className="space-y-2 text-xs">
                {result.track_name && (
                  <div>
                    <label className="block text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-0.5">
                      Titre
                    </label>
                    <p className="text-[var(--text-primary)]">{result.track_name}</p>
                  </div>
                )}

                {result.artist_name && (
                  <div>
                    <label className="block text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-0.5">
                      Artiste
                    </label>
                    <p className="text-[var(--text-primary)]">{result.artist_name}</p>
                  </div>
                )}

                {result.album_name && (
                  <div>
                    <label className="block text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-0.5">
                      Album
                    </label>
                    <p className="text-[var(--text-primary)]">{result.album_name}</p>
                  </div>
                )}

                {result.release_date && (
                  <div>
                    <label className="block text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-0.5">
                      Date de sortie
                    </label>
                    <p className="text-[var(--text-primary)]">{result.release_date}</p>
                  </div>
                )}

                {result.genre && (
                  <div>
                    <label className="block text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-0.5">
                      Genre
                    </label>
                    <p className="text-[var(--text-primary)]">{result.genre}</p>
                  </div>
                )}

                {result.popularity !== undefined && (
                  <div>
                    <label className="block text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-0.5">
                      Popularité
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500"
                          style={{ width: `${result.popularity}%` }}
                        />
                      </div>
                      <span className="text-[var(--text-secondary)]">{result.popularity}%</span>
                    </div>
                  </div>
                )}
              </div>

              {result.spotify_url && (
                <a
                  href={result.spotify_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-green-500 hover:text-green-400 underline block text-center"
                >
                  Ouvrir sur Spotify
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {result && (
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
