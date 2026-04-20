'use client';

import React, { useState, useCallback } from 'react';
import { transposeCamelot, isValidCamelot } from '@/lib/audio/camelot';

/**
 * Props pour le contrôle de pitch
 */
interface PitchControlProps {
  /** Clé Camelot initiale (optionnelle), ex: "8A" */
  initialKey?: string;

  /** Callback appelé quand le pitch change (valeur en semitons) */
  onChange: (semitones: number) => void;

  /** Désactiver le contrôle */
  disabled?: boolean;
}

/**
 * Composant UI pour transposer le pitch (±6 semitons)
 * Affiche :
 *  - Slider discret -6 à +6
 *  - Display textuel "+3 st"
 *  - Clé Camelot transposée si initialKey fournie
 *  - Boutons -/+ et Reset
 *
 * Intégration : Parent doit connecter onChange → PitchShifterNode.setPitchSemitones()
 */
export const PitchControl: React.FC<PitchControlProps> = ({
  initialKey,
  onChange,
  disabled = false,
}) => {
  const [semitones, setSemitones] = useState(0);

  // Calculer la clé Camelot transposée si applicable
  const transposedKey =
    initialKey && isValidCamelot(initialKey)
      ? transposeCamelot(initialKey, semitones)
      : null;

  // Gérer le changement de slider
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value, 10);
      setSemitones(value);
      onChange(value);
    },
    [onChange]
  );

  // Boutons -/+
  const handleDecrement = useCallback(() => {
    const newValue = Math.max(-6, semitones - 1);
    setSemitones(newValue);
    onChange(newValue);
  }, [semitones, onChange]);

  const handleIncrement = useCallback(() => {
    const newValue = Math.min(6, semitones + 1);
    setSemitones(newValue);
    onChange(newValue);
  }, [semitones, onChange]);

  // Reset
  const handleReset = useCallback(() => {
    setSemitones(0);
    onChange(0);
  }, [onChange]);

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg bg-slate-900 p-4 text-slate-100 ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      {/* Header avec titre et valeur en semitons */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold">Pitch</label>
        <div className="text-sm font-mono">
          {semitones > 0 ? '+' : ''}
          {semitones} st
        </div>
      </div>

      {/* Affichage clé Camelot transposée si applicable */}
      {transposedKey && (
        <div className="flex items-center gap-2 rounded bg-slate-800 px-3 py-2 text-xs">
          <span className="text-slate-400">
            {initialKey} →
          </span>
          <span className="font-semibold text-amber-400">{transposedKey}</span>
        </div>
      )}

      {/* Slider discret */}
      <input
        type="range"
        min="-6"
        max="6"
        step="1"
        value={semitones}
        onChange={handleSliderChange}
        disabled={disabled}
        className="w-full cursor-pointer accent-amber-500"
        aria-label="Pitch en semitons"
      />

      {/* Boutons -/+ et Reset */}
      <div className="flex gap-2">
        <button
          onClick={handleDecrement}
          disabled={disabled || semitones <= -6}
          className="flex-1 rounded bg-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Diminuer pitch"
        >
          −
        </button>
        <button
          onClick={handleReset}
          disabled={disabled || semitones === 0}
          className="flex-1 rounded bg-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Réinitialiser pitch"
        >
          Reset
        </button>
        <button
          onClick={handleIncrement}
          disabled={disabled || semitones >= 6}
          className="flex-1 rounded bg-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Augmenter pitch"
        >
          +
        </button>
      </div>

      {/* Notes d'aide */}
      <div className="text-xs text-slate-400">
        Plage : -6 à +6 semitons (une octave = 12 semitons)
      </div>
    </div>
  );
};

export default PitchControl;
