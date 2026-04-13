/**
 * Optimized beatgrid display (points 591-600)
 * LOD: downbeats only in overview, full grid in detail
 * Confidence colors, beat flash, phase indicator
 */

import React, { useMemo, useState, useCallback } from 'react';

interface Beat {
  position_ms: number;
  downbeat?: boolean;
  confidence?: number;
}

interface BeatgridSVGProps {
  beats: Beat[];
  duration: number;
  height: number;
  bpm?: number | null;
  confidence?: number;
  zoom: number;
  isOverview?: boolean;
  currentTime?: number;
  visibleStart: number;
  visibleEnd: number;
  pxPerSec: number;
  onBeatClick?: (beat: Beat) => void;
  editMode?: boolean;
  onBeatDrag?: (beat: Beat, newMs: number) => void;
}

/**
 * Get color based on beat confidence (point 591-600)
 */
function getConfidenceColor(conf: number | undefined): string {
  if (!conf) return 'rgba(150,150,150,0.6)'; // gray for unknown
  if (conf >= 0.9) return 'rgba(34,197,94,0.8)'; // green - high
  if (conf >= 0.7) return 'rgba(59,130,246,0.7)'; // blue - medium
  if (conf >= 0.5) return 'rgba(251,146,60,0.6)'; // orange - low
  return 'rgba(239,68,68,0.5)'; // red - very low
}

/**
 * Beat flash animation on downbeat (point 591-600)
 */
function BeatMarker({
  beat,
  x,
  height,
  isDownbeat,
  isNearCurrentTime,
  isOverview,
  onBeatClick,
}: {
  beat: Beat;
  x: number;
  height: number;
  isDownbeat: boolean;
  isNearCurrentTime: boolean;
  isOverview: boolean;
  onBeatClick?: (beat: Beat) => void;
}) {
  const color = getConfidenceColor(beat.confidence);
  const lineHeight = isDownbeat ? height : height * 0.6;
  const mid = height / 2;

  return (
    <g key={beat.position_ms}>
      {/* Beat line */}
      <line
        x1={x}
        y1={mid - lineHeight / 2}
        x2={x}
        y2={mid + lineHeight / 2}
        stroke={color}
        strokeWidth={isDownbeat ? 2 : 1}
        opacity={isDownbeat ? 1 : 0.7}
        cursor="pointer"
        onClick={() => onBeatClick?.(beat)}
      />

      {/* Flash on downbeat when near current time (point 591-600) */}
      {isDownbeat && isNearCurrentTime && (
        <circle
          cx={x}
          cy={mid}
          r={6}
          fill="rgba(255,255,0,0.6)"
          style={{
            animation: 'beat-flash 0.4s ease-out',
          }}
        />
      )}

      {/* Downbeat marker (dot) */}
      {isDownbeat && (
        <circle
          cx={x}
          cy={mid}
          r={3}
          fill={color}
          opacity={0.9}
        />
      )}
    </g>
  );
}

const MemoizedBeatMarker = React.memo(BeatMarker);

export const BeatgridSVG = React.memo(function BeatgridSVG({
  beats,
  duration,
  height,
  bpm,
  confidence,
  zoom,
  isOverview = false,
  currentTime = 0,
  visibleStart,
  visibleEnd,
  pxPerSec,
  onBeatClick,
  editMode = false,
  onBeatDrag,
}: BeatgridSVGProps) {
  const [draggedBeatIdx, setDraggedBeatIdx] = useState<number | null>(null);

  // LOD: Filter beats based on overview mode (point 591-600)
  const visibleBeats = useMemo(() => {
    const minMs = (visibleStart / pxPerSec) * 1000;
    const maxMs = (visibleEnd / pxPerSec) * 1000;

    let filtered = beats.filter((b) => b.position_ms >= minMs && b.position_ms <= maxMs);

    // In overview mode, show only downbeats
    if (isOverview) {
      filtered = filtered.filter((b) => b.downbeat);
    }

    return filtered;
  }, [beats, visibleStart, visibleEnd, pxPerSec, isOverview]);

  // Precompute beat markers
  const beatElements = useMemo(() => {
    return visibleBeats.map((beat) => {
      const x = (beat.position_ms / 1000 / duration) * (visibleEnd - visibleStart) + visibleStart;
      const isNearCurrentTime = Math.abs(beat.position_ms - currentTime) < 1000; // Within 1s

      return (
        <MemoizedBeatMarker
          key={beat.position_ms}
          beat={beat}
          x={x}
          height={height}
          isDownbeat={beat.downbeat === true}
          isNearCurrentTime={isNearCurrentTime}
          isOverview={isOverview}
          onBeatClick={onBeatClick}
        />
      );
    });
  }, [visibleBeats, visibleStart, visibleEnd, duration, currentTime, isOverview, onBeatClick]);

  // Phase indicator (point 591-600)
  const phaseIndicator = useMemo(() => {
    if (!bpm || !isOverview) return null;

    const beatDurationMs = (60 / bpm) * 1000;
    const phase = (currentTime % (beatDurationMs * 4)) / (beatDurationMs * 4); // 0-1 for 4-beat cycle

    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: `${phase * 100}%`,
          width: '2px',
          height: '100%',
          backgroundColor: 'rgba(255,215,0,0.8)',
          pointerEvents: 'none',
        }}
        aria-label={`Beat phase: ${Math.round(phase * 100)}%`}
      />
    );
  }, [bpm, isOverview, currentTime]);

  return (
    <>
      <svg
        width={visibleEnd - visibleStart}
        height={height}
        style={{ position: 'absolute', top: 0 }}
      >
        <style>{`
          @keyframes beat-flash {
            0% { r: 6; opacity: 1; }
            100% { r: 12; opacity: 0; }
          }
        `}</style>
        {beatElements}
      </svg>

      {/* Phase indicator overlay */}
      {phaseIndicator}
    </>
  );
});

export default BeatgridSVG;
