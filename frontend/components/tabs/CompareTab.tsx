'use client';

import React, { useState, useMemo } from 'react';
import type { Track } from '@/types';
import { mixScore, harmonicScore, bpmCompatible, keyToCamelot } from '@/lib/camelot';
import { ArrowLeftRight, Music, Gauge, Zap, Clock } from 'lucide-react';

interface CompareTabProps {
  trackA: Track | null;
  allTracks: Track[];
  onSelectTrack?: (track: Track) => void;
}

function StatRow({ label, valueA, valueB, match }: { label: string; valueA: string; valueB: string; match?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="text-[10px] text-[var(--text-muted)] w-16 text-right flex-shrink-0">{label}</span>
      <span className="flex-1 text-xs font-mono text-[var(--text-primary)] text-right truncate">{valueA || '—'}</span>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
        match === undefined ? 'bg-[var(--bg-primary)] text-[var(--text-muted)]'
        : match ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
      }`}>
        {match === undefined ? '—' : match ? '✓' : '✗'}
      </div>
      <span className="flex-1 text-xs font-mono text-[var(--text-primary)] truncate">{valueB || '—'}</span>
    </div>
  );
}

function CompareTab({ trackA, allTracks, onSelectTrack }: CompareTabProps) {
  const [trackBId, setTrackBId] = useState<number | null>(null);
  const trackB = allTracks.find(t => t.id === trackBId) || null;

  // Sort tracks by compatibility with trackA
  const sortedTracks = useMemo(() => {
    if (!trackA) return allTracks;
    return [...allTracks]
      .filter(t => t.id !== trackA.id)
      .map(t => ({
        track: t,
        score: mixScore(
          trackA.bpm || 0, trackA.key || '', trackA.energy || 0,
          t.bpm || 0, t.key || '', t.energy || 0,
        ),
      }))
      .sort((a, b) => b.score.score - a.score.score);
  }, [trackA, allTracks]);

  if (!trackA) {
    return (
      <div className="flex items-center justify-center h-32 text-[var(--text-muted)] text-sm">
        Sélectionne 2+ morceaux pour les comparer
      </div>
    );
  }

  const comparison = trackB ? mixScore(
    trackA.bpm || 0, trackA.key || '', trackA.energy || 0,
    trackB.bpm || 0, trackB.key || '', trackB.energy || 0,
  ) : null;

  const formatDuration = (ms?: number) => {
    if (!ms) return '—';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex-shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
          <ArrowLeftRight size={13} className="text-blue-400" />
          Comparaison
        </div>
      </div>

      {/* Track selector */}
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex-shrink-0">
        <label htmlFor="compare-track-select" className="text-[10px] text-[var(--text-muted)] block mb-1">
          Sélectionner un morceau à comparer
        </label>
        <select
          id="compare-track-select"
          value={trackBId || ''}
          onChange={(e) => setTrackBId(e.target.value ? parseInt(e.target.value) : null)}
          className="w-full px-2 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] outline-none focus:border-blue-500 cursor-pointer"
        >
          <option value="">Choisir un morceau à comparer…</option>
          {sortedTracks.map(({ track: t, score }) => (
            <option key={t.id} value={t.id}>
              {t.title} — {t.artist} ({score.score}% {score.label})
            </option>
          ))}
        </select>
      </div>

      {/* Score display */}
      {comparison && trackB && (
        <div className="px-3 py-3 border-b border-[var(--border-subtle)] flex-shrink-0">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div
              className="text-3xl font-black"
              style={{ color: comparison.color }}
            >
              {comparison.score}%
            </div>
            <div className="text-left">
              <div className="text-xs font-bold" style={{ color: comparison.color }}>
                {comparison.label}
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">
                Compatibilité mix
              </div>
            </div>
          </div>

          {/* Progress ring visual */}
          <div className="w-full h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${comparison.score}%`,
                background: `linear-gradient(90deg, ${comparison.color}40, ${comparison.color})`,
              }}
            />
          </div>
        </div>
      )}

      {/* Side-by-side stats */}
      {trackB && (
        <div className="px-3 py-2 flex-shrink-0 space-y-0.5">
          {/* Column headers */}
          <div className="flex items-center gap-2 pb-1 mb-1 border-b border-[var(--border-subtle)]">
            <span className="text-[10px] text-[var(--text-muted)] w-16 text-right flex-shrink-0"></span>
            <span className="flex-1 text-[10px] text-blue-400 font-semibold text-right truncate" title={trackA.title}>
              {trackA.title?.slice(0, 15)}
            </span>
            <span className="w-5 flex-shrink-0"></span>
            <span className="flex-1 text-[10px] text-purple-400 font-semibold truncate" title={trackB.title}>
              {trackB.title?.slice(0, 15)}
            </span>
          </div>

          <StatRow
            label="BPM"
            valueA={trackA.bpm ? String(Math.round(trackA.bpm)) : ''}
            valueB={trackB.bpm ? String(Math.round(trackB.bpm)) : ''}
            match={trackA.bpm && trackB.bpm ? bpmCompatible(trackA.bpm, trackB.bpm) : undefined}
          />
          <StatRow
            label="Tonalité"
            valueA={trackA.key ? `${trackA.key} (${keyToCamelot(trackA.key) || '?'})` : ''}
            valueB={trackB.key ? `${trackB.key} (${keyToCamelot(trackB.key) || '?'})` : ''}
            match={trackA.key && trackB.key ? harmonicScore(trackA.key, trackB.key) >= 2 : undefined}
          />
          <StatRow
            label="Énergie"
            valueA={trackA.energy != null ? `${Math.round(trackA.energy)}` : ''}
            valueB={trackB.energy != null ? `${Math.round(trackB.energy)}` : ''}
            match={trackA.energy != null && trackB.energy != null ? Math.abs(trackA.energy - trackB.energy) <= 20 : undefined}
          />
          <StatRow
            label="Genre"
            valueA={trackA.genre || ''}
            valueB={trackB.genre || ''}
            match={trackA.genre && trackB.genre ? trackA.genre === trackB.genre : undefined}
          />
          <StatRow
            label="Durée"
            valueA={formatDuration(trackA.analysis?.duration_ms)}
            valueB={formatDuration(trackB.analysis?.duration_ms)}
          />
        </div>
      )}

      {/* Best matches list */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-1.5">
          <div className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider mb-1">
            Meilleurs matchs
          </div>
        </div>
        <div className="px-2 space-y-0.5">
          {sortedTracks.slice(0, 15).map(({ track: t, score }) => (
            <button
              key={t.id}
              onClick={() => { setTrackBId(t.id); onSelectTrack?.(t); }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all cursor-pointer border-none bg-transparent hover:bg-[var(--bg-hover)] ${
                trackBId === t.id ? 'bg-[var(--bg-elevated)] ring-1 ring-blue-500/30' : ''
              }`}
            >
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{ color: score.color, background: `${score.color}18`, border: `1px solid ${score.color}30` }}
              >
                {score.score}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-[var(--text-primary)] truncate">{t.title}</div>
                <div className="text-[10px] text-[var(--text-muted)] truncate">{t.artist}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[10px] font-mono text-[var(--text-secondary)]">{t.bpm ? Math.round(t.bpm) : '—'}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{t.key || '—'}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default React.memo(CompareTab);
