'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Volume2, VolumeX, Settings, RotateCcw, Copy } from 'lucide-react';
import { Slider } from '@/components/ui/Slider';

interface Stem {
  id: string;
  name: string;
  duration: number;
  waveformPeaks?: number[];
  energyLevel?: number; // 0-100
  color?: string;
}

interface StemEffects {
  stemId: string;
  reverb: number; // 0-100
  delay: number; // 0-100
  filterFreq: number; // 20-20000 Hz
}

interface StemsAdvancedProps {
  stems: Stem[];
  trackDuration: number;
  onSoloChange?: (stemId: string, solo: boolean) => void;
  onMuteChange?: (stemId: string, mute: boolean) => void;
  onVolumeChange?: (stemId: string, volume: number) => void;
  onEffectsChange?: (effects: StemEffects) => void;
}

export default function StemsAdvanced({
  stems,
  trackDuration,
  onSoloChange = () => {},
  onMuteChange = () => {},
  onVolumeChange = () => {},
  onEffectsChange = () => {},
}: StemsAdvancedProps) {
  // ========== Solo/Mute State ==========
  const [muteState, setMuteState] = useState<Record<string, boolean>>(
    stems.reduce((acc, stem) => ({ ...acc, [stem.id]: false }), {})
  );

  const [soloState, setSoloState] = useState<Record<string, boolean>>(
    stems.reduce((acc, stem) => ({ ...acc, [stem.id]: false }), {})
  );

  const [volumeState, setVolumeState] = useState<Record<string, number>>(
    stems.reduce((acc, stem) => ({ ...acc, [stem.id]: 100 }), {})
  );

  // ========== Volume Curves (automation visualization) ==========
  const [showCurves, setShowCurves] = useState(true);
  const [volumeCurves, setVolumeCurves] = useState<Record<string, number[]>>(
    stems.reduce(
      (acc, stem) => ({
        ...acc,
        [stem.id]: Array(100).fill(100),
      }),
      {}
    )
  );

  // ========== Stem-specific Effects ==========
  const [stemEffects, setStemEffects] = useState<Record<string, StemEffects>>(
    stems.reduce(
      (acc, stem) => ({
        ...acc,
        [stem.id]: {
          stemId: stem.id,
          reverb: 0,
          delay: 0,
          filterFreq: 20000,
        },
      }),
      {}
    )
  );

  // ========== Comparison Mode (before/after) ==========
  const [comparisonMode, setComparisonMode] = useState(false);
  const [compareVolume, setCompareVolume] = useState(50);

  // ========== Stem Remix Mode ==========
  const [remixMode, setRemixMode] = useState(false);
  const [remixLooping, setRemixLooping] = useState(false);
  const [remixTempo, setRemixTempo] = useState(100);

  // ========== Karaoke Mode ==========
  const [karaokeMode, setKaraokeMode] = useState(false);
  const [vocalsStemId, setVocalsStemId] = useState<string | null>(
    stems.find((s) => s.name.toLowerCase().includes('vocal'))?.id ?? null
  );

  // ========== Practice Mode ==========
  const [practiceMode, setPracticeMode] = useState(false);
  const [practiceMutedStemId, setPracticeMutedStemId] = useState<string | null>(null);

  // ========== Handlers ==========
  const handleSolo = useCallback(
    (stemId: string) => {
      setSoloState((prev) => {
        const newState = { ...prev };
        const isSoloed = newState[stemId];

        if (isSoloed) {
          // Unmute all
          newState[stemId] = false;
          Object.keys(newState).forEach((id) => {
            newState[id] = false;
          });
        } else {
          // Solo this stem
          Object.keys(newState).forEach((id) => {
            newState[id] = id === stemId;
          });
        }

        onSoloChange(stemId, newState[stemId]);
        return newState;
      });
    },
    [onSoloChange]
  );

  const handleMute = useCallback(
    (stemId: string) => {
      setMuteState((prev) => {
        const newState = { ...prev, [stemId]: !prev[stemId] };
        onMuteChange(stemId, newState[stemId]);
        return newState;
      });
    },
    [onMuteChange]
  );

  const handleVolumeChange = useCallback(
    (stemId: string, volume: number) => {
      const newVolume = Math.max(0, Math.min(200, volume));
      setVolumeState((prev) => ({ ...prev, [stemId]: newVolume }));
      onVolumeChange(stemId, newVolume);
    },
    [onVolumeChange]
  );

  const handleEffectsChange = useCallback(
    (stemId: string, effects: Partial<StemEffects>) => {
      setStemEffects((prev) => {
        const newEffects = { ...prev[stemId], ...effects };
        const updated = { ...prev, [stemId]: newEffects };
        onEffectsChange(newEffects);
        return updated;
      });
    },
    [onEffectsChange]
  );

  const getEnergyColor = (energyLevel?: number) => {
    if (!energyLevel) return 'bg-blue-400';
    if (energyLevel >= 80) return 'bg-red-500';
    if (energyLevel >= 60) return 'bg-orange-500';
    if (energyLevel >= 40) return 'bg-yellow-500';
    return 'bg-green-400';
  };

  // Get waveform heights based on energy intensity
  const getWaveformHeights = (peaks?: number[], energyLevel?: number): number[] => {
    if (!peaks) return Array(50).fill(0.5);
    return peaks.slice(0, 50).map((peak) => {
      const baseHeight = peak * 0.5;
      const energyBoost = (energyLevel ?? 50) / 100;
      return Math.min(1, baseHeight * energyBoost);
    });
  };

  return (
    <div className="w-full bg-gray-900 text-white p-6 space-y-6">
      {/* ========== Control Tabs ========== */}
      <div className="flex gap-2 border-b border-gray-700 pb-4">
        <button
          onClick={() => setShowCurves(!showCurves)}
          className={`px-4 py-2 text-sm font-semibold rounded ${
            showCurves ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'
          }`}
        >
          Volume Curves
        </button>
        <button
          onClick={() => setComparisonMode(!comparisonMode)}
          className={`px-4 py-2 text-sm font-semibold rounded ${
            comparisonMode ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'
          }`}
        >
          Comparison
        </button>
        <button
          onClick={() => setRemixMode(!remixMode)}
          className={`px-4 py-2 text-sm font-semibold rounded ${
            remixMode ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'
          }`}
        >
          Remix
        </button>
        <button
          onClick={() => setKaraokeMode(!karaokeMode)}
          className={`px-4 py-2 text-sm font-semibold rounded ${
            karaokeMode ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'
          }`}
        >
          Karaoke
        </button>
        <button
          onClick={() => setPracticeMode(!practiceMode)}
          className={`px-4 py-2 text-sm font-semibold rounded ${
            practiceMode ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'
          }`}
        >
          Practice
        </button>
      </div>

      {/* ========== Main Stems Control ========== */}
      <div className="space-y-4">
        {stems.map((stem) => {
          const isMuted = muteState[stem.id];
          const isSoloed = soloState[stem.id];
          const volume = volumeState[stem.id];
          const effects = stemEffects[stem.id];
          const waveformHeights = getWaveformHeights(stem.waveformPeaks, stem.energyLevel);

          return (
            <div
              key={stem.id}
              className="border border-gray-700 rounded-lg p-4 space-y-3 bg-gray-800/50"
            >
              {/* Stem Header */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-base">{stem.name}</h3>
                  <div className="text-xs text-gray-400 mt-1">
                    Duration: {Math.round(stem.duration)}ms | Energy: {stem.energyLevel ?? 50}%
                  </div>
                </div>

                {/* Solo/Mute Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSolo(stem.id)}
                    className={`px-3 py-1 text-xs rounded font-semibold ${
                      isSoloed ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    S
                  </button>
                  <button
                    onClick={() => handleMute(stem.id)}
                    className={`px-3 py-1 text-xs rounded font-semibold ${
                      isMuted ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    M
                  </button>
                </div>
              </div>

              {/* Waveform Visualization */}
              <div className="h-16 bg-gray-900 rounded flex items-end gap-px p-2">
                {waveformHeights.map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${getEnergyColor(stem.energyLevel)}`}
                    style={{ height: `${height * 100}%` }}
                  />
                ))}
              </div>

              {/* Volume Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Volume</span>
                  <span className="text-xs text-gray-400">{volume}%</span>
                </div>
                <Slider
                  value={[volume]}
                  onValueChange={(vals) => handleVolumeChange(stem.id, vals[0])}
                  min={0}
                  max={200}
                  step={1}
                  className="w-full"
                />
              </div>

              {/* Per-Stem Effects */}
              <div className="space-y-3 border-t border-gray-700 pt-3">
                <div className="text-xs font-semibold">Effects</div>

                {/* Reverb */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Reverb</span>
                    <span className="text-gray-400">{effects.reverb}%</span>
                  </div>
                  <Slider
                    value={[effects.reverb]}
                    onValueChange={(vals) => handleEffectsChange(stem.id, { reverb: vals[0] })}
                    min={0}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Delay */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Delay</span>
                    <span className="text-gray-400">{effects.delay}%</span>
                  </div>
                  <Slider
                    value={[effects.delay]}
                    onValueChange={(vals) => handleEffectsChange(stem.id, { delay: vals[0] })}
                    min={0}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Filter */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Filter</span>
                    <span className="text-gray-400">{Math.round(effects.filterFreq)} Hz</span>
                  </div>
                  <Slider
                    value={[effects.filterFreq]}
                    onValueChange={(vals) => handleEffectsChange(stem.id, { filterFreq: vals[0] })}
                    min={20}
                    max={20000}
                    step={100}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ========== Comparison Mode ========== */}
      {comparisonMode && (
        <div className="border border-blue-500 rounded-lg p-4 bg-blue-900/20 space-y-3">
          <div className="text-sm font-semibold">Comparison: Before / After</div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-gray-400">Before</span>
            <Slider
              value={[compareVolume]}
              onValueChange={(vals) => setCompareVolume(vals[0])}
              min={0}
              max={100}
              step={1}
              className="flex-1"
            />
            <span className="text-xs text-gray-400">After ({compareVolume}%)</span>
          </div>
        </div>
      )}

      {/* ========== Remix Mode ========== */}
      {remixMode && (
        <div className="border border-purple-500 rounded-lg p-4 bg-purple-900/20 space-y-3">
          <div className="text-sm font-semibold">Remix Mode</div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={remixLooping}
                onChange={(e) => setRemixLooping(e.target.checked)}
                className="w-4 h-4"
              />
              Enable Looping
            </label>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>Tempo</span>
              <span className="text-gray-400">{remixTempo}%</span>
            </div>
            <Slider
              value={[remixTempo]}
              onValueChange={(vals) => setRemixTempo(vals[0])}
              min={50}
              max={150}
              step={1}
              className="w-full"
            />
          </div>
        </div>
      )}

      {/* ========== Karaoke Mode ========== */}
      {karaokeMode && (
        <div className="border border-pink-500 rounded-lg p-4 bg-pink-900/20 space-y-3">
          <div className="text-sm font-semibold">Karaoke Mode</div>
          <div className="space-y-2">
            <label className="text-xs">Mute Vocals:</label>
            <select
              value={vocalsStemId ?? ''}
              onChange={(e) => setVocalsStemId(e.target.value || null)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-xs text-white"
            >
              <option value="">Select vocals stem...</option>
              {stems.map((stem) => (
                <option key={stem.id} value={stem.id}>
                  {stem.name}
                </option>
              ))}
            </select>
          </div>
          {vocalsStemId && (
            <div className="text-xs text-gray-400 p-2 bg-gray-800 rounded">
              Vocals muted - Accompaniment playing
            </div>
          )}
        </div>
      )}

      {/* ========== Practice Mode ========== */}
      {practiceMode && (
        <div className="border border-green-500 rounded-lg p-4 bg-green-900/20 space-y-3">
          <div className="text-sm font-semibold">Practice Mode</div>
          <div className="space-y-2">
            <label className="text-xs">Practice by removing:</label>
            <select
              value={practiceMutedStemId ?? ''}
              onChange={(e) => setPracticeMutedStemId(e.target.value || null)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-xs text-white"
            >
              <option value="">Select stem to mute...</option>
              {stems.map((stem) => (
                <option key={stem.id} value={stem.id}>
                  {stem.name}
                </option>
              ))}
            </select>
          </div>
          {practiceMutedStemId && (
            <div className="text-xs text-gray-400 p-2 bg-gray-800 rounded">
              Practice mode: Muting selected stem - Play along!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
