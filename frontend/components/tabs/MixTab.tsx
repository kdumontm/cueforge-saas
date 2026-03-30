'use client';

import { useState } from 'react';
import { Track } from '@/types';
import { toCamelot, getCompatibleKeys, isMixCompatible, getCompatibilityScore } from '@/lib/constants';
import { getKeyColor } from '@/lib/constants';

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
  const [bpmTolerance, setBpmTolerance] = useState(6);

  if (!track) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <p>Sélectionne un morceau</p>
      </div>
    );
  }

  const currentKey = track.analysis?.key;
  const currentBpm = track.analysis?.bpm || 0;

  const compatibleTracks = tracks
    .filter((t) => t.id !== track.id && t.analysis)
    .filter((t) => {
      if (!currentKey || !t.analysis?.key) return false;
      const compatible = isMixCompatible(currentKey, t.analysis.key);
      if (!compatible) return false;

      const trackBpm = t.analysis?.bpm || 0;
      const tolerance = (bpmTolerance / 100) * currentBpm;
      return Math.abs(currentBpm - trackBpm) <= tolerance;
    })
    .map((t) => ({
      track: t,
      score: t.analysis?.key ? getCompatibilityScore(currentKey!, t.analysis.key, currentBpm, t.analysis.bpm || 0, bpmTolerance / 100) : 0,
    }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-4 p-4">
      {/* Current Track Info */}
      <div className="p-4 rounded-lg bg-gray-900 border border-gray-800">
        <div className="text-xs text-gray-400 mb-2">Morceau actuel</div>
        <div className="flex items-center gap-3">
          <div
            className="px-3 py-1 rounded-lg font-bold text-sm text-white"
            style={{ backgroundColor: getKeyColor(currentKey || '') }}
          >
            {currentKey || '—'}
          </div>
          <div className="text-sm font-mono text-white">
            {currentBpm.toFixed(1)} BPM
          </div>
        </div>
      </div>

      {/* BPM Tolerance */}
      <div className="p-4 rounded-lg bg-gray-900 border border-gray-800 space-y-3">
        <div className="text-sm font-semibold text-gray-300">Tolérance BPM: ±{bpmTolerance}%</div>
        <input
          type="range"
          min="0"
          max="20"
          value={bpmTolerance}
          onChange={(e) => setBpmTolerance(parseInt(e.target.value))}
          className="w-full"
        />
        <div className="text-xs text-gray-400 text-center">
          ±{((bpmTolerance / 100) * currentBpm).toFixed(1)} BPM
        </div>
      </div>

      {/* Compatible Tracks */}
      <div className="space-y-2">
        <div className="text-sm font-semibold text-gray-300">
          Morceaux compatibles ({compatibleTracks.length})
        </div>

        {compatibleTracks.length === 0 ? (
          <p className="text-sm text-gray-500 p-3">Aucun morceau compatible</p>
        ) : (
          <div className="space-y-2">
            {compatibleTracks.map(({ track: t, score }) => (
              <button
                key={t.id}
                onClick={() => onSelectTrack?.(t)}
                className="w-full text-left p-3 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="px-2 py-1 rounded-lg font-bold text-xs text-white"
                    style={{ backgroundColor: getKeyColor(t.analysis?.key || '') }}
                  >
                    {t.analysis?.key || '—'}
                  </div>
                  <div className="text-sm font-mono text-white">
                    {t.analysis?.bpm?.toFixed(1) || '—'} BPM
                  </div>
                </div>

                <div className="mb-2">
                  <div className="text-sm text-gray-300">
                    {t.title || t.filename}
                  </div>
                  <div className="text-xs text-gray-500">
                    {t.artist || 'Artiste inconnu'}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Compatibilité</span>
                    <span>{Math.round(score)}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-400 to-blue-500"
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
