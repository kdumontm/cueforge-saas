'use client';

import { useState, useEffect, useRef } from 'react';

interface EQTabProps {
  /** Ref exposant setEQ(low, mid, high) depuis WaveSurferPlayer */
  playerRef?: React.MutableRefObject<any>;
}

const BANDS = [
  { key: 'low',  label: 'Bass',   icon: '🔈', color: 'blue',  freq: '250Hz',  min: -12, max: 12 },
  { key: 'mid',  label: 'Mid',    icon: '〰',  color: 'green', freq: '1kHz',   min: -12, max: 12 },
  { key: 'high', label: 'Treble', icon: '🔆', color: 'red',   freq: '4kHz',   min: -12, max: 12 },
] as const;

type BandKey = 'low' | 'mid' | 'high';

const PRESETS = [
  { name: 'Flat',        values: { low: 0,   mid: 0,   high: 0   } },
  { name: 'Bass Boost',  values: { low: 8,   mid: 0,   high: -2  } },
  { name: 'Vocal',       values: { low: -3,  mid: 6,   high: 2   } },
  { name: 'Treble Up',   values: { low: 0,   mid: 0,   high: 7   } },
  { name: 'Club',        values: { low: 4,   mid: -2,  high: 4   } },
  { name: 'Low Cut',     values: { low: -10, mid: 2,   high: 2   } },
];

export function EQTab({ playerRef }: EQTabProps) {
  const [values, setValues] = useState<Record<BandKey, number>>({ low: 0, mid: 0, high: 0 });
  const [isActive, setIsActive] = useState(false);
  const pendingRef = useRef<Record<BandKey, number>>({ low: 0, mid: 0, high: 0 });

  // Apply EQ changes to player
  const applyEQ = (newValues: Record<BandKey, number>, active: boolean) => {
    pendingRef.current = newValues;
    if (playerRef?.current?.setEQ) {
      const { low, mid, high } = newValues;
      playerRef.current.setEQ(active ? low : 0, active ? mid : 0, active ? high : 0);
    }
  };

  const handleChange = (band: BandKey, value: number) => {
    const newValues = { ...values, [band]: value };
    setValues(newValues);
    if (isActive) applyEQ(newValues, true);
  };

  const handlePreset = (preset: typeof PRESETS[0]) => {
    setValues(preset.values);
    setIsActive(true);
    applyEQ(preset.values, true);
  };

  const handleToggle = () => {
    const next = !isActive;
    setIsActive(next);
    applyEQ(values, next);
  };

  const handleReset = () => {
    const flat = { low: 0, mid: 0, high: 0 };
    setValues(flat);
    setIsActive(false);
    applyEQ(flat, false);
  };

  const colorMap: Record<string, string> = {
    blue: 'text-blue-400',
    green: 'text-green-400',
    red: 'text-red-400',
  };
  const trackMap: Record<string, string> = {
    blue: '#3b82f6',
    green: '#22c55e',
    red: '#ef4444',
  };

  return (
    <div className="space-y-4 p-4">

      {/* Toggle + status */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleToggle}
          className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer border-none ${
            isActive ? 'bg-blue-600' : 'bg-[var(--bg-elevated)]'
          }`}
        >
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
        <span className={`text-xs font-semibold ${isActive ? 'text-blue-400' : 'text-[var(--text-muted)]'}`}>
          EQ {isActive ? 'ON' : 'OFF'}
        </span>
        {!playerRef?.current?.setEQ && (
          <span className="text-[10px] text-yellow-500/70 ml-auto">Lance la lecture pour activer</span>
        )}
      </div>

      {/* Sliders */}
      <div className="flex items-end justify-around gap-2">
        {BANDS.map((band) => {
          const val = values[band.key];
          const pct = ((val + 12) / 24) * 100;
          return (
            <div key={band.key} className="flex flex-col items-center gap-2 flex-1">
              <div className={`text-lg font-bold font-mono ${colorMap[band.color]} tabular-nums text-center`} style={{minWidth:50}}>
                {val > 0 ? '+' : ''}{val}dB
              </div>
              <div className="relative flex flex-col items-center" style={{height: 120}}>
                <div className="absolute top-0 bottom-0 w-px bg-[var(--border-subtle)]" style={{left:'50%'}} />
                <div
                  className="absolute w-full h-px opacity-40"
                  style={{top:'50%', background: trackMap[band.color]}}
                />
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="1"
                  value={val}
                  onChange={(e) => handleChange(band.key, parseInt(e.target.value))}
                  className="h-[120px] w-6 appearance-none cursor-pointer"
                  style={{
                    writingMode: 'vertical-lr',
                    direction: 'rtl',
                    background: `linear-gradient(to bottom, transparent ${100-pct}%, ${trackMap[band.color]} ${100-pct}%, ${trackMap[band.color]} 100%)`,
                    WebkitAppearance: 'slider-vertical',
                  }}
                />
              </div>
              <div className="text-[10px] text-[var(--text-muted)] text-center font-mono">{band.freq}</div>
              <div className={`text-[11px] font-semibold ${colorMap[band.color]}`}>{band.icon} {band.label}</div>
            </div>
          );
        })}
      </div>

      {/* Presets */}
      <div>
        <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-2">Presets</div>
        <div className="grid grid-cols-3 gap-1">
          {PRESETS.map(preset => (
            <button
              key={preset.name}
              onClick={() => handlePreset(preset)}
              className="px-2 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-xs text-[var(--text-secondary)] transition-colors cursor-pointer"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Reset */}
      <button
        onClick={handleReset}
        className="w-full px-4 py-2 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs font-medium transition-colors border border-[var(--border-subtle)] cursor-pointer"
      >
        Réinitialiser (Flat)
      </button>
    </div>
  );
}
export default EQTab;
