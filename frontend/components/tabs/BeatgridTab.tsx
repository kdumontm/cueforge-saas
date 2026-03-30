'use client';

import { useState } from 'react';
import { Track } from '@/types';
import { Lock, Unlock, RotateCcw } from 'lucide-react';

interface Beatgrid {
  bpm: number | null;
  downbeat_ms: number;
  locked: boolean;
}

interface BeatgridTabProps {
  track: Track | null;
  beatgrid?: Beatgrid;
  onUpdateBeatgrid?: (beatgrid: Beatgrid) => void;
  onTapTempo?: (bpm: number) => void;
}

export function BeatgridTab({
  track,
  beatgrid = { bpm: null, downbeat_ms: 0, locked: false },
  onUpdateBeatgrid,
  onTapTempo,
}: BeatgridTabProps) {
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [isLocked, setIsLocked] = useState(beatgrid?.locked || false);
  const [downbeatOffset, setDownbeatOffset] = useState(beatgrid?.downbeat_ms || 0);

  if (!track) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <p>Sélectionne un morceau</p>
      </div>
    );
  }

  const handleTapTempo = () => {
    const now = Date.now();
    const newTapTimes = [...tapTimes, now];

    if (newTapTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < newTapTimes.length; i++) {
        intervals.push(newTapTimes[i] - newTapTimes[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
      const bpm = Math.round((60000 / avgInterval) * 10) / 10;
      onTapTempo?.(bpm);
    }

    setTapTimes(newTapTimes.length >= 4 ? [now] : newTapTimes);
  };

  const handleLockToggle = () => {
    const newLocked = !isLocked;
    setIsLocked(newLocked);
    onUpdateBeatgrid?.({
      bpm: beatgrid?.bpm || 0,
      downbeat_ms: downbeatOffset,
      locked: newLocked,
    });
  };

  const handleOffsetChange = (delta: number) => {
    const newOffset = downbeatOffset + delta;
    setDownbeatOffset(newOffset);
    onUpdateBeatgrid?.({
      bpm: beatgrid?.bpm || 0,
      downbeat_ms: newOffset,
      locked: isLocked,
    });
  };

  const duration = track.analysis?.duration_ms || 0;
  const durationSec = Math.floor(duration / 1000);
  const bars = beatgrid?.bpm ? Math.floor((duration / (60000 / beatgrid.bpm)) / 4) : 0;
  const beats = beatgrid?.bpm ? Math.floor(duration / (60000 / beatgrid.bpm)) : 0;

  return (
    <div className="space-y-4 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-400">BPM actuel</div>
            <div className="text-3xl font-bold text-white font-mono">
              {beatgrid?.bpm?.toFixed(1) || '—'}
            </div>
          </div>
          <button
            onClick={handleLockToggle}
            className={`p-3 rounded-lg transition-colors ${
              isLocked
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
            }`}
            title={isLocked ? 'Verrouillé' : 'Déverrouillé'}
          >
            {isLocked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        <div className="text-sm font-semibold text-gray-300">Offset du downbeat</div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleOffsetChange(-100)}
            className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm transition-colors"
          >
            -100ms
          </button>
          <input
            type="range"
            min="-500"
            max="500"
            value={downbeatOffset}
            onChange={(e) => setDownbeatOffset(parseInt(e.target.value))}
            className="flex-1"
          />
          <button
            onClick={() => handleOffsetChange(100)}
            className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm transition-colors"
          >
            +100ms
          </button>
        </div>
        <div className="text-xs text-gray-400 text-center">{downbeatOffset}ms</div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        <div className="text-sm font-semibold text-gray-300">Tap Tempo</div>
        <button
          onClick={handleTapTempo}
          className="w-full px-4 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
        >
          Tap Tempo ({tapTimes.length})
        </button>
        {tapTimes.length > 0 && (
          <div className="text-xs text-gray-400">
            Derniers taps: {tapTimes.length}/4
          </div>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        <div className="text-sm font-semibold text-gray-300">Analyse</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2 bg-gray-800 rounded text-center">
            <div className="text-xs text-gray-400">Durée</div>
            <div className="text-sm font-mono text-white">{durationSec}s</div>
          </div>
          <div className="p-2 bg-gray-800 rounded text-center">
            <div className="text-xs text-gray-400">Mesures</div>
            <div className="text-sm font-mono text-white">{bars}</div>
          </div>
        </div>
        <div className="p-2 bg-gray-800 rounded text-center">
          <div className="text-xs text-gray-400">Temps</div>
          <div className="text-sm font-mono text-white">{beats} beats</div>
        </div>
      </div>

      <button
        onClick={() => {
          setDownbeatOffset(0);
          setTapTimes([]);
          onUpdateBeatgrid?.({
            bpm: beatgrid?.bpm || 0,
            downbeat_ms: 0,
            locked: isLocked,
          });
        }}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
      >
        <RotateCcw className="w-4 h-4" />
        Réinitialiser
      </button>
    </div>
  );
}
export default BeatgridTab;
