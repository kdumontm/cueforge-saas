// @ts-nocheck
'use client';

import { useMemo, useState } from 'react';
import { Activity, TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';
import type { Track } from '@/types';

interface EnergyFlowProps {
  tracks: Track[];
  title?: string;
}

const ENERGY_LABELS = [
  { min: 0, max: 0.2, label: 'Ambient', color: '#6366f1', emoji: '🌙' },
  { min: 0.2, max: 0.4, label: 'Chill', color: '#3b82f6', emoji: '🌊' },
  { min: 0.4, max: 0.6, label: 'Warm', color: '#22c55e', emoji: '☀️' },
  { min: 0.6, max: 0.8, label: 'Hot', color: '#f59e0b', emoji: '🔥' },
  { min: 0.8, max: 1.0, label: 'Peak', color: '#ef4444', emoji: '⚡' },
];

function getEnergyLabel(energy: number) {
  return ENERGY_LABELS.find(l => energy >= l.min && energy < l.max) || ENERGY_LABELS[ENERGY_LABELS.length - 1];
}

function getEnergyColor(energy: number): string {
  return getEnergyLabel(energy).color;
}

export default function EnergyFlow({ tracks, title = 'Energy Flow' }: EnergyFlowProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const analyzedTracks = useMemo(() =>
    tracks.filter(t => t.analysis?.energy !== undefined && t.analysis?.energy !== null),
    [tracks]
  );

  if (analyzedTracks.length === 0) {
    return (
      <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-amber-400" />
          <span className="text-sm font-bold text-[var(--text-primary)]">{title}</span>
        </div>
        <p className="text-[13px] text-[var(--text-muted)] text-center py-6">
          Pas assez de tracks analysés pour afficher le flux d'énergie.
        </p>
      </div>
    );
  }

  const energies = analyzedTracks.map(t => t.analysis!.energy!);
  const maxEnergy = Math.max(...energies);
  const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;

  // Calculate energy transitions
  const transitions = energies.slice(1).map((e, i) => ({
    from: energies[i],
    to: e,
    diff: e - energies[i],
    type: e > energies[i] + 0.05 ? 'up' : e < energies[i] - 0.05 ? 'down' : 'stable',
  }));

  const biggestDrop = transitions.reduce((max, t) => t.diff < max.diff ? t : max, { diff: 0, from: 0, to: 0, type: 'stable' });
  const biggestBuild = transitions.reduce((max, t) => t.diff > max.diff ? t : max, { diff: 0, from: 0, to: 0, type: 'stable' });

  // SVG chart dimensions
  const chartW = 600;
  const chartH = 120;
  const padding = 20;
  const barW = Math.min(40, (chartW - padding * 2) / analyzedTracks.length - 2);

  return (
    <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={16} className="text-amber-400" />
        <span className="text-sm font-bold text-[var(--text-primary)]">{title}</span>
        <span className="text-[11px] text-[var(--text-muted)] ml-auto">{analyzedTracks.length} tracks</span>
      </div>

      {/* Energy bar visualization */}
      <div className="relative overflow-x-auto">
        <svg width={Math.max(chartW, analyzedTracks.length * (barW + 4) + padding * 2)} height={chartH + 40} className="w-full">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(level => (
            <g key={level}>
              <line
                x1={padding}
                y1={padding + (1 - level) * chartH}
                x2={Math.max(chartW, analyzedTracks.length * (barW + 4) + padding * 2) - padding}
                y2={padding + (1 - level) * chartH}
                stroke="var(--border-subtle)"
                strokeWidth={0.5}
                strokeDasharray="4 4"
              />
              <text
                x={padding - 4}
                y={padding + (1 - level) * chartH + 3}
                textAnchor="end"
                fontSize={9}
                fill="var(--text-muted)"
              >
                {Math.round(level * 100)}
              </text>
            </g>
          ))}

          {/* Energy bars */}
          {analyzedTracks.map((track, i) => {
            const energy = track.analysis!.energy!;
            const barH = Math.max(4, energy * chartH);
            const x = padding + i * (barW + 4);
            const y = padding + chartH - barH;
            const color = getEnergyColor(energy);
            const isHovered = hoveredIdx === i;

            return (
              <g
                key={track.id}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={3}
                  fill={color}
                  opacity={isHovered ? 1 : 0.75}
                  style={{ transition: 'opacity 0.15s' }}
                />
                {/* Glow on hover */}
                {isHovered && (
                  <rect
                    x={x - 1}
                    y={y - 1}
                    width={barW + 2}
                    height={barH + 2}
                    rx={4}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.5}
                    opacity={0.6}
                  />
                )}
                {/* Track number */}
                <text
                  x={x + barW / 2}
                  y={padding + chartH + 12}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--text-muted)"
                >
                  {i + 1}
                </text>
              </g>
            );
          })}

          {/* Flow line connecting tops */}
          {analyzedTracks.length > 1 && (
            <polyline
              points={analyzedTracks.map((track, i) => {
                const energy = track.analysis!.energy!;
                const x = padding + i * (barW + 4) + barW / 2;
                const y = padding + chartH - energy * chartH;
                return `${x},${y}`;
              }).join(' ')}
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          )}
        </svg>
      </div>

      {/* Hovered track info */}
      {hoveredIdx !== null && analyzedTracks[hoveredIdx] && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center gap-3">
          <span className="text-sm">{getEnergyLabel(analyzedTracks[hoveredIdx].analysis!.energy!).emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">
              {analyzedTracks[hoveredIdx].title || analyzedTracks[hoveredIdx].original_filename}
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">
              {analyzedTracks[hoveredIdx].artist || 'Inconnu'} · {Math.round(analyzedTracks[hoveredIdx].analysis!.energy! * 100)}% energy
              {analyzedTracks[hoveredIdx].analysis?.bpm && ` · ${Math.round(analyzedTracks[hoveredIdx].analysis!.bpm!)} BPM`}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] text-center">
          <div className="text-[11px] text-[var(--text-muted)]">Énergie moy.</div>
          <div className="text-sm font-bold" style={{ color: getEnergyColor(avgEnergy) }}>
            {Math.round(avgEnergy * 100)}%
          </div>
        </div>
        <div className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] text-center">
          <div className="text-[11px] text-[var(--text-muted)] flex items-center justify-center gap-1">
            <TrendingUp size={10} className="text-emerald-400" /> Build max
          </div>
          <div className="text-sm font-bold text-emerald-400">
            +{Math.round(Math.max(0, biggestBuild.diff) * 100)}%
          </div>
        </div>
        <div className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] text-center">
          <div className="text-[11px] text-[var(--text-muted)] flex items-center justify-center gap-1">
            <TrendingDown size={10} className="text-red-400" /> Drop max
          </div>
          <div className="text-sm font-bold text-red-400">
            {Math.round(Math.min(0, biggestDrop.diff) * 100)}%
          </div>
        </div>
      </div>

      {/* Energy journey legend */}
      <div className="flex items-center gap-1 mt-3 justify-center">
        {ENERGY_LABELS.map(l => (
          <div key={l.label} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[var(--text-muted)]">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}
