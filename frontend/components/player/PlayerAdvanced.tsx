'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw, Volume2, Zap } from 'lucide-react';
import { Slider } from '@/components/ui/Slider';

interface Track {
  id: number;
  title: string;
  artist: string;
  bpm?: number | null;
  key?: string | null;
  duration?: string;
  energy?: number | null;
}

interface PlaylistTrack {
  id: number;
  track: Track;
  order: number;
}

interface PlayerAdvancedProps {
  currentTrack: Track | null;
  playlist: PlaylistTrack[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onTimeUpdate: (time: number) => void;
  playerRef?: React.MutableRefObject<any>;
}

// A/B Loop State
interface LoopMarker {
  positionMs: number;
  label: 'A' | 'B';
}

export default function PlayerAdvanced({
  currentTrack,
  playlist,
  currentIndex,
  isPlaying,
  currentTime,
  duration,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onTimeUpdate,
  playerRef,
}: PlayerAdvancedProps) {
  // ========== A/B Loop ==========
  const [loopMarkers, setLoopMarkers] = useState<LoopMarker[]>([]);
  const [isLoopMode, setIsLoopMode] = useState(false);

  const setLoopA = useCallback(() => {
    setLoopMarkers((prev) => {
      const filtered = prev.filter((m) => m.label !== 'A');
      return [...filtered, { positionMs: currentTime, label: 'A' }];
    });
  }, [currentTime]);

  const setLoopB = useCallback(() => {
    setLoopMarkers((prev) => {
      const filtered = prev.filter((m) => m.label !== 'B');
      return [...filtered, { positionMs: currentTime, label: 'B' }];
    });
  }, [currentTime]);

  const clearLoop = useCallback(() => {
    setLoopMarkers([]);
    setIsLoopMode(false);
  }, []);

  // Get loop positions for waveform rendering
  const loopPositions = loopMarkers.reduce(
    (acc, marker) => {
      if (marker.label === 'A') acc.a = marker.positionMs;
      if (marker.label === 'B') acc.b = marker.positionMs;
      return acc;
    },
    { a: null as number | null, b: null as number | null }
  );

  // ========== Speed Control (0.5x - 2.0x) ==========
  const [playbackRate, setPlaybackRate] = useState(1.0);

  const handlePlaybackRateChange = useCallback(
    (rate: number) => {
      setPlaybackRate(Math.max(0.5, Math.min(2.0, rate)));
      if (playerRef?.current?.playbackRate) {
        playerRef.current.playbackRate = rate;
      }
    },
    [playerRef]
  );

  const snapPlaybackRate = useCallback(() => {
    const snappedRate = playbackRate > 0.95 && playbackRate < 1.05 ? 1.0 : playbackRate;
    setPlaybackRate(snappedRate);
    if (playerRef?.current?.playbackRate) {
      playerRef.current.playbackRate = snappedRate;
    }
  }, [playbackRate, playerRef]);

  // ========== Pitch Control (±8%) ==========
  const [pitchShift, setPitchShift] = useState(0);

  const handlePitchChange = useCallback((value: number) => {
    setPitchShift(Math.max(-8, Math.min(8, value)));
  }, []);

  const resetPitch = useCallback(() => {
    setPitchShift(0);
  }, []);

  // ========== Loop Length Presets ==========
  const loopLengthBars = [1, 2, 4, 8, 16, 32];

  const setLoopLength = useCallback(
    (bars: number) => {
      if (!currentTrack?.bpm) return;
      const msPerBeat = 60000 / currentTrack.bpm;
      const msPerBar = msPerBeat * 4; // 4 beats per bar
      const loopLengthMs = msPerBar * bars;

      const loopA = loopMarkers.find((m) => m.label === 'A');
      if (loopA) {
        setLoopMarkers([
          { positionMs: loopA.positionMs, label: 'A' },
          { positionMs: loopA.positionMs + loopLengthMs, label: 'B' },
        ]);
      }
    },
    [currentTrack?.bpm, loopMarkers]
  );

  // ========== Tap Tempo ==========
  const [tapTempoTaps, setTapTempoTaps] = useState<number[]>([]);
  const [calculatedBpm, setCalculatedBpm] = useState<number | null>(null);
  const [tapFlash, setTapFlash] = useState(false);

  const handleTapTempo = useCallback(() => {
    const now = Date.now();
    const newTaps = [...tapTempoTaps, now].slice(-8);
    setTapTempoTaps(newTaps);
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 200);

    if (newTaps.length >= 2) {
      const intervals = [];
      for (let i = 1; i < newTaps.length; i++) {
        intervals.push(newTaps[i] - newTaps[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avgInterval);
      setCalculatedBpm(bpm);
    }

    setTimeout(() => setTapTempoTaps([]), 3000);
  }, [tapTempoTaps]);

  // ========== EQ Kill Switches ==========
  const [eqKills, setEqKills] = useState({
    low: false,
    mid: false,
    high: false,
  });

  const toggleEQKill = useCallback((band: 'low' | 'mid' | 'high') => {
    setEqKills((prev) => ({
      ...prev,
      [band]: !prev[band],
    }));
  }, []);

  // ========== Crossfader (Deck A ↔ B) ==========
  const [crossfadeValue, setCrossfadeValue] = useState(50); // 0 = Deck A, 100 = Deck B

  // ========== Play Queue ==========
  const [queueVisible, setQueueVisible] = useState(false);

  const moveInQueue = useCallback(
    (fromIndex: number, toIndex: number) => {
      // This would typically call an external handler
      console.log(`Moving track from ${fromIndex} to ${toIndex}`);
    },
    []
  );

  // ========== Repeat Modes ==========
  const repeatModes = ['off', 'one', 'all'] as const;
  const [repeatMode, setRepeatMode] = useState<typeof repeatModes[number]>('off');

  const cycleRepeatMode = useCallback(() => {
    const currentIndex = repeatModes.indexOf(repeatMode);
    setRepeatMode(repeatModes[(currentIndex + 1) % repeatModes.length]);
  }, [repeatMode]);

  // ========== Resume from Last Position ==========
  useEffect(() => {
    if (currentTrack) {
      const savedPosition = localStorage.getItem(`track-position-${currentTrack.id}`);
      if (savedPosition) {
        const position = parseInt(savedPosition);
        onTimeUpdate(position);
      }
    }
  }, [currentTrack, onTimeUpdate]);

  // Save position periodically
  useEffect(() => {
    if (currentTrack && isPlaying) {
      const interval = setInterval(() => {
        localStorage.setItem(`track-position-${currentTrack.id}`, Math.round(currentTime).toString());
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [currentTrack, currentTime, isPlaying]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full bg-gray-900 text-white p-6 rounded-lg space-y-6">
      {/* ========== Track Info ========== */}
      {currentTrack && (
        <div className="border-b border-gray-700 pb-4">
          <h2 className="text-lg font-bold">{currentTrack.title}</h2>
          <p className="text-sm text-gray-400">{currentTrack.artist}</p>
        </div>
      )}

      {/* ========== Transport Controls ========== */}
      <div className="flex items-center gap-4">
        <button onClick={onPrevious} className="p-2 hover:bg-gray-800 rounded">
          <SkipBack size={20} />
        </button>
        <button
          onClick={isPlaying ? onPause : onPlay}
          className="p-3 bg-blue-600 hover:bg-blue-500 rounded-full"
        >
          {isPlaying ? <Pause size={24} /> : <Play size={24} />}
        </button>
        <button onClick={onNext} className="p-2 hover:bg-gray-800 rounded">
          <SkipForward size={20} />
        </button>

        {/* Time display */}
        <div className="text-xs text-gray-400 ml-auto">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      {/* ========== A/B Loop Section ========== */}
      <div className="space-y-2 border-t border-gray-700 pt-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold">A/B Loop</label>
          <div className="flex gap-2">
            <button
              onClick={setLoopA}
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded"
            >
              Set A ({formatTime(loopPositions.a ?? 0)})
            </button>
            <button
              onClick={setLoopB}
              className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-500 rounded"
            >
              Set B ({formatTime(loopPositions.b ?? duration)})
            </button>
            <button
              onClick={clearLoop}
              className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Loop visualization */}
        {loopPositions.a !== null && loopPositions.b !== null && (
          <div className="h-8 bg-gray-800 rounded relative overflow-hidden">
            <div
              className="absolute h-full bg-blue-500 opacity-20"
              style={{
                left: `${(loopPositions.a / duration) * 100}%`,
                width: `${((loopPositions.b - loopPositions.a) / duration) * 100}%`,
              }}
            />
            <div
              className="absolute h-full w-1 bg-blue-500"
              style={{ left: `${(loopPositions.a / duration) * 100}%` }}
            />
            <div
              className="absolute h-full w-1 bg-purple-500"
              style={{ left: `${(loopPositions.b / duration) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* ========== Speed Control ========== */}
      <div className="space-y-2 border-t border-gray-700 pt-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold">Speed: {playbackRate.toFixed(2)}x</label>
          <button onClick={snapPlaybackRate} className="text-xs text-gray-400 hover:text-white">
            ↓ Snap to 1.0x
          </button>
        </div>
        <Slider
          value={[playbackRate]}
          onValueChange={(vals) => handlePlaybackRateChange(vals[0])}
          min={0.5}
          max={2.0}
          step={0.05}
          className="w-full"
        />
        <div className="flex gap-2 text-xs">
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
            <button
              key={rate}
              onClick={() => handlePlaybackRateChange(rate)}
              className={`px-2 py-1 rounded ${
                Math.abs(playbackRate - rate) < 0.05
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>
      </div>

      {/* ========== Pitch Control ========== */}
      <div className="space-y-2 border-t border-gray-700 pt-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold">Pitch: {pitchShift > 0 ? '+' : ''}{pitchShift}%</label>
          <button onClick={resetPitch} className="text-xs text-gray-400 hover:text-white">
            <RotateCcw size={14} className="inline" /> Reset
          </button>
        </div>
        <Slider
          value={[pitchShift]}
          onValueChange={(vals) => handlePitchChange(vals[0])}
          min={-8}
          max={8}
          step={0.5}
          className="w-full"
        />
      </div>

      {/* ========== Loop Length Presets ========== */}
      <div className="space-y-2 border-t border-gray-700 pt-4">
        <label className="text-sm font-semibold">Loop Length</label>
        <div className="grid grid-cols-6 gap-2">
          {loopLengthBars.map((bars) => (
            <button
              key={bars}
              onClick={() => setLoopLength(bars)}
              className="px-2 py-2 text-xs bg-gray-800 hover:bg-gray-700 rounded"
            >
              {bars}B
            </button>
          ))}
        </div>
      </div>

      {/* ========== Tap Tempo ========== */}
      <div className="space-y-2 border-t border-gray-700 pt-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold">Tap Tempo</label>
          {calculatedBpm && <span className="text-xs bg-green-600 px-2 py-1 rounded">{calculatedBpm} BPM</span>}
        </div>
        <button
          onClick={handleTapTempo}
          className={`w-full py-3 rounded font-semibold transition-all ${
            tapFlash
              ? 'bg-yellow-500 scale-105 text-black'
              : 'bg-gray-800 hover:bg-gray-700 text-white'
          }`}
        >
          TAP (x{tapTempoTaps.length})
        </button>
      </div>

      {/* ========== EQ Kill Switches ========== */}
      <div className="space-y-2 border-t border-gray-700 pt-4">
        <label className="text-sm font-semibold">EQ Kill Switches</label>
        <div className="grid grid-cols-3 gap-2">
          {(['low', 'mid', 'high'] as const).map((band) => (
            <button
              key={band}
              onClick={() => toggleEQKill(band)}
              className={`py-2 rounded font-semibold text-xs uppercase transition-all ${
                eqKills[band]
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {band}
              {eqKills[band] && ' ✕'}
            </button>
          ))}
        </div>
      </div>

      {/* ========== Crossfader ========== */}
      <div className="space-y-2 border-t border-gray-700 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">Deck A</span>
          <label className="text-sm font-semibold">Crossfader</label>
          <span className="text-xs font-semibold">Deck B</span>
        </div>
        <Slider
          value={[crossfadeValue]}
          onValueChange={(vals) => setCrossfadeValue(vals[0])}
          min={0}
          max={100}
          step={1}
          className="w-full"
        />
        <div className="text-xs text-gray-400 text-center">{crossfadeValue}%</div>
      </div>

      {/* ========== Repeat Mode ========== */}
      <div className="space-y-2 border-t border-gray-700 pt-4">
        <button
          onClick={cycleRepeatMode}
          className={`w-full py-2 rounded text-xs font-semibold uppercase ${
            repeatMode === 'off'
              ? 'bg-gray-800 text-gray-400'
              : repeatMode === 'one'
                ? 'bg-blue-600 text-white'
                : 'bg-purple-600 text-white'
          }`}
        >
          Repeat: {repeatMode === 'off' ? '⊘' : repeatMode === 'one' ? '①' : '∞'}
        </button>
      </div>

      {/* ========== Play Queue ========== */}
      <div className="space-y-2 border-t border-gray-700 pt-4">
        <button
          onClick={() => setQueueVisible(!queueVisible)}
          className="w-full py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm font-semibold"
        >
          {queueVisible ? 'Hide' : 'Show'} Queue ({playlist.length} tracks)
        </button>

        {queueVisible && (
          <div className="bg-gray-800 rounded max-h-64 overflow-y-auto space-y-1">
            {playlist.map((item, idx) => (
              <div
                key={item.id}
                className={`px-3 py-2 text-xs flex justify-between items-center ${
                  idx === currentIndex ? 'bg-blue-600' : 'hover:bg-gray-700'
                }`}
              >
                <span>
                  {idx + 1}. {item.track.title}
                </span>
                <span className="text-gray-400">{item.track.artist}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
