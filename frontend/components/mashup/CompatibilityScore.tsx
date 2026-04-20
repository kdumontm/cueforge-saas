'use client';

import React, { useState } from 'react';
import { CompatibilityScore } from '@/lib/api/mashup';

interface Props {
  /** Score de compatibilité à afficher */
  score: CompatibilityScore;
  /** Taille du composant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Affiche un score de compatibilité entre deux pistes.
 *
 * Rendu :
 * - Jauge circulaire avec couleur adaptée (vert ≥ 75%, orange 50-75%, rouge < 50%)
 * - Détails (harmonic/bpm_delta/energy_delta) au survol ou au tap
 * - Raisons de compatibilité en chips
 *
 * @component
 */
export default function CompatibilityScoreComponent({ score, size = 'md' }: Props) {
  const [showDetails, setShowDetails] = useState(false);

  // Dimension et taille police selon size
  const sizeConfig = {
    sm: { radius: 32, textSize: 'text-sm', detailSize: 'text-xs' },
    md: { radius: 48, textSize: 'text-base', detailSize: 'text-sm' },
    lg: { radius: 64, textSize: 'text-lg', detailSize: 'text-base' },
  }[size];

  const overall = Math.round(score.overall * 100);

  // Couleur en fonction du score
  let color = '#ef4444'; // rouge < 50%
  let bgColor = 'bg-red-50';
  let textColor = 'text-red-700';

  if (score.overall >= 0.75) {
    color = '#22c55e'; // vert ≥ 75%
    bgColor = 'bg-green-50';
    textColor = 'text-green-700';
  } else if (score.overall >= 0.5) {
    color = '#f59e0b'; // orange 50-75%
    bgColor = 'bg-amber-50';
    textColor = 'text-amber-700';
  }

  // SVG cercle de progress
  const circumference = 2 * Math.PI * (sizeConfig.radius - 12);
  const offset = circumference * (1 - score.overall);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Jauge circulaire */}
      <div
        className={`relative cursor-pointer transition-transform hover:scale-105 ${bgColor} rounded-full p-1`}
        onMouseEnter={() => setShowDetails(true)}
        onMouseLeave={() => setShowDetails(false)}
        onClick={() => setShowDetails(!showDetails)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setShowDetails(!showDetails);
        }}
        aria-label={`Compatibilité ${overall}%`}
      >
        <svg
          width={sizeConfig.radius * 2 + 4}
          height={sizeConfig.radius * 2 + 4}
          viewBox={`0 0 ${sizeConfig.radius * 2 + 4} ${sizeConfig.radius * 2 + 4}`}
          className="rotate-[-90deg]"
        >
          {/* Cercle de fond */}
          <circle
            cx={sizeConfig.radius + 2}
            cy={sizeConfig.radius + 2}
            r={sizeConfig.radius - 12}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="4"
          />
          {/* Cercle de progres */}
          <circle
            cx={sizeConfig.radius + 2}
            cy={sizeConfig.radius + 2}
            r={sizeConfig.radius - 12}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>

        {/* Score au centre */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`text-center ${sizeConfig.textSize} font-bold ${textColor}`}>
            {overall}%
          </div>
        </div>
      </div>

      {/* Détails au survol / tap (harmonic, bpm_delta, energy_delta) */}
      {showDetails && (
        <div className={`bg-gray-100 rounded-lg p-3 w-full max-w-xs ${sizeConfig.detailSize}`}>
          <div className="space-y-1 text-gray-700">
            <div className="flex justify-between">
              <span>Harmonique:</span>
              <span className="font-semibold">{Math.round(score.harmonic * 100)}%</span>
            </div>
            <div className="flex justify-between">
              <span>ΔBpm:</span>
              <span className="font-semibold">{Math.round(score.bpm_delta * 100)}%</span>
            </div>
            <div className="flex justify-between">
              <span>ΔÉnergie:</span>
              <span className="font-semibold">{score.energy_delta.toFixed(1)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Raisons en chips */}
      {score.reasons && score.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-center">
          {score.reasons.map((reason, idx) => (
            <span
              key={idx}
              className="inline-block bg-blue-100 text-blue-800 rounded-full px-2 py-1 text-xs font-medium"
            >
              {reason}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
