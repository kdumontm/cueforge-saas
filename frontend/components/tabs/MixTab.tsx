'use client';

import React, { useState, useMemo } from 'react';
import { Track } from '@/types';
import { toCamelot, getCompatibleKeys, isMixCompatible, getCompatibilityScore, getKeyColor } from '@/lib/constants';
import { useLang } from '@/components/LangProvider';
import { tr } from '@/lib/i18n';
// Optimized Camelot wheel component
import { CamelotWheelOptimized } from '@/components/ui/CamelotWheelOptimized';

interface MixTabProps {
  track: Track | null;
  tracks: Track[];
  onSelectTrack?: (track: Track) => void;
}

export function MixTab({
  track,
  tracks = [],
  onSelectTrack,
}: MixTabProps) {
  const { lang } = useLang();
  const [bpmTolerance, setBpmTolerance] = useState(6);
  const [sortBy, setSortBy] = useState<'score' | 'bpm' | 'energy' | 'key'>('score');
  const [showEnergyMatch, setShowEnergyMatch] = useState(false);

  if (!track) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[var(--text-muted)] gap-2">
        <span className="text-2xl">🎡</span>
        <p className="text-sm">{tr('general.no_selection', lang)}</p>
        <p className="text-xs opacity-60">Sélectionne un morceau pour voir les mix compatibles</p>
      </div>
    );
  }

  const currentKey = track.analysis?.key;
  const currentBpm = track.analysis?.bpm || 0;
  const currentEnergy = track.analysis?.energy || 0;
  const camelotKey = toCamelot(currentKey || '');

  const compatibleTracks = useMemo(() => {
    return tracks
      .filter((t) => t.id !== track.id && t.analysis)
      .filter((t) => {
        if (!currentKey || !t.analysis?.key) return false;
        const compatible = isMixCompatible(currentKey, t.analysis.key);
        if (!compatible) return false;

        const trackBpm = t.analysis?.bpm || 0;
        const tolerance = (bpmTolerance / 100) * currentBpm;
        if (Math.abs(currentBpm - trackBpm) > tolerance) return false;

        // Optionnel: filtre énergie (±20%)
        if (showEnergyMatch) {
          const trackEnergy = t.analysis?.energy || 0;
          if (Math.abs(currentEnergy - trackEnergy) > 0.2) return false;
        }

        return true;
      })
      .map((t) => ({
        track: t,
        score: t.analysis?.key ? getCompatibilityScore(currentKey!, t.analysis.key, currentBpm, t.analysis.bpm || 0, bpmTolerance / 100) : 0,
        bpmDiff: Math.abs(currentBpm - (t.analysis?.bpm || 0)),
        energyDiff: Math.abs(currentEnergy - (t.analysis?.energy || 0)),
      }))
      .sort((a, b) => {
        if (sortBy === 'bpm') return a.bpmDiff - b.bpmDiff;
        if (sortBy === 'energy') return a.energyDiff - b.energyDiff;
        if (sortBy === 'key') return (a.track.analysis?.key || '').localeCompare(b.track.analysis?.key || '');
        return b.score - a.score;
      });
  }, [tracks, track.id, currentKey, currentBpm, currentEnergy, bpmTolerance, sortBy, showEnergyMatch]);

  const compatibleKeys = currentKey ? getCompatibleKeys(currentKey) : [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Current Track Info */}
      <div className="px-3 pt-3 pb-2 border-b border-[var(--border-subtle)] flex-shrink-0 space-y-2">
        <div className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Morceau actuel</div>
        <div className="flex items-center gap-2">
          <div
            className="px-2.5 py-1 rounded-lg font-bold text-xs text-white shadow-sm"
            style={{ backgroundColor: getKeyColor(currentKey || '') }}
          >
            {camelotKey || currentKey || '—'}
          </div>
          <div className="text-sm font-mono text-[var(--text-primary)]">
            {currentBpm.toFixed(1)} BPM
          </div>
          {currentEnergy > 0 && (
            <div className="ml-auto text-xs text-[var(--text-muted)]">
              ⚡ {Math.round(currentEnergy * 100)}%
            </div>
          )}
        </div>

        {/* Optimized Camelot Wheel visualization */}
        <div className="mt-3 flex justify-center">
          <CamelotWheelOptimized
            currentKey={camelotKey || currentKey}
            currentBpm={currentBpm}
            matchingKeys={compatibleKeys}
            energy={currentEnergy > 0.66 ? 'high' : currentEnergy > 0.33 ? 'medium' : 'low'}
            interactive={false}
          />
        </div>

        {/* Compatible Keys display */}
        {compatibleKeys.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="text-[8px] text-[var(--text-muted)] uppercase self-center mr-1">Compatible:</span>
            {compatibleKeys.slice(0, 6).map(k => (
              <span key={k} className="px-1.5 py-0.5 rounded text-[9px] font-mono"
                style={{ backgroundColor: getKeyColor(k) + '30', color: getKeyColor(k) }}>
                {toCamelot(k) || k}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex-shrink-0 space-y-2">
        {/* BPM Tolerance */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-semibold text-[var(--text-muted)] uppercase w-12">BPM</span>
          <input
            type="range" min="0" max="20" value={bpmTolerance}
            onChange={(e) => setBpmTolerance(parseInt(e.target.value))}
            className="flex-1 accent-blue-500"
          />
          <span className="text-[10px] font-mono text-[var(--text-secondary)] w-14 text-right">
            ±{bpmTolerance}% ({((bpmTolerance / 100) * currentBpm).toFixed(0)})
          </span>
        </div>

        {/* Sort + Energy filter */}
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="flex-1 px-2 py-1 rounded text-[10px] bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
          >
            <option value="score">Tri: Score</option>
            <option value="bpm">Tri: BPM</option>
            <option value="energy">Tri: Énergie</option>
            <option value="key">Tri: Tonalité</option>
          </select>
          <button
            onClick={() => setShowEnergyMatch(!showEnergyMatch)}
            className={`px-2 py-1 rounded text-[10px] border transition-colors ${
              showEnergyMatch
                ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                : 'bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-muted)]'
            }`}
          >
            ⚡ Énergie
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-1.5 text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-wider sticky top-0 bg-[var(--bg-secondary)] z-10">
          {compatibleTracks.length} morceau{compatibleTracks.length !== 1 ? 'x' : ''} compatible{compatibleTracks.length !== 1 ? 's' : ''}
        </div>

        {compatibleTracks.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-[var(--text-muted)]">Aucun morceau compatible</p>
            <p className="text-[10px] text-[var(--text-muted)] opacity-60 mt-1">
              Aucun morceau ne correspond aux critères actuels:
            </p>
            <div className="mt-3 text-[9px] text-[var(--text-muted)] space-y-1">
              <p>• Tonalité compatible (hors tolérance BPM)</p>
              <p>• BPM dans ±{bpmTolerance}% ({((bpmTolerance / 100) * currentBpm).toFixed(0)} BPM)</p>
              {showEnergyMatch && <p>• Énergie dans ±20%</p>}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] opacity-60 mt-3">
              Essaie d'augmenter la tolérance BPM ou d'importer plus de morceaux
            </p>
          </div>
        ) : (
          <div className="px-2 pb-2 space-y-1">
            {compatibleTracks.map(({ track: t, score, bpmDiff, energyDiff }) => {
              // Energy match indicator (point 627)
              const energyMatch = energyDiff ?? Math.abs((t.analysis?.energy || 0) - currentEnergy);
              const energyColor = energyMatch < 0.1 ? 'text-green-400' : energyMatch < 0.2 ? 'text-yellow-400' : 'text-red-400';
              const energyPercent = Math.round((1 - energyMatch) * 100);

              return (
              <button
                key={t.id}
                onClick={() => onSelectTrack?.(t)}
                className="w-full text-left px-2.5 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-blue-500/40 hover:bg-blue-500/5 transition-all group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
                    style={{ backgroundColor: getKeyColor(t.analysis?.key || '') }}
                  >
                    {toCamelot(t.analysis?.key || '') || t.analysis?.key || '—'}
                  </div>
                  <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                    {t.analysis?.bpm?.toFixed(1) || '—'}
                  </span>
                  <span className="text-[9px] text-[var(--text-muted)]">
                    ({bpmDiff > 0 ? (bpmDiff > 0 ? '+' : '') + bpmDiff.toFixed(1) : '=0'})
                  </span>
                  {/* Energy match indicator (point 627) */}
                  <span className={`text-[9px] font-semibold ${energyColor}`}>
                    ⚡ {energyPercent}%
                  </span>
                  <span className="ml-auto text-[10px] font-bold" style={{
                    color: score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : score >= 40 ? '#f97316' : '#ef4444'
                  }}>
                    {Math.round(score)}%
                  </span>
                </div>
                <div className="text-xs text-[var(--text-primary)] truncate">{t.title || t.filename}</div>
                <div className="text-[10px] text-[var(--text-muted)] truncate">{t.artist || '—'}</div>
                {/* Score bar */}
                <div className="mt-1.5 w-full h-1 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${score}%`,
                      backgroundColor: score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : score >= 40 ? '#f97316' : '#ef4444'
                    }}
                  />
                </div>
              </button>
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
export default React.memo(MixTab);
