'use client';

import React, { useState, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { useLang } from '@/components/LangProvider';
import { tr } from '@/lib/i18n';

interface FXTabProps {
  track?: { id: number; title: string } | null;
  fxParams?: Record<string, number>;
  onFxChange?: (effect: string, value: number) => void;
  onResetAll?: () => void;
}

const EFFECTS = [
  { name: 'Reverb',     key: 'reverb',     icon: '🔊', color: '#3b82f6', desc: 'Espace / Réverbération' },
  { name: 'Delay',      key: 'delay',      icon: '🔁', color: '#06b6d4', desc: 'Écho / Delay' },
  { name: 'Filter LP',  key: 'filter_lp',  icon: '🔽', color: '#22c55e', desc: 'Filtre passe-bas' },
  { name: 'Filter HP',  key: 'filter_hp',  icon: '🔼', color: '#a855f7', desc: 'Filtre passe-haut' },
  { name: 'Flanger',    key: 'flanger',    icon: '🌊', color: '#ec4899', desc: 'Flanger / Modulation' },
  { name: 'Phaser',     key: 'phaser',     icon: '🌀', color: '#eab308', desc: 'Phaser' },
  { name: 'Distortion', key: 'distortion', icon: '⚡', color: '#ef4444', desc: 'Saturation / Distorsion' },
  { name: 'Compressor', key: 'compressor', icon: '📊', color: '#f97316', desc: 'Compresseur dynamique' },
];

export function FXTab({ track, fxParams = {}, onFxChange, onResetAll }: FXTabProps) {
  const { lang } = useLang();
  const [values, setValues] = useState<Record<string, number>>(fxParams);

  // Sync with external state
  useEffect(() => {
    setValues(fxParams);
  }, [fxParams]);

  const handleChange = (effect: string, value: number) => {
    const newValues = { ...values, [effect]: value };
    setValues(newValues);
    onFxChange?.(effect, value);
  };

  const hasActive = Object.values(values).some(v => v > 0);

  if (!track) {
    return (
      <div className="flex items-center justify-center h-48 text-[var(--text-muted)] text-sm">
        Sélectionne un morceau pour appliquer les effets
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-2 gap-2.5">
        {EFFECTS.map((effect) => {
          const value = values[effect.key] || 0;
          const isActive = value > 0;

          return (
            <div
              key={effect.key}
              className="p-2.5 rounded-lg transition-all"
              style={{
                background: isActive
                  ? `linear-gradient(135deg, ${effect.color}15, ${effect.color}08)`
                  : 'var(--bg-elevated)',
                border: `1px solid ${isActive ? effect.color + '40' : 'var(--border-subtle)'}`,
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{effect.icon}</span>
                  <span className="text-[11px] font-semibold text-[var(--text-primary)]">{effect.name}</span>
                </div>
                <span
                  className="text-[10px] font-mono font-bold tabular-nums"
                  style={{ color: isActive ? effect.color : 'var(--text-muted)' }}
                >
                  {Math.round(value)}%
                </span>
              </div>

              {/* Custom styled range slider */}
              <div className="relative">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={value}
                  onChange={(e) => handleChange(effect.key, parseInt(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${effect.color} ${value}%, rgba(255,255,255,0.08) ${value}%)`,
                    accentColor: effect.color,
                  }}
                />
              </div>

              <div className="text-[9px] text-[var(--text-muted)] mt-1">{effect.desc}</div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => {
          const reset = EFFECTS.reduce((acc, e) => ({ ...acc, [e.key]: 0 }), {});
          setValues(reset);
          onResetAll?.();
        }}
        className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
          hasActive
            ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25'
            : 'bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
        }`}
      >
        <RotateCcw className="w-3.5 h-3.5" />
        {tr('fx.reset_all', lang)}
      </button>
    </div>
  );
}
export default React.memo(FXTab);
