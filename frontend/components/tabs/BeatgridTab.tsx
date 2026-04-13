'use client';

import { useState, useMemo } from 'react';
import { Track } from '@/types';
import { Lock, Unlock, RotateCcw, Music2 } from 'lucide-react';
import { useLang } from '@/components/LangProvider';
import { tr } from '@/lib/i18n';

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

const formatDuration = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export function BeatgridTab({
  track,
  beatgrid = { bpm: null, downbeat_ms: 0, locked: false },
  onUpdateBeatgrid,
  onTapTempo,
}: BeatgridTabProps) {
  const { lang } = useLang();
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [calculatedBpm, setCalculatedBpm] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(beatgrid?.locked || false);
  const [downbeatOffset, setDownbeatOffset] = useState(beatgrid?.downbeat_ms || 0);

  if (!track) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[var(--text-muted)] space-y-3">
        <Music2 size={48} className="opacity-40" />
        <p>{tr('beatgrid.select_track', lang)}</p>
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
      setCalculatedBpm(bpm);
      onTapTempo?.(bpm);
    }

    setTapTimes(newTapTimes.length >= 4 ? [now] : newTapTimes);
  };

  const handleResetTapTempo = () => {
    setTapTimes([]);
    setCalculatedBpm(null);
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

  const handleBpmChange = (multiplier: 1 | 0.5 | 2) => {
    const currentBpm = beatgrid?.bpm || 0;
    if (currentBpm > 0) {
      const newBpm = Math.round((currentBpm * multiplier) * 10) / 10;
      onUpdateBeatgrid?.({
        bpm: newBpm,
        downbeat_ms: downbeatOffset,
        locked: isLocked,
      });
    }
  };

  const handleBpmNudge = (delta: number) => {
    const currentBpm = beatgrid?.bpm || 0;
    if (currentBpm > 0) {
      const newBpm = Math.round((currentBpm + delta) * 10) / 10;
      onUpdateBeatgrid?.({
        bpm: newBpm,
        downbeat_ms: downbeatOffset,
        locked: isLocked,
      });
    }
  };

  const handleDirectBpmInput = (value: string) => {
    const newBpm = parseFloat(value);
    if (!isNaN(newBpm) && newBpm > 0) {
      const roundedBpm = Math.round(newBpm * 10) / 10;
      onUpdateBeatgrid?.({
        bpm: roundedBpm,
        downbeat_ms: downbeatOffset,
        locked: isLocked,
      });
    }
  };

  const duration = track.analysis?.duration_ms || 0;

  // Memoize beatgrid calculations
  const gridData = useMemo(() => {
    const displayDuration = formatDuration(duration);
    const bars = beatgrid?.bpm ? Math.floor((duration / (60000 / beatgrid.bpm)) / 4) : 0;
    const beats = beatgrid?.bpm ? Math.floor(duration / (60000 / beatgrid.bpm)) : 0;
    const barsToShow = Math.min(bars, 8);
    const beatsPerBar = 4;
    return { displayDuration, bars, beats, barsToShow, beatsPerBar };
  }, [duration, beatgrid?.bpm]);

  return (
    <div className="space-y-4 p-4">
      {/* BPM Display & Controls */}
      <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-[var(--text-muted)]">{tr('beatgrid.current_bpm', lang)}</div>
            <div className="text-3xl font-bold text-[var(--text-primary)] font-mono">
              {beatgrid?.bpm?.toFixed(1) || '—'}
            </div>
          </div>
          <button
            onClick={handleLockToggle}
            className={`p-3 rounded-lg transition-colors ${
              isLocked
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'
            }`}
            title={isLocked ? tr('beatgrid.locked', lang) : tr('beatgrid.unlocked', lang)}
            aria-pressed={isLocked}
            aria-label={isLocked ? 'Unlock grid' : 'Lock grid'}
          >
            {isLocked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
          </button>
        </div>

        {/* BPM Nudge Buttons */}
        {beatgrid?.bpm && (
          <div className="space-y-3">
            {/* Fine-grained nudge controls */}
            <div className="flex gap-1">
              <button
                onClick={() => handleBpmNudge(-1)}
                className="px-2 py-1.5 rounded bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-medium transition-colors"
                title="Diminuer de 1 BPM"
              >
                -1
              </button>
              <button
                onClick={() => handleBpmNudge(-0.5)}
                className="px-2 py-1.5 rounded bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-medium transition-colors"
                title="Diminuer de 0.5 BPM"
              >
                -0.5
              </button>
              <button
                onClick={() => handleBpmNudge(-0.1)}
                className="px-2 py-1.5 rounded bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-medium transition-colors"
                title="Diminuer de 0.1 BPM"
              >
                -0.1
              </button>
              <button
                onClick={() => handleBpmNudge(0.1)}
                className="px-2 py-1.5 rounded bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-medium transition-colors"
                title="Augmenter de 0.1 BPM"
              >
                +0.1
              </button>
              <button
                onClick={() => handleBpmNudge(0.5)}
                className="px-2 py-1.5 rounded bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-medium transition-colors"
                title="Augmenter de 0.5 BPM"
              >
                +0.5
              </button>
              <button
                onClick={() => handleBpmNudge(1)}
                className="px-2 py-1.5 rounded bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-medium transition-colors"
                title="Augmenter de 1 BPM"
              >
                +1
              </button>
            </div>

            {/* Direct BPM input */}
            <div className="flex gap-2 items-center">
              <label className="text-xs text-[var(--text-muted)] w-16">{tr('beatgrid.direct_bpm', lang)}</label>
              <input
                type="number"
                step="0.1"
                min="1"
                max="300"
                defaultValue={beatgrid?.bpm?.toFixed(1) || ''}
                onBlur={(e) => handleDirectBpmInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleDirectBpmInput((e.target as HTMLInputElement).value);
                  }
                }}
                className="flex-1 px-2 py-1.5 rounded bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm font-mono border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--accent)]"
                placeholder={tr('beatgrid.direct_placeholder', lang)}
              />
            </div>

            {/* Double/Half BPM buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => handleBpmChange(0.5)}
                className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-sm font-medium transition-colors"
                title="Divide by 2"
              >
                {tr('beatgrid.half', lang)}
              </button>
              <button
                onClick={() => handleBpmChange(2)}
                className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-sm font-medium transition-colors"
                title="Multiply by 2"
              >
                {tr('beatgrid.double', lang)}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Beatgrid Visual Preview */}
      {beatgrid?.bpm && gridData.barsToShow > 0 && (
        <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
          <div className="text-sm font-semibold text-[var(--text-secondary)]">{tr('beatgrid.preview_title', lang)}</div>
          <div className="space-y-2">
            {Array.from({ length: gridData.barsToShow }).map((_, barIdx) => (
              <div key={barIdx} className="flex items-center gap-2">
                <div className="text-xs text-[var(--text-muted)] w-6 text-right">{barIdx + 1}</div>
                <div className="flex-1 flex gap-1">
                  {Array.from({ length: gridData.beatsPerBar }).map((_, beatIdx) => (
                    <div
                      key={beatIdx}
                      className={`h-8 rounded ${
                        beatIdx === 0
                          ? 'bg-[var(--accent)] flex-1'
                          : 'bg-[var(--accent)] opacity-50 flex-1'
                      }`}
                      title={`Mesure ${barIdx + 1}, temps ${beatIdx + 1}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {gridData.bars > gridData.barsToShow && (
            <div className="text-xs text-[var(--text-muted)]">
              {tr('beatgrid.bars_more', lang).replace('{count}', (gridData.bars - gridData.barsToShow).toString())}
            </div>
          )}
        </div>
      )}

      {/* Offset du downbeat */}
      <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
        <div className="text-sm font-semibold text-[var(--text-secondary)]">{tr('beatgrid.downbeat_offset', lang)}</div>

        {/* Coarse controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOffsetChange(-100)}
            className="px-3 py-2 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-sm transition-colors"
            title="Decrease 100ms"
          >
            {tr('beatgrid.coarse_100', lang)}
          </button>
          <input
            type="range"
            min="-500"
            max="500"
            value={downbeatOffset}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              setDownbeatOffset(value);
              onUpdateBeatgrid?.({
                bpm: beatgrid?.bpm || 0,
                downbeat_ms: value,
                locked: isLocked,
              });
            }}
            className="flex-1"
          />
          <button
            onClick={() => handleOffsetChange(100)}
            className="px-3 py-2 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-sm transition-colors"
            title="Increase 100ms"
          >
            {tr('beatgrid.coarse_plus100', lang)}
          </button>
        </div>

        {/* Fine-tune controls */}
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => handleOffsetChange(-5)}
            className="px-2 py-1.5 rounded bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] font-medium transition-colors"
            title="Diminuer de 5ms"
          >
            -5ms
          </button>
          <button
            onClick={() => handleOffsetChange(-1)}
            className="px-2 py-1.5 rounded bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] font-medium transition-colors"
            title="Diminuer de 1ms"
          >
            -1ms
          </button>
          <div className="flex-1 text-center text-[var(--text-muted)]">{downbeatOffset}ms</div>
          <button
            onClick={() => handleOffsetChange(1)}
            className="px-2 py-1.5 rounded bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] font-medium transition-colors"
            title="Augmenter de 1ms"
          >
            +1ms
          </button>
          <button
            onClick={() => handleOffsetChange(5)}
            className="px-2 py-1.5 rounded bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] font-medium transition-colors"
            title="Augmenter de 5ms"
          >
            +5ms
          </button>
        </div>
      </div>

      {/* Tap Tempo */}
      <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
        <div className="text-sm font-semibold text-[var(--text-secondary)]">{tr('beatgrid.tap_tempo', lang)}</div>
        <button
          onClick={handleTapTempo}
          className="w-full px-4 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
        >
          {tr('beatgrid.tap_count', lang).replace('{count}', tapTimes.length.toString())}
        </button>
        {calculatedBpm && (
          <div className="bg-[var(--bg-primary)] rounded p-3 text-center">
            <div className="text-xs text-[var(--text-muted)]">{tr('beatgrid.calculated', lang)}</div>
            <div className="text-lg font-bold text-[var(--accent)]">{calculatedBpm.toFixed(1)}</div>
          </div>
        )}
        {tapTimes.length > 0 && (
          <div className="flex items-center justify-between">
            <div className="text-xs text-[var(--text-muted)]">
              {tr('beatgrid.taps', lang).replace('{count}', tapTimes.length.toString())}
            </div>
            <button
              onClick={handleResetTapTempo}
              className="px-3 py-1 text-xs rounded bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors"
            >
              {tr('beatgrid.reset', lang)}
            </button>
          </div>
        )}
      </div>

      {/* Analyse */}
      <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
        <div className="text-sm font-semibold text-[var(--text-secondary)]">{tr('beatgrid.analysis_title', lang)}</div>
        <div className="grid grid-cols-3 gap-3">
          <div className="p-2 bg-[var(--bg-primary)] rounded text-center">
            <div className="text-xs text-[var(--text-muted)]">{tr('beatgrid.duration', lang)}</div>
            <div className="text-sm font-mono text-[var(--text-primary)]">{gridData.displayDuration}</div>
          </div>
          <div className="p-2 bg-[var(--bg-primary)] rounded text-center">
            <div className="text-xs text-[var(--text-muted)]">{tr('beatgrid.bars', lang)}</div>
            <div className="text-sm font-mono text-[var(--text-primary)]">{gridData.bars}</div>
          </div>
          <div className="p-2 bg-[var(--bg-primary)] rounded text-center">
            <div className="text-xs text-[var(--text-muted)]">{tr('beatgrid.beats', lang)}</div>
            <div className="text-sm font-mono text-[var(--text-primary)]">{gridData.beats}</div>
          </div>
        </div>
      </div>

      {/* Reset Button */}
      <button
        onClick={() => {
          setDownbeatOffset(0);
          setTapTimes([]);
          setCalculatedBpm(null);
          onUpdateBeatgrid?.({
            bpm: beatgrid?.bpm || 0,
            downbeat_ms: 0,
            locked: isLocked,
          });
        }}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors"
      >
        <RotateCcw className="w-4 h-4" />
        {tr('beatgrid.reset', lang)}
      </button>
    </div>
  );
}
export default BeatgridTab;
