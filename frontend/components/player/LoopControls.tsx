'use client';

import React, { useMemo, useCallback } from 'react';

/**
 * Props pour les contrôles de boucle
 */
interface LoopControlsProps {
  /** Temps de lecture courant (secondes) */
  currentTime: number;

  /** BPM du titre (optionnel, nécessaire pour les boutons "N bars") */
  bpm?: number;

  /** Point d'entrée de la boucle (null = non défini) */
  loopIn: number | null;

  /** Point de sortie de la boucle (null = non défini) */
  loopOut: number | null;

  /** La boucle est-elle active ? */
  loopActive: boolean;

  /** Callback : définie loopIn au currentTime */
  onSetIn: () => void;

  /** Callback : définie loopOut au currentTime */
  onSetOut: () => void;

  /** Callback : bascule l'état de la boucle (lock) */
  onToggleLock: () => void;

  /** Callback : vider la boucle */
  onClear: () => void;

  /**
   * Callback : définie une boucle basée sur le nombre de bars
   * Le calcul de loopOut est fait ICI : loopOut = loopIn + (bars * 4 * 60/bpm)
   * Le parent reçoit juste le nombre de bars pour logging/analytics
   */
  onSetBars: (bars: 4 | 8 | 16) => void;
}

/**
 * Formater un temps en mm:ss.ms
 * @param seconds - Secondes (nombre décimal)
 * @returns Chaîne "mm:ss.ms"
 */
function formatTime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

/**
 * Barre de contrôles pour les boucles de lecture
 *
 * Logique des boutons "N bars" :
 *  - Si loopIn est définie : loopOut = loopIn + (bars * 4 * 60 / bpm)
 *  - Si loopIn n'est pas définie : utiliser currentTime comme point de départ
 *  - Le calcul exact est du ressort du parent (onSetBars reçoit juste le nombre)
 *
 * Visuel :
 *  - Active si loopActive=true (bordure/accent)
 *  - Affiche les temps loopIn/Out en mm:ss.ms
 *  - Boutons discrets pour l'UX familière des DJ
 */
export const LoopControls: React.FC<LoopControlsProps> = ({
  currentTime,
  bpm,
  loopIn,
  loopOut,
  loopActive,
  onSetIn,
  onSetOut,
  onToggleLock,
  onClear,
  onSetBars,
}) => {
  // Calculer la durée de la boucle (si elle est complète)
  const loopDuration = useMemo(() => {
    if (loopIn === null || loopOut === null) return null;
    return loopOut - loopIn;
  }, [loopIn, loopOut]);

  // Callback pour les boutons de bars
  const handleSetBars = useCallback(
    (bars: 4 | 8 | 16) => {
      if (!bpm) return; // Pas de BPM, pas de calcul possible
      onSetBars(bars);
    },
    [bpm, onSetBars]
  );

  const canSetBars = loopIn !== null && bpm !== null && bpm !== undefined && bpm > 0;

  return (
    <div
      className={`rounded-lg p-4 ${
        loopActive ? 'border-2 border-cyan-500 bg-slate-800' : 'border border-slate-700 bg-slate-900'
      } transition-all`}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">Boucle</h3>
        <button
          onClick={onToggleLock}
          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
            loopActive
              ? 'bg-cyan-600 text-white hover:bg-cyan-500'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
          aria-label={loopActive ? 'Verrouiller boucle' : 'Activer boucle'}
        >
          {loopActive ? '🔒 Verrou' : '🔓 Verrouiller'}
        </button>
      </div>

      {/* Affichage des points IN/OUT */}
      <div className="mb-3 flex gap-2 text-xs">
        <div className="flex-1 rounded bg-slate-700 px-3 py-2">
          <div className="text-slate-400">IN</div>
          <div className="font-mono font-semibold text-cyan-400">{formatTime(loopIn)}</div>
        </div>
        <div className="flex-1 rounded bg-slate-700 px-3 py-2">
          <div className="text-slate-400">OUT</div>
          <div className="font-mono font-semibold text-cyan-400">{formatTime(loopOut)}</div>
        </div>
        {loopDuration !== null && (
          <div className="flex-1 rounded bg-slate-700 px-3 py-2">
            <div className="text-slate-400">Durée</div>
            <div className="font-mono font-semibold text-amber-400">
              {formatTime(loopDuration)}
            </div>
          </div>
        )}
      </div>

      {/* Boutons Set IN / Set OUT */}
      <div className="mb-3 flex gap-2">
        <button
          onClick={onSetIn}
          className="flex-1 rounded bg-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-600"
          aria-label="Définir point IN à la position actuelle"
        >
          Set IN
        </button>
        <button
          onClick={onSetOut}
          className="flex-1 rounded bg-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-600"
          aria-label="Définir point OUT à la position actuelle"
        >
          Set OUT
        </button>
      </div>

      {/* Boutons prédéfinis : 4/8/16 bars */}
      {canSetBars && (
        <div className="mb-3 flex gap-2">
          <button
            onClick={() => handleSetBars(4)}
            disabled={!canSetBars}
            className="flex-1 rounded bg-amber-700 px-3 py-2 text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Boucle de 4 bars"
          >
            4 bars
          </button>
          <button
            onClick={() => handleSetBars(8)}
            disabled={!canSetBars}
            className="flex-1 rounded bg-amber-700 px-3 py-2 text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Boucle de 8 bars"
          >
            8 bars
          </button>
          <button
            onClick={() => handleSetBars(16)}
            disabled={!canSetBars}
            className="flex-1 rounded bg-amber-700 px-3 py-2 text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Boucle de 16 bars"
          >
            16 bars
          </button>
        </div>
      )}

      {/* Bouton Clear */}
      <button
        onClick={onClear}
        disabled={loopIn === null && loopOut === null}
        className="w-full rounded bg-red-800 px-3 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Effacer la boucle"
      >
        Effacer boucle
      </button>

      {/* Aide */}
      {!canSetBars && bpm === undefined && (
        <div className="mt-3 text-xs text-slate-400">
          💡 Fournissez le BPM au composant pour activer les boutons de bars
        </div>
      )}
    </div>
  );
};

export default LoopControls;
