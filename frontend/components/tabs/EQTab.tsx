'use client';

import { useState } from 'react';

interface EQValues {
  low: number;
  mid: number;
  high: number;
}

interface EQTabProps {
  eqValues?: EQValues;
  onEqChange?: (band: string, value: number) => void;
  onReset?: () => void;
}

export function EQTab({
  eqValues = { low: 0, mid: 0, high: 0 },
  onEqChange,
  onReset,
}: EQTabProps) {
  const [values, setValues] = useState(eqValues);

  const handleChange = (band: 'low' | 'mid' | 'high', value: number) => {
    const newValues = { ...values, [band]: value };
    setValues(newValues);
    onEqChange?.(band, value);
  };

  const bands = [
    { name: 'Low', key: 'low', color: 'blue', label: 'Bass' },
    { name: 'Mid', key: 'mid', color: 'green', label: 'Midrange' },
    { name: 'High', key: 'high', color: 'red', label: 'Treble' },
  ];

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between gap-4">
        {bands.map((band) => (
          <div key={band.key} className="flex flex-col items-center gap-3 flex-1">
            {/* Slider */}
            <div className="w-full flex flex-col items-center gap-2">
              <input
                type="range"
                min="-12"
                max="12"
                value={values[band.key as keyof EQValues]}
                onChange={(e) => handleChange(band.key as 'low' | 'mid' | 'high', parseInt(e.target.value))}
                className="w-8 h-32 appearance-none bg-transparent cursor-pointer"
                style={{
                  writingMode: 'bt-lr',
                  WebkitAppearance: 'slider-vertical',
                }}
              />
            </div>

            {/* Value Display */}
            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">{band.label}</div>
              <div className={`text-xl font-bold font-mono text-${band.color}-400`}>
                {values[band.key as keyof EQValues] > 0 ? '+' : ''}{values[band.key as keyof EQValues]}dB
              </div>
            </div>

            {/* Center Indicator */}
            {values[band.key as keyof EQValues] === 0 && (
              <div className="w-1 h-1 rounded-full bg-gray-600" />
            )}
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-gray-800">
        <button
          onClick={() => {
            setValues({ low: 0, mid: 0, high: 0 });
            onReset?.();
          }}
          className="w-full px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors"
        >
          Réinitialiser
        </button>
      </div>
    </div>
  );
}
