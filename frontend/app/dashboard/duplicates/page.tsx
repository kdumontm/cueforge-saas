'use client';

import { useState, useEffect } from 'react';
import { GitMerge, Trash2, Check } from 'lucide-react';
import FeatureGate from '@/components/FeatureGate';
import { useLang } from '@/components/LangProvider';

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

interface DuplicatePair {
  track_a: TrackData;
  track_b: TrackData;
  confidence: number;
  match_reasons: string[];
}

export default function DuplicatesPage() {
  const { lang } = useLang();
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState<number | null>(null);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

  function getToken() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('cueforge_token');
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
    async function loadDuplicates() {
      try {
        setLoading(true);
        const data = await apiCall('/tracks/duplicates');
        setDuplicates(data.duplicates || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement');
      } finally {
        setLoading(false);
      }
    }
    loadDuplicates();
  }, []);

  async function handleMerge(trackA: TrackData, trackB: TrackData, keepId: number, removeId: number) {
    try {
      setMerging(removeId);
      await apiCall('/tracks/merge', {
        method: 'POST',
        body: { keep_id: keepId, remove_id: removeId, merge_cues: true, merge_tags: true },
      });

      // Remove the merged pair from the list
      setPairAsIgnored(trackA.id, trackB.id);
      setDuplicates(duplicates.filter(
        dup => !(
          (dup.track_a.id === trackA.id && dup.track_b.id === trackB.id) ||
          (dup.track_a.id === trackB.id && dup.track_b.id === trackA.id)
        )
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la fusion');
    } finally {
      setMerging(null);
    }
  }

  function setPairAsIgnored(id1: number, id2: number) {
    const key = `${Math.min(id1, id2)}-${Math.max(id1, id2)}`;
    const newIgnored = new Set(ignored);
    newIgnored.add(key);
    setIgnored(newIgnored);
  }

  function getPairKey(id1: number, id2: number) {
    return `${Math.min(id1, id2)}-${Math.max(id1, id2)}`;
  }

  function isPairIgnored(pair: DuplicatePair) {
    return ignored.has(getPairKey(pair.track_a.id, pair.track_b.id));
  }

  function getConfidenceBadge(confidence: number) {
    if (confidence >= 90) {
      return <span className="px-2 py-1 rounded text-xs font-semibold bg-green-500/20 text-green-500">
        {confidence}% - Très probable
      </span>;
    } else if (confidence >= 70) {
      return <span className="px-2 py-1 rounded text-xs font-semibold bg-orange-500/20 text-orange-500">
        {confidence}% - Probable
      </span>;
    } else {
      return <span className="px-2 py-1 rounded text-xs font-semibold bg-yellow-500/20 text-yellow-500">
        {confidence}% - Possible
      </span>;
    }
  }

  function formatDuration(seconds?: number) {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  const visibleDuplicates = duplicates.filter(dup => !isPairIgnored(dup));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <FeatureGate featureKey="duplicates">
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <GitMerge size={28} className="text-blue-500" />
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Doublons</h1>
        </div>
        <p className="text-[var(--text-muted)]">
          {visibleDuplicates.length} doublon{visibleDuplicates.length !== 1 ? 's' : ''} potentiel{visibleDuplicates.length !== 1 ? 's' : ''} détecté{visibleDuplicates.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
          {error}
        </div>
      )}

      {/* Empty State */}
      {visibleDuplicates.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg">
          <GitMerge size={48} className="text-[var(--text-muted)] mb-4 opacity-40" />
          <p className="text-[var(--text-muted)] text-center max-w-sm">
            Ta bibliothèque est propre ! 🎵 Aucun doublon détecté.
          </p>
        </div>
      )}

      {/* Duplicates List */}
      {visibleDuplicates.length > 0 && (
        <div className="space-y-6">
          {visibleDuplicates.map((pair, idx) => (
            <div
              key={idx}
              className="border border-[var(--border-default)] rounded-lg overflow-hidden bg-[var(--bg-secondary)]"
            >
              {/* Header with confidence */}
              <div className="px-6 py-4 bg-[var(--bg-elevated)] border-b border-[var(--border-default)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                    Paire {idx + 1}
                  </h3>
                  {getConfidenceBadge(pair.confidence)}
                </div>
              </div>

              {/* Match Reasons */}
              <div className="px-6 py-3 bg-[var(--bg-primary)] text-sm text-[var(--text-secondary)] space-y-1">
                <p className="font-semibold text-[var(--text-primary)] mb-1">Raisons du match :</p>
                {pair.match_reasons.map((reason, i) => (
                  <p key={i} className="ml-2">• {reason}</p>
                ))}
              </div>

              {/* Tracks Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
                {/* Track A */}
                <div className="border border-[var(--border-default)] rounded-lg p-4 space-y-4">
                  {pair.track_a.artwork_url && (
                    <img
                      src={pair.track_a.artwork_url}
                      alt={pair.track_a.title}
                      className="w-full aspect-square rounded-lg object-cover"
                    />
                  )}
                  <div className="space-y-2">
                    <h4 className="font-semibold text-[var(--text-primary)] truncate">
                      {pair.track_a.title}
                    </h4>
                    <p className="text-sm text-[var(--text-muted)] truncate">
                      {pair.track_a.artist}
                    </p>
                    {pair.track_a.album && (
                      <p className="text-xs text-[var(--text-muted)] truncate">
                        {pair.track_a.album}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                      {pair.track_a.bpm && (
                        <div>
                          <p className="text-[var(--text-muted)]">BPM</p>
                          <p className="font-semibold text-[var(--text-primary)]">{pair.track_a.bpm}</p>
                        </div>
                      )}
                      {pair.track_a.key && (
                        <div>
                          <p className="text-[var(--text-muted)]">Clé</p>
                          <p className="font-semibold text-[var(--text-primary)]">{pair.track_a.key}</p>
                        </div>
                      )}
                      {pair.track_a.duration && (
                        <div>
                          <p className="text-[var(--text-muted)]">Durée</p>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {formatDuration(pair.track_a.duration)}
                          </p>
                        </div>
                      )}
                      {pair.track_a.genre && (
                        <div>
                          <p className="text-[var(--text-muted)]">Genre</p>
                          <p className="font-semibold text-[var(--text-primary)] truncate">{pair.track_a.genre}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleMerge(pair.track_a, pair.track_b, pair.track_a.id, pair.track_b.id)}
                      disabled={merging === pair.track_b.id}
                      className="flex-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <GitMerge size={14} />
                      Garder A
                    </button>
                  </div>
                </div>

                {/* Track B */}
                <div className="border border-[var(--border-default)] rounded-lg p-4 space-y-4">
                  {pair.track_b.artwork_url && (
                    <img
                      src={pair.track_b.artwork_url}
                      alt={pair.track_b.title}
                      className="w-full aspect-square rounded-lg object-cover"
                    />
                  )}
                  <div className="space-y-2">
                    <h4 className="font-semibold text-[var(--text-primary)] truncate">
                      {pair.track_b.title}
                    </h4>
                    <p className="text-sm text-[var(--text-muted)] truncate">
                      {pair.track_b.artist}
                    </p>
                    {pair.track_b.album && (
                      <p className="text-xs text-[var(--text-muted)] truncate">
                        {pair.track_b.album}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                      {pair.track_b.bpm && (
                        <div>
                          <p className="text-[var(--text-muted)]">BPM</p>
                          <p className="font-semibold text-[var(--text-primary)]">{pair.track_b.bpm}</p>
                        </div>
                      )}
                      {pair.track_b.key && (
                        <div>
                          <p className="text-[var(--text-muted)]">Clé</p>
                          <p className="font-semibold text-[var(--text-primary)]">{pair.track_b.key}</p>
                        </div>
                      )}
                      {pair.track_b.duration && (
                        <div>
                          <p className="text-[var(--text-muted)]">Durée</p>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {formatDuration(pair.track_b.duration)}
                          </p>
                        </div>
                      )}
                      {pair.track_b.genre && (
                        <div>
                          <p className="text-[var(--text-muted)]">Genre</p>
                          <p className="font-semibold text-[var(--text-primary)] truncate">{pair.track_b.genre}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleMerge(pair.track_a, pair.track_b, pair.track_b.id, pair.track_a.id)}
                      disabled={merging === pair.track_a.id}
                      className="flex-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <GitMerge size={14} />
                      Garder B
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="px-6 py-3 bg-[var(--bg-elevated)] border-t border-[var(--border-default)] flex gap-2">
                <button
                  onClick={() => setPairAsIgnored(pair.track_a.id, pair.track_b.id)}
                  className="px-3 py-2 rounded-lg bg-[var(--bg-hover)] hover:bg-red-500/20 text-[var(--text-muted)] hover:text-red-500 text-sm font-semibold transition-colors"
                >
                  Ignorer cette paire
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </FeatureGate>
  );
}
