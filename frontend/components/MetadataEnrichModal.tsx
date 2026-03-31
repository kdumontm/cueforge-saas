// @ts-nocheck
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Search, Check, SkipForward, Loader2, Music, Disc, User,
  Tag, Calendar, Image as ImageIcon, AlertCircle, CheckCircle2,
  ChevronLeft, Fingerprint, Wand2,
} from 'lucide-react';
import { identifyTrack, spotifyApply, updateTrackMetadata } from '@/lib/api';
import type { IdentifyResult } from '@/lib/api';

// ─── Types ─────────────────────────────────────────────────────────────────

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

interface EnrichState {
  status: 'pending' | 'identifying' | 'found' | 'not_found' | 'error' | 'done' | 'skipped';
  result: IdentifyResult | null;
  selectedFields: Set<string>;
  message?: string;
}

interface MetadataEnrichModalProps {
  tracks: TrackData[];
  onClose: () => void;
  onTrackUpdated?: (trackId: number, data: Partial<TrackData>) => void;
}

// ─── Field config ───────────────────────────────────────────────────────────

const FIELDS = [
  { key: 'title',       label: 'Titre',    Icon: Music      },
  { key: 'artist',      label: 'Artiste',  Icon: User       },
  { key: 'album',       label: 'Album',    Icon: Disc       },
  { key: 'genre',       label: 'Genre',    Icon: Tag        },
  { key: 'year',        label: 'Année',    Icon: Calendar   },
  { key: 'artwork_url', label: 'Pochette', Icon: ImageIcon  },
];

const SOURCE_LABEL: Record<string, string> = {
  'acoustid+musicbrainz':         'AcoustID + MusicBrainz',
  'acoustid+musicbrainz+spotify': 'AcoustID + MusicBrainz + Spotify',
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function MetadataEnrichModal({ tracks, onClose, onTrackUpdated }: MetadataEnrichModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [states, setStates] = useState<Map<number, EnrichState>>(new Map());
  const [summary, setSummary] = useState<{ updated: number; skipped: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const currentTrack = tracks[currentIndex];
  const state = currentTrack ? states.get(currentTrack.id) : null;
  const isBatch = tracks.length > 1;

  // ── Init states ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = new Map<number, EnrichState>();
    for (const t of tracks) {
      map.set(t.id, { status: 'pending', result: null, selectedFields: new Set() });
    }
    setStates(map);
  }, []);

  // ── Auto-identify when track changes ────────────────────────────────────
  useEffect(() => {
    if (!currentTrack) return;
    const s = states.get(currentTrack.id);
    if (!s || s.status === 'pending') {
      runIdentify(currentTrack.id);
    }
  }, [currentIndex, currentTrack?.id, states.size]);

  // ── Identify via audio fingerprint ──────────────────────────────────────
  const runIdentify = useCallback(async (trackId: number) => {
    patchState(trackId, { status: 'identifying', result: null, selectedFields: new Set() });

    try {
      const resp = await identifyTrack(trackId);

      if (resp.status === 'found' && resp.result) {
        const r = resp.result;
        const track = tracks.find(t => t.id === trackId);
        const auto = new Set<string>();
        if (r.title   && r.title   !== (track?.title   || '')) auto.add('title');
        if (r.artist  && r.artist  !== (track?.artist  || '')) auto.add('artist');
        if (r.album   && r.album   !== (track?.album   || '')) auto.add('album');
        if (r.genre   && r.genre   !== (track?.genre   || '')) auto.add('genre');
        if (r.year    && r.year    !== (track?.year    ?? null)) auto.add('year');
        if (r.artwork_url && r.artwork_url !== (track?.artwork_url || '')) auto.add('artwork_url');

        patchState(trackId, { status: 'found', result: r, selectedFields: auto });
      } else {
        patchState(trackId, {
          status: 'not_found',
          result: null,
          message: resp.message || (
            resp.status === 'no_fingerprint'
              ? 'Impossible d\'analyser l\'empreinte audio (fpcalc non disponible ou fichier trop court)'
              : 'Track non identifié dans la base AcoustID'
          ),
        });
      }
    } catch (e: any) {
      patchState(trackId, {
        status: 'error',
        result: null,
        message: e?.message || 'Erreur lors de l\'identification',
      });
    }
  }, [tracks]);

  const patchState = (trackId: number, patch: Partial<EnrichState>) => {
    setStates(prev => {
      const next = new Map(prev);
      const existing = next.get(trackId) || { status: 'pending', result: null, selectedFields: new Set() };
      next.set(trackId, { ...existing, ...patch });
      return next;
    });
  };

  const toggleField = (field: string) => {
    if (!currentTrack) return;
    const s = states.get(currentTrack.id);
    if (!s) return;
    const next = new Set(s.selectedFields);
    if (next.has(field)) next.delete(field); else next.add(field);
    patchState(currentTrack.id, { selectedFields: next });
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleValidate = async () => {
    if (!currentTrack || !state?.result) return;
    setSaving(true);

    const r = state.result;
    const patch: any = {};
    for (const field of state.selectedFields) {
      if ((r as any)[field] !== undefined) patch[field] = (r as any)[field];
    }

    try {
      if (r.spotify_id) {
        await spotifyApply(currentTrack.id, { spotify_id: r.spotify_id, ...patch });
      } else {
        await updateTrackMetadata(currentTrack.id, patch);
      }
      if (onTrackUpdated) onTrackUpdated(currentTrack.id, patch);
      patchState(currentTrack.id, { status: 'done' });
      goNext('done');
    } catch (e) {
      console.error('Failed to save', e);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    patchState(currentTrack.id, { status: 'skipped' });
    goNext('skipped');
  };

  const goNext = (lastStatus?: 'done' | 'skipped') => {
    if (currentIndex < tracks.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      const updated = Array.from(states.values()).filter(s => s.status === 'done').length
        + (lastStatus === 'done' ? 1 : 0);
      setSummary({ updated, skipped: tracks.length - updated });
    }
  };

  // ── Summary ───────────────────────────────────────────────────────────────
  if (summary) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
          <CheckCircle2 size={52} className="text-emerald-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Enrichissement terminé</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            <span className="text-emerald-400 font-semibold">{summary.updated}</span> track{summary.updated !== 1 ? 's' : ''} mis{summary.updated !== 1 ? 'es' : ''} à jour &nbsp;·&nbsp;
            <span className="text-[var(--text-muted)] font-semibold">{summary.skipped}</span> ignoré{summary.skipped !== 1 ? 's' : ''}
          </p>
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-[var(--accent-primary)] text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer border-none">
            Fermer
          </button>
        </div>
      </div>
    );
  }

  if (!currentTrack || !state) return null;

  const r = state.result;
  const doneCount = Array.from(states.values()).filter(s => s.status === 'done').length;
  const sourceLabel = r?.source ? (SOURCE_LABEL[r.source] || r.source) : '';
  const confidence = r?.acoustid_score ? Math.round(r.acoustid_score * 100) : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-center gap-2.5">
            <Fingerprint size={17} className="text-[var(--accent-primary)]" />
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Identification audio</h2>
              {isBatch && (
                <p className="text-[10px] text-[var(--text-muted)]">
                  Track {currentIndex + 1} / {tracks.length} &nbsp;·&nbsp; {doneCount} mis à jour
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-pointer bg-transparent border-none">
            <X size={15} />
          </button>
        </div>

        {/* Batch progress */}
        {isBatch && (
          <div className="h-0.5 bg-[var(--bg-card)] shrink-0">
            <div className="h-full bg-[var(--accent-primary)] transition-all duration-500" style={{ width: `${(currentIndex / tracks.length) * 100}%` }} />
          </div>
        )}

        {/* Track label */}
        <div className="px-5 py-2 bg-[var(--bg-card)] border-b border-[var(--border-subtle)] shrink-0 flex items-center justify-between">
          <p className="text-xs text-[var(--text-muted)] truncate">
            🎵&nbsp;
            <span className="text-[var(--text-primary)] font-medium">
              {currentTrack.title || currentTrack.original_filename || `Track #${currentTrack.id}`}
            </span>
            {currentTrack.artist && <span className="text-[var(--text-secondary)]"> — {currentTrack.artist}</span>}
          </p>
          {/* Retry button */}
          {(state.status === 'not_found' || state.status === 'error') && (
            <button
              onClick={() => runIdentify(currentTrack.id)}
              className="flex items-center gap-1 text-[10px] text-[var(--accent-primary)] hover:underline cursor-pointer bg-transparent border-none"
            >
              <Wand2 size={10} /> Réessayer
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* Identifying spinner */}
          {state.status === 'identifying' && (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <div className="relative">
                <Fingerprint size={44} className="text-[var(--accent-primary)]/30" />
                <Loader2 size={20} className="animate-spin text-[var(--accent-primary)] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="text-sm text-[var(--text-secondary)] font-medium">Analyse de l'empreinte audio…</p>
              <p className="text-[11px] text-[var(--text-muted)]">AcoustID · MusicBrainz · Spotify</p>
            </div>
          )}

          {/* Not found / Error */}
          {(state.status === 'not_found' || state.status === 'error') && (
            <div className="flex flex-col items-center justify-center py-14 gap-2.5">
              <AlertCircle size={36} className={state.status === 'error' ? 'text-red-400' : 'text-amber-400'} />
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                {state.status === 'error' ? 'Erreur d\'identification' : 'Track non reconnu'}
              </p>
              {state.message && (
                <p className="text-[11px] text-[var(--text-muted)] text-center max-w-xs px-4">{state.message}</p>
              )}
            </div>
          )}

          {/* Found: split view */}
          {state.status === 'found' && r && (
            <div className="p-5">

              {/* Source badge */}
              <div className="flex items-center gap-2 mb-4">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <CheckCircle2 size={10} /> Identifié via {sourceLabel}
                </span>
                {confidence !== null && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                    confidence >= 80 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                    confidence >= 50 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                    'bg-red-500/10 border-red-500/20 text-red-400'
                  }`}>
                    Confiance : {confidence}%
                  </span>
                )}
              </div>

              {/* Two-column layout */}
              <div className="grid grid-cols-2 gap-5 divide-x divide-[var(--border-subtle)]">

                {/* LEFT — Current */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                    Métadonnées actuelles
                  </p>
                  {/* Artwork */}
                  <div className="w-16 h-16 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] overflow-hidden mb-4 flex items-center justify-center">
                    {currentTrack.artwork_url
                      ? <img src={currentTrack.artwork_url} alt="" className="w-full h-full object-cover" />
                      : <Music size={22} className="text-[var(--text-muted)]" />
                    }
                  </div>
                  <div className="space-y-2.5">
                    {FIELDS.filter(f => f.key !== 'artwork_url').map(({ key, label, Icon }) => (
                      <div key={key} className="flex items-start gap-2">
                        <Icon size={11} className="text-[var(--text-muted)] mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
                          <div className="text-xs text-[var(--text-secondary)] truncate">
                            {(currentTrack as any)[key] || <span className="italic opacity-30">—</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* RIGHT — Found */}
                <div className="pl-5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                    Trouvé &nbsp;<span className="text-[var(--accent-primary)] normal-case">— coche les champs à appliquer</span>
                  </p>

                  {/* Artwork */}
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden mb-4 border border-[var(--border-subtle)]">
                    {r.artwork_url
                      ? <img src={r.artwork_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-[var(--bg-card)] flex items-center justify-center"><Music size={22} className="text-[var(--text-muted)]" /></div>
                    }
                    {r.artwork_url && (
                      <button
                        onClick={() => toggleField('artwork_url')}
                        className={`absolute inset-0 flex items-center justify-center transition-all cursor-pointer border-none ${
                          state.selectedFields.has('artwork_url')
                            ? 'bg-emerald-500/25 ring-2 ring-emerald-400 ring-inset'
                            : 'hover:bg-black/20 bg-transparent'
                        }`}
                      >
                        {state.selectedFields.has('artwork_url') && <Check size={20} className="text-emerald-300 drop-shadow-lg" />}
                      </button>
                    )}
                  </div>

                  {/* Fields */}
                  <div className="space-y-1.5">
                    {FIELDS.filter(f => f.key !== 'artwork_url').map(({ key, label, Icon }) => {
                      const found = (r as any)[key];
                      const current = (currentTrack as any)[key];
                      const isDiff = found !== undefined && found !== null && String(found) !== String(current ?? '');
                      const isSelected = state.selectedFields.has(key);
                      const hasValue = found !== undefined && found !== null && found !== '';

                      return (
                        <button
                          key={key}
                          onClick={() => hasValue ? toggleField(key) : undefined}
                          disabled={!hasValue}
                          className={`w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all border ${
                            !hasValue
                              ? 'opacity-30 bg-transparent border-transparent cursor-default'
                              : isSelected
                                ? 'bg-emerald-500/10 border-emerald-500/30 cursor-pointer'
                                : 'bg-transparent border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)] cursor-pointer'
                          }`}
                        >
                          <div className="shrink-0 w-3.5 flex items-center justify-center">
                            {isSelected
                              ? <Check size={10} className="text-emerald-400" />
                              : <Icon size={10} className="text-[var(--text-muted)]" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
                            <div className={`text-xs truncate ${isDiff ? 'text-emerald-300 font-medium' : 'text-[var(--text-secondary)]'}`}>
                              {String(found ?? '') || <span className="italic opacity-30">—</span>}
                            </div>
                          </div>
                          {isDiff && (
                            <span className="shrink-0 text-[8px] font-bold text-emerald-500 uppercase">new</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {r.musicbrainz_id && (
                    <a
                      href={`https://musicbrainz.org/recording/${r.musicbrainz_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-[9px] text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors"
                    >
                      🎵 Voir sur MusicBrainz ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-card)] shrink-0">
          <div>
            {isBatch && currentIndex > 0 && (
              <button
                onClick={() => setCurrentIndex(i => i - 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-transparent border border-[var(--border-subtle)] hover:border-[var(--border-default)] cursor-pointer transition-all"
              >
                <ChevronLeft size={11} /> Précédent
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSkip}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-medium bg-transparent border border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)] cursor-pointer transition-all"
            >
              <SkipForward size={11} /> {isBatch ? 'Ignorer' : 'Annuler'}
            </button>

            {state.status === 'found' && (
              <button
                onClick={handleValidate}
                disabled={state.selectedFields.size === 0 || saving}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--accent-primary)] text-white border-none cursor-pointer disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                Appliquer
                {state.selectedFields.size > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/20 text-[9px]">
                    {state.selectedFields.size}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
