/**
 * Optimized Camelot wheel (points 621-640)
 * SVG-based, interactive, energy matching visualization, BPM range viz
 * Memoized for efficient re-renders
 */

import React, { useMemo, useCallback, useState } from 'react';

interface CamelotWheelProps {
  currentKey?: string | null; // e.g., "1A", "12B"
  currentBpm?: number | null;
  matchingKeys?: string[]; // Keys that match (±1 semitone)
  bpmRange?: { min: number; max: number };
  energy?: 'low' | 'medium' | 'high';
  onKeySelect?: (key: string) => void;
  interactive?: boolean;
}

const CAMELOT_KEYS = [
  { num: 1, key: 'A', angle: 0, camelotId: '8B' },
  { num: 2, key: 'A', angle: 30, camelotId: '3B' },
  { num: 3, key: 'A', angle: 60, camelotId: '10B' },
  { num: 4, key: 'A', angle: 90, camelotId: '5B' },
  { num: 5, key: 'A', angle: 120, camelotId: '12B' },
  { num: 6, key: 'A', angle: 150, camelotId: '7B' },
  { num: 7, key: 'A', angle: 180, camelotId: '2B' },
  { num: 8, key: 'A', angle: 210, camelotId: '9B' },
  { num: 9, key: 'A', angle: 240, camelotId: '4B' },
  { num: 10, key: 'A', angle: 270, camelotId: '11B' },
  { num: 11, key: 'A', angle: 300, camelotId: '6B' },
  { num: 12, key: 'A', angle: 330, camelotId: '1B' },

  { num: 1, key: 'B', angle: 15, camelotId: '5A' },
  { num: 2, key: 'B', angle: 45, camelotId: '12A' },
  { num: 3, key: 'B', angle: 75, camelotId: '7A' },
  { num: 4, key: 'B', angle: 105, camelotId: '2A' },
  { num: 5, key: 'B', angle: 135, camelotId: '9A' },
  { num: 6, key: 'B', angle: 165, camelotId: '4A' },
  { num: 7, key: 'B', angle: 195, camelotId: '11A' },
  { num: 8, key: 'B', angle: 225, camelotId: '6A' },
  { num: 9, key: 'B', angle: 255, camelotId: '1A' },
  { num: 10, key: 'B', angle: 285, camelotId: '8A' },
  { num: 11, key: 'B', angle: 315, camelotId: '3A' },
  { num: 12, key: 'B', angle: 345, camelotId: '10A' },
];

function getEnergyColor(energy: string | undefined): string {
  switch (energy) {
    case 'low':
      return '#3b82f6'; // blue
    case 'high':
      return '#ef4444'; // red
    default:
      return '#f59e0b'; // orange (medium)
  }
}

/**
 * Camelot key marker
 */
function CamelotKeyMarker({
  keyData,
  isCurrent,
  isMatching,
  isHovered,
  onSelect,
  radius,
  centerX,
  centerY,
}: {
  keyData: (typeof CAMELOT_KEYS)[0];
  isCurrent: boolean;
  isMatching: boolean;
  isHovered: boolean;
  onSelect?: () => void;
  radius: number;
  centerX: number;
  centerY: number;
}) {
  const rad = (keyData.angle * Math.PI) / 180;
  const x = centerX + radius * Math.cos(rad);
  const y = centerY + radius * Math.sin(rad);

  const size = isCurrent ? 8 : isMatching ? 6 : 4;
  const opacity = isCurrent ? 1 : isMatching ? 0.8 : 0.5;

  return (
    <g key={keyData.camelotId}>
      <circle
        cx={x}
        cy={y}
        r={size}
        fill={isCurrent ? '#22c55e' : isMatching ? '#fbbf24' : '#6b7280'}
        opacity={opacity}
        cursor={onSelect ? 'pointer' : 'default'}
        onClick={onSelect}
        style={{
          filter: isHovered ? 'drop-shadow(0 0 4px rgba(255,255,255,0.6))' : 'none',
          transition: 'all 0.2s ease',
        }}
      />

      {/* Label */}
      <text
        x={x}
        y={y + (size + 12)}
        textAnchor="middle"
        fontSize="10"
        fill="rgba(200,200,200,0.7)"
        pointerEvents="none"
      >
        {keyData.camelotId}
      </text>
    </g>
  );
}

const MemoizedKeyMarker = React.memo(CamelotKeyMarker);

export const CamelotWheelOptimized = React.memo(function CamelotWheelOptimized({
  currentKey,
  currentBpm,
  matchingKeys = [],
  bpmRange,
  energy,
  onKeySelect,
  interactive = false,
}: CamelotWheelProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const size = 300;
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = 100;

  // Precompute markers
  const markers = useMemo(() => {
    return CAMELOT_KEYS.map((keyData) => {
      const isCurrent = currentKey === keyData.camelotId;
      const isMatching = matchingKeys.includes(keyData.camelotId);
      const isHovered = hoveredKey === keyData.camelotId;

      return (
        <MemoizedKeyMarker
          key={keyData.camelotId}
          keyData={keyData}
          isCurrent={isCurrent}
          isMatching={isMatching}
          isHovered={isHovered}
          onSelect={
            interactive && onKeySelect
              ? () => onKeySelect(keyData.camelotId)
              : undefined
          }
          radius={radius}
          centerX={centerX}
          centerY={centerY}
        />
      );
    });
  }, [currentKey, matchingKeys, hoveredKey, interactive, onKeySelect]);

  // Energy ring color
  const energyColor = useMemo(() => getEnergyColor(energy), [energy]);

  // BPM range ring (point 621-640)
  const bpmRing = useMemo(() => {
    if (!bpmRange || !currentBpm) return null;

    const minPercent = (Math.max(bpmRange.min, 70) / 200) * 100; // Assume 70-200 BPM range
    const maxPercent = (Math.min(bpmRange.max, 200) / 200) * 100;
    const currentPercent = (currentBpm / 200) * 100;

    return (
      <g>
        {/* BPM range background */}
        <circle
          cx={centerX}
          cy={centerY}
          r={40}
          fill="none"
          stroke="rgba(107,114,128,0.3)"
          strokeWidth="2"
        />
        {/* Current BPM indicator */}
        <circle
          cx={centerX}
          cy={centerY - 40}
          r={3}
          fill={energyColor}
          opacity={0.8}
        />
        {/* BPM text */}
        <text x={centerX} y={centerY + 12} textAnchor="middle" fontSize="12" fill="rgba(200,200,200,0.8)">
          {currentBpm} BPM
        </text>
      </g>
    );
  }, [bpmRange, currentBpm, energyColor, centerX, centerY]);

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Outer circle */}
        <circle
          cx={centerX}
          cy={centerY}
          r={radius}
          fill="none"
          stroke="rgba(107,114,128,0.4)"
          strokeWidth="1"
        />

        {/* Inner circle */}
        <circle
          cx={centerX}
          cy={centerY}
          r={radius * 0.6}
          fill="none"
          stroke="rgba(107,114,128,0.2)"
          strokeWidth="1"
        />

        {/* Energy ring (outermost, point 621-640) */}
        <circle
          cx={centerX}
          cy={centerY}
          r={radius + 15}
          fill="none"
          stroke={energyColor}
          strokeWidth="2"
          opacity={0.5}
        />

        {/* Key markers */}
        {markers}

        {/* BPM indicator ring */}
        {bpmRing}
      </svg>

      {/* Current key info */}
      {currentKey && (
        <div className="text-sm text-gray-300">
          <span className="font-medium">{currentKey}</span>
          {energy && <span className="ml-2 text-xs">• {energy} energy</span>}
        </div>
      )}

      {/* Matching keys count */}
      {matchingKeys.length > 0 && (
        <div className="text-xs text-gray-500">
          {matchingKeys.length} compatible keys
        </div>
      )}
    </div>
  );
});

export default CamelotWheelOptimized;
