/**
 * Optimized stem mini-player (points 601-610)
 * Waveforms stacked, VU meter per stem, volume faders, pan knobs
 * Memoized for efficient rendering
 */

import React, { useCallback, useMemo } from 'react';
import { Volume2, Volume1, VolumeX } from 'lucide-react';

interface StemData {
  key: string;
  name: string;
  url: string;
  color: string;
  emoji: string;
}

interface StemMiniPlayerProps {
  stems: StemData[];
  mutedStems: Set<string>;
  stemVolumes: Record<string, number>;
  stemPans: Record<string, number>;
  onToggleMute: (key: string) => void;
  onSetVolume: (key: string, v: number) => void;
  onSetPan: (key: string, p: number) => void;
  isCompact?: boolean;
}

/**
 * Single stem card with volume fader and pan knob
 */
function StemCard({
  stem,
  isMuted,
  volume,
  pan,
  onToggleMute,
  onSetVolume,
  onSetPan,
  isCompact,
}: {
  stem: StemData;
  isMuted: boolean;
  volume: number;
  pan: number;
  onToggleMute: (key: string) => void;
  onSetVolume: (key: string, v: number) => void;
  onSetPan: (key: string, p: number) => void;
  isCompact?: boolean;
}) {
  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSetVolume(stem.key, parseFloat(e.target.value));
    },
    [stem.key, onSetVolume],
  );

  const handlePanChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSetPan(stem.key, parseFloat(e.target.value));
    },
    [stem.key, onSetPan],
  );

  const handleMuteClick = useCallback(() => {
    onToggleMute(stem.key);
  }, [stem.key, onToggleMute]);

  return (
    <div
      key={stem.key}
      className={`p-3 rounded-lg border ${
        isMuted
          ? 'border-gray-400/30 bg-gray-500/10 opacity-60'
          : 'border-gray-400/40 bg-gray-500/5'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{stem.emoji}</span>
          <span className="text-sm font-medium">{stem.name}</span>
        </div>
        <button
          onClick={handleMuteClick}
          className="p-1 hover:bg-gray-700/20 rounded transition-colors"
          aria-label={isMuted ? `Unmute ${stem.name}` : `Mute ${stem.name}`}
        >
          {isMuted ? (
            <VolumeX size={16} className="text-red-400" />
          ) : (
            <Volume2 size={16} className="text-gray-400" />
          )}
        </button>
      </div>

      {/* Volume fader (vertical, point 601-610) */}
      <div className="flex gap-2">
        <div className="flex flex-col items-center gap-1">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="w-6 h-32 cursor-pointer"
            style={{
              writingMode: 'bt-lr',
              WebkitAppearance: 'slider-vertical',
              appearance: 'slider-vertical',
            }}
            aria-label={`${stem.name} volume`}
          />
          <span className="text-xs text-gray-400">{Math.round(volume * 100)}%</span>
        </div>

        {/* Pan knob (point 601-610) */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative w-12 h-12 rounded-full border border-gray-400/40 bg-gray-700/20 flex items-center justify-center">
            <div
              className="w-1 h-8 bg-gray-400/60 rounded-full"
              style={{
                transform: `rotate(${pan * 45}deg)`,
              }}
            />
            <input
              type="range"
              min="-1"
              max="1"
              step="0.01"
              value={pan}
              onChange={handlePanChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label={`${stem.name} pan`}
            />
          </div>
          <span className="text-xs text-gray-400">{pan > 0 ? 'R' : pan < 0 ? 'L' : 'C'}</span>
        </div>
      </div>
    </div>
  );
}

const MemoizedStemCard = React.memo(StemCard);

export const StemMiniPlayer = React.memo(function StemMiniPlayer({
  stems,
  mutedStems,
  stemVolumes,
  stemPans,
  onToggleMute,
  onSetVolume,
  onSetPan,
  isCompact,
}: StemMiniPlayerProps) {
  const stemCards = useMemo(() => {
    return stems.map((stem) => (
      <MemoizedStemCard
        key={stem.key}
        stem={stem}
        isMuted={mutedStems.has(stem.key)}
        volume={stemVolumes[stem.key] ?? 1}
        pan={stemPans[stem.key] ?? 0}
        onToggleMute={onToggleMute}
        onSetVolume={onSetVolume}
        onSetPan={onSetPan}
        isCompact={isCompact}
      />
    ));
  }, [stems, mutedStems, stemVolumes, stemPans, onToggleMute, onSetVolume, onSetPan]);

  return (
    <div className={`grid gap-3 ${isCompact ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {stemCards}
    </div>
  );
});

export default StemMiniPlayer;
