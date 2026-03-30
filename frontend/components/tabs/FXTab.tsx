'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';

interface FXTabProps {
  fxParams?: Record<string, number>;
  onFxChange?: (effect: string, value: number) => void;
  onResetAll?: () => void;
}

export function FXTab({
  fxParams = {},
  onFxChange,
  onResetAll,
}: FXTabProps) {
  const [values, setValues] = useState(fxParams);

  const handleChange = (effect: string, value: number) => {
    const newValues = { ...values, [effect]: value };
    setValues(newValues);
    onFxChange?.(effect, value);
  };

  const effects = [
    { name: 'Reverb', key: 'reverb', color: 'blue' },
    { name: 'Delay', key: 'delay', color: 'cyan' },
    { name: 'Filter LP', key: 'filter_lp', color: 'green' },
    { name: 'Filter HP', key: 'filter_hp', color: 'purple' },
    { name: 'Flanger', key: 'flanger', color: 'pink' },
    { name: 'Phaser', key: 'phaser', color: 'yellow' },
    { name: 'Distortion', key: 'distortion', color: 'red' },
    { name: 'Compressor', key: 'compressor', color: 'orange' },
  ];

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-4">
        {effects.map((effect) => {
          const value = values[effect.key] || 0;

          return (
            <div
              key={effect.key}
              className="p-3 rounded-lg bg-gray-900 border border-gray-800"
            >
              <div className="text-xs font-medium text-gray-300 mb-2">{effect.name}</div>
              <input
                type="range"
                min="0"
                max="100"
                value={value}
                onChange={(e) => handleChange(effect.key, parseInt(e.target.value))}
                className="w-full"
              />
              <div className={`text-xs font-mono text-${effect.color}-400 mt-2 text-right`}>
                {Math.round(value)}%
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => {
          const reset = effects.reduce((acc, e) => ({ ...acc, [e.key]: 0 }), {});
          setValues(reset);
          onResetAll?.();
        }}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors"
      >
        <RotateCcw className="w-4 h-4" />
        Réinitialiser tous les FX
      </button>
    </div>
  );
}
