'use client';

import { useState, useEffect } from 'react';
import { Heart, Trash2 } from 'lucide-react';
import { useLang } from '@/components/LangProvider';
import Link from 'next/link';

interface TrackData {
  id: number;
  title: string;
  artist: string;
  album?: string;
  bpm?: number;
  key?: string;
  duration?: number;
  genre?: string;
  artwork_url?: string;
  year?: number;
}

export default function FavoritesPage() {
  const { lang } = useLang();
  const [tracks, setTracks] = useState<TrackData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

  function getToken() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('trackcue_token');
  }

  async function apiCall<T = any>(path: string, opts: any = {}): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = { ...(opts.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (opts.body && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    if (res.status === 204) return {} as T;
    return res.json();
  }

  useEffect(() => {
    async function loadFavorites() {
      try {
        setLoading(true);
        const data = await apiCall('/favorites');
        setTracks(data.tracks || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement');
      } finally {
        setLoading(false);
      }
    }
    loadFavorites();
  }, []);

  async function handleRemoveFavorite(trackId: number) {
    try {
      await apiCall(`/favorites/${trackId}`, { method: 'DELETE' });
      setTracks(tracks.filter(t => t.id !== trackId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    }
  }

  function formatDuration(ms?: number) {
    if (!ms) return '--:--';
    const totalSec = Math.floor(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = (totalSec % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Heart size={28} className="text-red-500 fill-red-500" />
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Mes Favoris</h1>
        </div>
        <p className="text-[var(--text-muted)]">
          {tracks.length} morceaux favoris
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
          {error}
        </div>
      )}

      {/* Empty State */}
      {tracks.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg">
          <Heart size={48} className="text-[var(--text-muted)] mb-4 opacity-40" />
          <p className="text-[var(--text-muted)] text-center max-w-sm">
            Aucun favori pour l'instant. Clique sur l'icône cœur pour ajouter un morceau à tes favoris.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
          >
            Retour à ma bibliothèque
          </Link>
        </div>
      )}

      {/* Tracks List */}
      {tracks.length > 0 && (
        <div className="space-y-3">
          {tracks.map((track) => (
            <div
              key={track.id}
              className="flex items-center gap-4 p-4 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
            >
              {/* Artwork */}
              {track.artwork_url && (
                <img
                  src={track.artwork_url}
                  alt={track.title}
                  className="w-12 h-12 rounded object-cover"
                  loading="lazy"
                />
              )}

              {/* Track Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[var(--text-primary)] truncate">
                  {track.title}
                </h3>
                <p className="text-sm text-[var(--text-muted)] truncate">
                  {track.artist}
                </p>
                {track.album && (
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    {track.album}
                  </p>
                )}
              </div>

              {/* Details */}
              <div className="flex gap-4 text-xs text-[var(--text-muted)]">
                {track.bpm && (
                  <div className="text-center">
                    <p className="font-semibold text-[var(--text-primary)]">{track.bpm}</p>
                    <p>BPM</p>
                  </div>
                )}
                {track.key && (
                  <div className="text-center">
                    <p className="font-semibold text-[var(--text-primary)]">{track.key}</p>
                    <p>Clé</p>
                  </div>
                )}
                {track.genre && (
                  <div className="text-center">
                    <p className="font-semibold text-[var(--text-primary)] truncate">{track.genre}</p>
                    <p>Genre</p>
                  </div>
                )}
                {track.duration && (
                  <div className="text-center">
                    <p className="font-semibold text-[var(--text-primary)]">
                      {formatDuration(track.duration)}
                    </p>
                    <p>Durée</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <button
                onClick={() => handleRemoveFavorite(track.id)}
                className="p-2 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                title="Retirer des favoris"
                aria-label="Retirer des favoris"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
