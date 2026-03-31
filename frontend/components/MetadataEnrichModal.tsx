// @ts-nocheck
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, ChevronLeft, ChevronRight, Check, SkipForward, Loader2, Music, Disc, User, Tag, Calendar, Image as ImageIcon, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { spotifyLookup, spotifyApply, updateTrackMetadata } from '@/lib/api';

interface TrackData {
  id: number;
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: number | null;
  artwork_url?: string | null;
  original_filename?: string;
}

interface FoundMetadata {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: number;
  artwork_url?: string;
  spotify_id?: string;
  spotify_url?: string;
  source?: string; // 'spotify' | 'itunes' | 'deezer'
  preview_url?: string;
}

interface TrackEnrichState {
  status: 'pending' | 'searching' | 'found' | 'not_found' | 'done' | 'skipped';
  results: FoundMetadata[];
  selectedResult: number; // index in results
  selectedFields: Set<string>;
}

interface MetadataEnrichModalProps {
  tracks: TrackData[];
  onClose: () => void;
  onTrackUpdated?: (trackId: number, data: Partial<TrackData>) => void;
}

const FIELD_META = [
  { key: 'title',       label: 'Titre',          icon: Music },
  { key: 'artist',      label: 'Artiste',         icon: User },
  { key: 'album',       label: 'Album',           icon: Disc },
  { key: 'genre',       label: 'Genre',           icon: Tag },
  { key: 'year',        label: 'Année',           icon: Calendar },
  { key: 'artwork_url', label: 'Pochette',        icon: ImageIcon },
];

// ── iTunes Search API (free, no auth) ───────────────────────────────────────
async function searchItunes(query: string): Promise<FoundMetadata[]> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5&country=FR`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((t: any) => ({
      title:       t.trackName || '',
      artist:      t.artistName || '',
      album:       t.collectionName || '',
      genre:       t.primaryGenreName || '',
      year:        t.releaseDate ? parseInt(t.releaseDate.slice(0, 4)) : undefined,
      artwork_url: t.artworkUrl100?.replace('100x100', '600x600') || '',
      source:      'itunes',
      preview_url: t.previewUrl || '',
    })).filter((r: FoundMetadata) => r.title);
  } catch {
    return [];
  }
}

// ── Deezer API fallback ──────────────────────────────────────────────────────
async function searchDeezer(query: string): Promise<FoundMetadata[]> {
  try {
    // Use a CORS proxy or direct call
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map((t: any) => ({
      title:       t.title || '',
      artist:      t.artist?.name || '',
      album:       t.album?.title || '',
      genre:       '',
      year:        undefined,
      artwork_url: t.album?.cover_xl || t.album?.cover_big || '',
      source:      'deezer',
      preview_url: t.preview || '',
    })).filter((r: FoundMetadata) => r.title);
  } catch {
    return [];
  }
}

// ── Build search query from track data ──────────────────────────────────────
function buildQuery(track: TrackData): string {
  if (track.title && track.artist) return `${track.artist} ${track.title}`;
  if (track.title) return track.title;
  // Fallback: parse filename
  const name = track.original_filename?.replace(/\.[^.]+$/, '') || '';
  // Remove common patterns: (Original Mix), [Label], 128bpm, etc.
  return name
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\d{2,3}\s*bpm/gi, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

export default function MetadataEnrichModal({ tracks, onClose, onTrackUpdated }: MetadataEnrichModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [enrichStates, setEnrichStates] = useState<Map<number, TrackEnrichState>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [summary, setSummary] = useState<{ updated: number; skipped: number } | null>(null);

  const currentTrack = tracks[currentIndex];
  const currentState = enrichStates.get(currentTrack?.id);

  // ── Initialize enrichStates ─────────────────────────────────────────────
  useEffect(() => {
    const map = new Map<number, TrackEnrichState>();
    for (const t of tracks) {
      map.set(t.id, {
        status: 'pending',
        results: [],
        selectedResult: 0,
        selectedFields: new Set(),
      });
    }
    setEnrichStates(map);
  }, []);

  // ── Auto-search when track changes ──────────────────────────────────────
  useEffect(() => {
    if (!currentTrack) return;
    const state = enrichStates.get(currentTrack.id);
    if (state && (state.status === 'pending' || state.status === 'searching')) {
      const q = buildQuery(currentTrack);
      setSearchQuery(q);
      doSearch(currentTrack, q);
    } else if (state) {
      setSearchQuery(buildQuery(currentTrack));
    }
  }, [currentIndex, currentTrack?.id]);

  // ── Search function ──────────────────────────────────────────────────────
  const doSearch = useCallback(async (track: TrackData, query: string) => {
    if (!query.trim()) return;
    setIsSearching(true);
    updateState(track.id, { status: 'searching', results: [], selectedResult: 0, selectedFields: new Set() });

    let results: FoundMetadata[] = [];

    // 1. Try Spotify via backend
    try {
      const parts = query.split(' ');
      const artistGuess = track.artist || '';
      const titleGuess = track.title || query;
      const resp = await spotifyLookup(track.id, titleGuess, artistGuess);
      if (resp.status === 'ok' && resp.results?.length) {
        results = resp.results.map((r: any) => ({ ...r, source: 'spotify' }));
      }
    } catch {
      // Spotify not configured or failed → fall through
    }

    // 2. iTunes fallback
    if (!results.length) {
      results = await searchItunes(query);
    }

    // 3. Deezer fallback
    if (!results.length) {
      results = await searchDeezer(query);
    }

    const defaultFields = new Set<string>();
    if (results.length > 0) {
      const r = results[0];
      if (r.title && r.title !== track.title) defaultFields.add('title');
      if (r.artist && r.artist !== track.artist) defaultFields.add('artist');
      if (r.album && r.album !== track.album) defaultFields.add('album');
      if (r.genre && r.genre !== track.genre) defaultFields.add('genre');
      if (r.year && r.year !== track.year) defaultFields.add('year');
      if (r.artwork_url && r.artwork_url !== track.artwork_url) defaultFields.add('artwork_url');
    }

    updateState(track.id, {
      status: results.length > 0 ? 'found' : 'not_found',
      results,
      selectedResult: 0,
      selectedFields: defaultFields,
    });
    setIsSearching(false);
  }, []);

  const updateState = (trackId: number, patch: Partial<TrackEnrichState>) => {
    setEnrichStates(prev => {
      const next = new Map(prev);
      const existing = next.get(trackId) || { status: 'pending', results: [], selectedResult: 0, selectedFields: new Set() };
      next.set(trackId, { ...existing, ...patch });
      return next;
    });
  };

  // ── Apply chosen metadata ────────────────────────────────────────────────
  const handleValidate = async () => {
    if (!currentTrack || !currentState) return;
    const result = currentState.results[currentState.selectedResult];
    if (!result) return;

    const patch: any = {};
    for (const field of currentState.selectedFields) {
      if (result[field] !== undefined) patch[field] = result[field];
    }

    try {
      if (result.source === 'spotify' && result.spotify_id) {
        await spotifyApply(currentTrack.id, {
          spotify_id: result.spotify_id,
          ...patch,
        });
      } else {
        await updateTrackMetadata(currentTrack.id, patch);
      }
      if (onTrackUpdated) onTrackUpdated(currentTrack.id, patch);
      updateState(currentTrack.id, { status: 'done' });
      goNext('done');
    } catch (e) {
      console.error('Failed to save metadata', e);
    }
  };

  const handleSkip = () => {
    updateState(currentTrack.id, { status: 'skipped' });
    goNext('skipped');
  };

  const goNext = (lastStatus?: 'done' | 'skipped') => {
    if (currentIndex < tracks.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      // Compute summary
      const updated = Array.from(enrichStates.values()).filter(s => s.status === 'done').length
        + (lastStatus === 'done' ? 1 : 0);
      const skipped = tracks.length - updated;
      setSummary({ updated, skipped });
    }
  };

  const toggleField = (field: string) => {
    if (!currentState) return;
    const next = new Set(currentState.selectedFields);
    if (next.has(field)) next.delete(field);
    else next.add(field);
    updateState(currentTrack.id, { selectedFields: next });
  };

  const selectResult = (idx: number) => {
    if (!currentState || !currentTrack) return;
    const r = currentState.results[idx];
    const defaultFields = new Set<string>();
    if (r.title && r.title !== currentTrack.title) defaultFields.add('title');
    if (r.artist && r.artist !== currentTrack.artist) defaultFields.add('artist');
    if (r.album && r.album !== currentTrack.album) defaultFields.add('album');
    if (r.genre && r.genre !== currentTrack.genre) defaultFields.add('genre');
    if (r.year && r.year !== currentTrack.year) defaultFields.add('year');
    if (r.artwork_url && r.artwork_url !== currentTrack.artwork_url) defaultFields.add('artwork_url');
    updateState(currentTrack.id, { selectedResult: idx, selectedFields: defaultFields });
  };

  const handleManualSearch = () => {
    if (!currentTrack || !searchQuery.trim()) return;
    doSearch(currentTrack, searchQuery);
  };

  // ── Summary screen ───────────────────────────────────────────────────────
  if (summary) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
          <CheckCircle2 size={56} className="text-emerald-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Enrichissement terminé</h2>
          <p className="text-[var(--text-secondary)] mb-6">
            <span className="text-emerald-400 font-semibold">{summary.updated}</span> track{summary.updated > 1 ? 's' : ''} mis{summary.updated > 1 ? 'es' : ''} à jour &nbsp;·&nbsp;
            <span className="text-[var(--text-muted)] font-semibold">{summary.skipped}</span> ignoré{summary.skipped > 1 ? 's' : ''}
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-[var(--accent-primary)] text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer border-none"
          >
            Fermer
          </button>
        </div>
      </div>
    );
  }

  if (!currentTrack || !currentState) return null;

  const selectedResult = currentState.results[currentState.selectedResult];
  const isBatch = tracks.length > 1;
  const sourceIcon = selectedResult?.source === 'spotify' ? '🎵' : selectedResult?.source === 'itunes' ? '🍎' : '🎧';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-center gap-3">
            <Search size={18} className="text-[var(--accent-primary)]" />
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Enrichissement des métadonnées</h2>
              {isBatch && (
                <p className="text-[10px] text-[var(--text-muted)]">
                  Track {currentIndex + 1} / {tracks.length}
                  &nbsp;·&nbsp;
                  {Array.from(enrichStates.values()).filter(s => s.status === 'done').length} mis à jour
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-pointer bg-transparent border-none">
            <X size={16} />
          </button>
        </div>

        {/* Batch progress bar */}
        {isBatch && (
          <div className="h-0.5 bg-[var(--bg-card)] shrink-0">
            <div
              className="h-full bg-[var(--accent-primary)] transition-all duration-500"
              style={{ width: `${((currentIndex) / tracks.length) * 100}%` }}
            />
          </div>
        )}

        {/* Track name */}
        <div className="px-5 py-2.5 bg-[var(--bg-card)] border-b border-[var(--border-subtle)] shrink-0">
          <p className="text-xs text-[var(--text-muted)] truncate">
            🎵 &nbsp;
            <span className="text-[var(--text-primary)] font-medium">
              {currentTrack.title || currentTrack.original_filename || `Track #${currentTrack.id}`}
            </span>
            {currentTrack.artist && <span className="text-[var(--text-secondary)]"> — {currentTrack.artist}</span>}
          </p>
        </div>

        {/* Search bar */}
        <div className="px-5 py-3 border-b border-[var(--border-subtle)] shrink-0 flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleManualSearch()}
            placeholder="Rechercher..."
            className="flex-1 px-3 py-1.5 text-xs bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] transition-colors"
          />
          <button
            onClick={handleManualSearch}
            disabled={isSearching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-primary)] text-white border-none cursor-pointer disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {isSearching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            Rechercher
          </button>
        </div>

        {/* Main content: split view */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* Searching state */}
          {currentState.status === 'searching' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--text-muted)]">
              <Loader2 size={32} className="animate-spin text-[var(--accent-primary)]" />
              <p className="text-sm">Recherche en cours...</p>
              <p className="text-[11px] opacity-60">Spotify · iTunes · Deezer</p>
            </div>
          )}

          {/* Not found */}
          {currentState.status === 'not_found' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--text-muted)]">
              <AlertCircle size={32} className="text-amber-400" />
              <p className="text-sm font-medium text-[var(--text-secondary)]">Aucun résultat trouvé</p>
              <p className="text-[11px]">Essaie avec une recherche manuelle</p>
            </div>
          )}

          {/* Found: split view */}
          {currentState.status === 'found' && selectedResult && (
            <div className="flex flex-col">
              {/* Multiple results tabs */}
              {currentState.results.length > 1 && (
                <div className="flex gap-1.5 px-5 pt-3 pb-0 overflow-x-auto shrink-0">
                  {currentState.results.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => selectResult(i)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium border whitespace-nowrap cursor-pointer transition-all ${
                        i === currentState.selectedResult
                          ? 'bg-[var(--accent-primary)]/20 border-[var(--accent-primary)]/50 text-[var(--accent-primary)]'
                          : 'bg-transparent border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)]'
                      }`}
                    >
                      {r.source === 'spotify' ? '🎵' : r.source === 'itunes' ? '🍎' : '🎧'}
                      {r.artist && r.title ? `${r.artist} — ${r.title}` : r.title || `Résultat ${i + 1}`}
                    </button>
                  ))}
                </div>
              )}

              {/* Split panel */}
              <div className="grid grid-cols-2 gap-0 divide-x divide-[var(--border-subtle)] p-5">

                {/* LEFT: Current */}
                <div className="pr-5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                    Métadonnées actuelles
                  </div>

                  {/* Artwork */}
                  <div className="w-16 h-16 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] overflow-hidden mb-4 flex items-center justify-center">
                    {currentTrack.artwork_url
                      ? <img src={currentTrack.artwork_url} alt="" className="w-full h-full object-cover" />
                      : <Music size={20} className="text-[var(--text-muted)]" />
                    }
                  </div>

                  <div className="space-y-2">
                    {FIELD_META.filter(f => f.key !== 'artwork_url').map(({ key, label, icon: Icon }) => (
                      <div key={key} className="flex items-start gap-2">
                        <Icon size={12} className="text-[var(--text-muted)] mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
                          <div className="text-xs text-[var(--text-secondary)] truncate">
                            {currentTrack[key] || <span className="italic opacity-40">—</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* RIGHT: Found */}
                <div className="pl-5">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                    <span>Trouvé via</span>
                    <span className="text-[var(--accent-primary)]">
                      {selectedResult.source === 'spotify' ? '🎵 Spotify' : selectedResult.source === 'itunes' ? '🍎 iTunes' : '🎧 Deezer'}
                    </span>
                  </div>

                  {/* Artwork with preview */}
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden mb-4 border border-[var(--border-subtle)]">
                    {selectedResult.artwork_url
                      ? <img src={selectedResult.artwork_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-[var(--bg-card)] flex items-center justify-center"><Music size={20} className="text-[var(--text-muted)]" /></div>
                    }
                    {selectedResult.artwork_url && (
                      <button
                        onClick={() => toggleField('artwork_url')}
                        className={`absolute inset-0 flex items-center justify-center transition-all cursor-pointer border-none ${
                          currentState.selectedFields.has('artwork_url')
                            ? 'bg-emerald-500/30 ring-2 ring-emerald-400'
                            : 'bg-black/0 hover:bg-black/20'
                        }`}
                      >
                        {currentState.selectedFields.has('artwork_url') && (
                          <Check size={20} className="text-emerald-400 drop-shadow-lg" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Fields */}
                  <div className="space-y-1.5">
                    {FIELD_META.filter(f => f.key !== 'artwork_url').map(({ key, label, icon: Icon }) => {
                      const found = selectedResult[key];
                      const current = currentTrack[key];
                      const isDiff = found && String(found) !== String(current || '');
                      const isSelected = currentState.selectedFields.has(key);
                      return (
                        <button
                          key={key}
                          onClick={() => found ? toggleField(key) : undefined}
                          disabled={!found}
                          className={`w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-lg transition-all cursor-pointer border ${
                            !found
                              ? 'opacity-40 bg-transparent border-transparent cursor-default'
                              : isSelected
                                ? 'bg-emerald-500/10 border-emerald-500/30'
                                : 'bg-transparent border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                            {isSelected
                              ? <Check size={10} className="text-emerald-400" />
                              : <Icon size={10} className="text-[var(--text-muted)]" />
                            }
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
                            <div className={`text-xs truncate ${isDiff ? 'text-emerald-300 font-medium' : 'text-[var(--text-secondary)]'}`}>
                              {found || <span className="italic opacity-40">—</span>}
                            </div>
                          </div>
                          {isDiff && (
                            <div className="shrink-0 text-[9px] text-emerald-500 font-semibold mt-0.5">NOUVEAU</div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {selectedResult.preview_url && (
                    <div className="mt-3">
                      <audio src={selectedResult.preview_url} controls className="w-full h-7 opacity-70" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-card)] shrink-0">
          <div className="flex items-center gap-2">
            {isBatch && currentIndex > 0 && (
              <button
                onClick={() => setCurrentIndex(i => i - 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-transparent border border-[var(--border-subtle)] hover:border-[var(--border-default)] cursor-pointer transition-all"
              >
                <ChevronLeft size={12} /> Précédent
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentState.status === 'not_found' ? (
              <button
                onClick={handleSkip}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-medium bg-transparent border border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)] cursor-pointer transition-all"
              >
                <SkipForward size={12} /> {isBatch ? 'Passer' : 'Fermer'}
              </button>
            ) : (
              <>
                <button
                  onClick={handleSkip}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-medium bg-transparent border border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)] cursor-pointer transition-all"
                >
                  <SkipForward size={12} /> {isBatch ? 'Ignorer' : 'Annuler'}
                </button>
                <button
                  onClick={handleValidate}
                  disabled={currentState.selectedFields.size === 0 || !selectedResult}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--accent-primary)] text-white border-none cursor-pointer disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  <Check size={12} />
                  Valider
                  {currentState.selectedFields.size > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/20 text-[9px]">
                      {currentState.selectedFields.size}
                    </span>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
