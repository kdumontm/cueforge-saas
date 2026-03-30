// @ts-nocheck
'use client';

import { useState, useMemo } from 'react';
import { Disc3 } from 'lucide-react';
import type { Track } from '@/types';

// Camelot wheel positions (12 positions × 2 modes = 24 keys)
const CAMELOT_KEYS = [
  { num: 1, minor: 'G#m/Abm', major: 'B', minorKey: '1A', majorKey: '1B', angle: 0 },
  { num: 2, minor: 'D#m/Ebm', major: 'F#/Gb', minorKey: '2A', majorKey: '2B', angle: 30 },
  { num: 3, minor: 'A#m/Bbm', major: 'C#/Db', minorKey: '3A', majorKey: '3B', angle: 60 },
  { num: 4, minor: 'Fm', major: 'G#/Ab', minorKey: '4A', majorKey: '4B', angle: 90 },
  { num: 5, minor: 'Cm', major: 'D#/Eb', minorKey: '5A', majorKey: '5B', angle: 120 },
  { num: 6, minor: 'Gm', major: 'A#/Bb', minorKey: '6A', majorKey: '6B', angle: 150 },
  { num: 7, minor: 'Dm', major: 'F', minorKey: '7A', majorKey: '7B', angle: 180 },
  { num: 8, minor: 'Am', major: 'C', minorKey: '8A', majorKey: '8B', angle: 210 },
  { num: 9, minor: 'Em', major: 'G', minorKey: '9A', majorKey: '9B', angle: 240 },
  { num: 10, minor: 'Bm', major: 'D', minorKey: '10A', majorKey: '10B', angle: 270 },
  { num: 11, minor: 'F#m', major: 'A', minorKey: '11A', majorKey: '11B', angle: 300 },
  { num: 12, minor: 'C#m/Dbm', major: 'E', minorKey: '12A', majorKey: '12B', angle: 330 },
];

const CAMELOT_CONVERT: Record<string, string> = {
  'C': '8B', 'Am': '8A', 'G': '9B', 'Em': '9A', 'D': '10B', 'Bm': '10A',
  'A': '11B', 'F#m': '11A', 'E': '12B', 'C#m': '12A', 'B': '1B', 'G#m': '1A',
  'F#': '2B', 'Ebm': '2A', 'Db': '3B', 'Bbm': '3A', 'Ab': '4B', 'Fm': '4A',
  'Eb': '5B', 'Cm': '5A', 'Bb': '6B', 'Gm': '6A', 'F': '7B', 'Dm': '7A',
  'Abm': '1A', 'D#m': '2A', 'A#m': '3A', 'C#': '3B', 'G#': '4B', 'D#': '5B',
  'A#': '6B', 'Gb': '2B',
};

function toCamelot(key: string | null | undefined): string | null {
  if (!key) return null;
  return CAMELOT_CONVERT[key] || key;
}

function getCompatibleKeys(camelotKey: string): Set<string> {
  const match = camelotKey.match(/^(\d+)([AB])$/);
  if (!match) return new Set();
  const num = parseInt(match[1]);
  const mode = match[2];

  const compatible = new Set<string>();
  compatible.add(camelotKey); // Same key
  compatible.add(`${num}${mode === 'A' ? 'B' : 'A'}`); // Relative major/minor
  compatible.add(`${((num % 12) + 1)}${mode}`); // +1 step
  compatible.add(`${((num - 2 + 12) % 12 + 1)}${mode}`); // -1 step
  return compatible;
}

// Colors for the wheel
const WHEEL_COLORS = [
  '#e11d48', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
];

interface HarmonicWheelProps {
  tracks?: Track[];
  selectedKey?: string | null;
  onSelectKey?: (camelotKey: string) => void;
}

export default function HarmonicWheel({ tracks = [], selectedKey, onSelectKey }: HarmonicWheelProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // Count tracks per key
  const keyCount = useMemo(() => {
    const counts: Record<string, number> = {};
    tracks.forEach(t => {
      const cam = toCamelot(t.analysis?.key);
      if (cam) counts[cam] = (counts[cam] || 0) + 1;
    });
    return counts;
  }, [tracks]);

  const activeKey = hoveredKey || selectedKey || null;
  const compatibleKeys = activeKey ? getCompatibleKeys(activeKey) : new Set<string>();

  const cx = 200;
  const cy = 200;
  const outerR = 170;
  const midR = 120;
  const innerR = 70;

  function polarToXY(angle: number, radius: number): [number, number] {
    const rad = (angle - 90) * (Math.PI / 180);
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  }

  function createArcPath(startAngle: number, endAngle: number, r1: number, r2: number): string {
    const [x1, y1] = polarToXY(startAngle, r1);
    const [x2, y2] = polarToXY(endAngle, r1);
    const [x3, y3] = polarToXY(endAngle, r2);
    const [x4, y4] = polarToXY(startAngle, r2);
    return `M ${x1} ${y1} A ${r1} ${r1} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${r2} ${r2} 0 0 0 ${x4} ${y4} Z`;
  }

  return (
    <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Disc3 size={16} className="text-purple-400" />
        <span className="text-sm font-bold text-[var(--text-primary)]">Roue de Camelot</span>
        {activeKey && (
          <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-mono font-bold">
            {activeKey}
          </span>
        )}
      </div>

      <div className="flex justify-center">
        <svg width={400} height={400} viewBox="0 0 400 400" className="max-w-full">
          {/* Background circle */}
          <circle cx={cx} cy={cy} r={outerR + 5} fill="var(--bg-elevated)" stroke="var(--border-subtle)" strokeWidth={1} />

          {CAMELOT_KEYS.map((key, i) => {
            const startAngle = key.angle - 15;
            const endAngle = key.angle + 15;
            const color = WHEEL_COLORS[i];
            const minorCam = key.minorKey;
            const majorCam = key.majorKey;
            const minorCount = keyCount[minorCam] || 0;
            const majorCount = keyCount[majorCam] || 0;
            const minorCompatible = compatibleKeys.has(minorCam);
            const majorCompatible = compatibleKeys.has(majorCam);
            const minorActive = activeKey === minorCam;
            const majorActive = activeKey === majorCam;

            // Label positions
            const [minorLx, minorLy] = polarToXY(key.angle, (innerR + midR) / 2);
            const [majorLx, majorLy] = polarToXY(key.angle, (midR + outerR) / 2);

            return (
              <g key={key.num}>
                {/* Minor (inner ring) */}
                <path
                  d={createArcPath(startAngle, endAngle, midR, innerR)}
                  fill={minorActive ? color : minorCompatible ? color + '60' : color + '20'}
                  stroke={minorActive ? '#fff' : 'var(--border-subtle)'}
                  strokeWidth={minorActive ? 2 : 0.5}
                  onMouseEnter={() => setHoveredKey(minorCam)}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => onSelectKey?.(minorCam)}
                  style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                />
                {/* Major (outer ring) */}
                <path
                  d={createArcPath(startAngle, endAngle, outerR, midR)}
                  fill={majorActive ? color : majorCompatible ? color + '60' : color + '30'}
                  stroke={majorActive ? '#fff' : 'var(--border-subtle)'}
                  strokeWidth={majorActive ? 2 : 0.5}
                  onMouseEnter={() => setHoveredKey(majorCam)}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => onSelectKey?.(majorCam)}
                  style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                />
                {/* Minor label */}
                <text
                  x={minorLx} y={minorLy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={11}
                  fontWeight={minorActive ? 700 : 500}
                  fontFamily="monospace"
                  fill={minorActive || minorCompatible ? '#fff' : 'var(--text-muted)'}
                  style={{ pointerEvents: 'none' }}
                >
                  {minorCam}
                </text>
                {/* Major label */}
                <text
                  x={majorLx} y={majorLy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={11}
                  fontWeight={majorActive ? 700 : 500}
                  fontFamily="monospace"
                  fill={majorActive || majorCompatible ? '#fff' : 'var(--text-secondary)'}
                  style={{ pointerEvents: 'none' }}
                >
                  {majorCam}
                </text>
                {/* Track count badges */}
                {minorCount > 0 && (
                  <g>
                    <circle cx={minorLx + 12} cy={minorLy - 8} r={7} fill={color} opacity={0.9} />
                    <text x={minorLx + 12} y={minorLy - 7} textAnchor="middle" dominantBaseline="middle" fontSize={8} fontWeight={700} fill="#fff" style={{ pointerEvents: 'none' }}>
                      {minorCount}
                    </text>
                  </g>
                )}
                {majorCount > 0 && (
                  <g>
                    <circle cx={majorLx + 12} cy={majorLy - 8} r={7} fill={color} opacity={0.9} />
                    <text x={majorLx + 12} y={majorLy - 7} textAnchor="middle" dominantBaseline="middle" fontSize={8} fontWeight={700} fill="#fff" style={{ pointerEvents: 'none' }}>
                      {majorCount}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Center label */}
          <circle cx={cx} cy={cy} r={innerR - 5} fill="var(--bg-card)" stroke="var(--border-subtle)" strokeWidth={1} />
          <text x={cx} y={cy - 8} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--text-primary)">
            CAMELOT
          </text>
          <text x={cx} y={cy + 8} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
            Intérieur: mineur
          </text>
          <text x={cx} y={cy + 20} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
            Extérieur: majeur
          </text>
        </svg>
      </div>

      {/* Compatible keys info */}
      {activeKey && (
        <div className="mt-3 px-3 py-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
          <div className="text-[11px] text-[var(--text-muted)] mb-1">Tonalités compatibles avec {activeKey} :</div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from(compatibleKeys).filter(k => k !== activeKey).map(k => (
              <span key={k} className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-purple-500/20 text-purple-300">
                {k}
              </span>
            ))}
          </div>
          {keyCount[activeKey] > 0 && (
            <div className="text-[11px] text-[var(--text-muted)] mt-1.5">
              {keyCount[activeKey]} track{keyCount[activeKey] > 1 ? 's' : ''} dans ta bibliothèque
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-[var(--text-muted)]">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-purple-500/60" /> Compatible
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-purple-500 border border-white" /> Sélectionné
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded-full bg-blue-500 text-[8px] text-white flex items-center justify-center font-bold">3</span> Nb de tracks
        </span>
      </div>
    </div>
  );
}
