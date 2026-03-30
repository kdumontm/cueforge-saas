'use client';

/**
 * CompatibleTracks — Affiche les tracks les plus compatibles pour mixer
 * avec une track de référence (Camelot wheel + BPM matching).
 *
 * Usage:
 *   <CompatibleTracks trackId={selectedTrack.id} trackTitle={selectedTrack.title} />
 */

import { useState, useEffect } from 'react';
import { Loader2, Music2, Zap, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { getCompatibleTracks } from '@/lib/api';
import type { CompatibleTrack } from '@/lib/api';

interface Props {
  trackId: number;
  trackTitle?: string | null;
  trackKey?: string | null;
  trackBpm?: number | null;
  onSelectTrack?: (trackId: number) => void;
}

const REC_STYLES: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  excellent: { bg: 'bg-green-500/10 border-green-500/20', text: 'text-green-400', icon: CheckCircle2, label: 'Excellent' },
  good:      { bg: 'bg-blue-500/10 border-blue-500/20',   text: 'text-blue-400',  icon: Zap,          label: 'Bon' },
  possible:  { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400', icon: Info,         label: 'Possible' },
  risky:     { bg: 'bg-red-500/10 border-red-500/20',     text: 'text-red-400',   icon: AlertCircle,  label: 'Risqué' },
};

function ScoreBadge({ score, rec }: { score: number; rec: string }) {
  const style = REC_STYLES[rec] || REC_STYLES.possible;
  const Icon = style.icon;
  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${style.bg} ${style.text}`}>
      <Icon size={11} />
      {style.label}
      <span className="font-mono opacity-70 ml-0.5">{score}</span>
    </div>
  );
}

function CamelotBadge({ code }: { code?: string | null }) {
  if (!code) return null;
  const num = parseInt(code);
  const colors = [
    '', '#ef4444','#f97316','#eab308','#22c55e','#06b6d4',
    '#3b82f6','#8b5cf6','#ec4899','#14b8a6','#a855f7',
    '#f43f5e','#0ea5e9',
  ];
  const color = colors[num] || '#6b7280';
  return (
    <span
      className="inline-flex items-center justify-center w-[30px] h-[18px] rounded text-[11px] font-bold font-mono"
      style={{ background: color + '25', color }}
    >
      {code}
    </span>
  );
}

function HarmonicStars({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3].map(n => (
        <div
          key={n}
          className={`w-1.5 h-1.5 rounded-full ${n <= score ? 'bg-purple-400' : 'bg-[var(--border-subtle)]'}`}
        />
      ))}
    </div>
  );
}

export default function CompatibleTracks({ trackId, trackTitle, trackKey, trackBpm, onSelectTrack }: Props) {
  const [data, setData] = useState<{ reference: any; compatible: CompatibleTrack[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trackId) return;
    setLoading(true);
    setError(null);
    getCompatibleTracks(trackId, 15)
      .then(setData)
      .catch(e => setError(e?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [trackId]);

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <div>
          <h3 className="text-[13px] font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Zap size={14} className="text-purple-400" />
            Tracks compatibles
          </h3>
          {trackTitle && (
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Pour mixer avec <span className="text-[var(--text-secondary)] font-medium">{trackTitle}</span>
              {trackBpm && <span className="ml-1 font-mono">{Math.round(trackBpm)} BPM</span>}
              {trackKey && <span className="ml-1">· {trackKey}</span>}
            </p>
          )}
        </div>
        {data && (
          <span className="text-[11px] text-[var(--text-muted)]">
            {data.compatible.length} résultat{data.compatible.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-10 text-[var(--text-muted)]">
          <Loader2 size={16} className="animate-spin mr-2" />
          <span className="text-[13px]">Calcul des compatibilités...</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="px-4 py-6 text-center text-[13px] text-[var(--text-muted)]">
          {error === 'Failed to fetch compatible tracks'
            ? 'Analyse la track pour obtenir ses compatibilités.'
            : error}
        </div>
      )}

      {/* No results */}
      {!loading && !error && data && data.compatible.length === 0 && (
        <div className="px-4 py-8 text-center">
          <Music2 size={28} className="text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
          <p className="text-[13px] text-[var(--text-muted)]">
            Aucune track compatible trouvée.<br />
            Analyse plus de tracks pour obtenir des suggestions.
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && !error && data && data.compatible.length > 0 && (
        <div className="divide-y divide-[var(--border-subtle)]">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_70px_60px_auto_auto] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <span>Track</span>
            <span className="text-right">BPM</span>
            <span className="text-center">Camelot</span>
            <span className="text-center">Harmonie</span>
            <span>Score</span>
          </div>

          {data.compatible.map((track) => (
            <div
              key={track.track_id}
              className={`grid grid-cols-[1fr_70px_60px_auto_auto] gap-3 items-center px-4 py-3 transition-colors hover:bg-[var(--bg-hover)] ${
                onSelectTrack ? 'cursor-pointer' : ''
              }`}
              onClick={() => onSelectTrack?.(track.track_id)}
            >
              {/* Title + artist */}
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
                  {track.title || `Track ${track.track_id}`}
                </p>
                {track.artist && (
                  <p className="text-[11px] text-[var(--text-muted)] truncate">{track.artist}</p>
                )}
              </div>

              {/* BPM */}
              <div className="text-right">
                <span className="text-[12px] font-mono text-[var(--text-secondary)]">
                  {track.bpm ? Math.round(track.bpm) : '—'}
                </span>
                {track.bpm_compatible && (
                  <div className="text-[9px] text-green-400 text-right">✓ BPM ok</div>
                )}
              </div>

              {/* Camelot badge */}
              <div className="flex justify-center">
                <CamelotBadge code={track.camelot} />
              </div>

              {/* Harmonic stars */}
              <div className="flex justify-center">
                <HarmonicStars score={track.harmonic_score} />
              </div>

              {/* Score badge */}
              <ScoreBadge score={track.overall_score} rec={track.recommendation} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
