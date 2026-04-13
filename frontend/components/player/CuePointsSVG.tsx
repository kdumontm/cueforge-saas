/**
 * Optimized SVG cue display (points 581-590)
 * Single <svg> element, batch operations, memoized
 * Efficient rendering of 100+ cues
 */

import React, { useMemo, useCallback } from 'react';

interface CuePoint {
  id: number;
  position_ms: number;
  color?: string | null;
  name?: string;
  number?: number | null;
  cue_mode?: string;
}

interface CuePointsSVGProps {
  cuePoints: CuePoint[];
  duration: number;
  height: number;
  zoom: number;
  currentTime: number;
  visibleStart: number; // Start of visible range in px
  visibleEnd: number; // End of visible range in px
  pxPerSec: number;
  onCueClick?: (cue: CuePoint) => void;
  onCueDrag?: (cue: CuePoint, newPositionMs: number) => void;
  hoveredCueId?: number | null;
}

/**
 * Cue hitbox and tooltip positioning
 */
function CuePointElement({
  cue,
  x,
  height,
  isHovered,
  isNear,
  onCueClick,
  onMouseEnter,
  onMouseLeave,
}: {
  cue: CuePoint;
  x: number;
  height: number;
  isHovered: boolean;
  isNear: boolean;
  onCueClick?: (cue: CuePoint) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const color = cue.color || '#22c55e';
  const mid = height / 2;

  return (
    <g key={cue.id}>
      {/* Invisible 44px hitbox (accessibility point 581-590) */}
      <rect
        x={x - 22}
        y={0}
        width={44}
        height={height}
        fill="transparent"
        cursor="pointer"
        onClick={() => onCueClick?.(cue)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        role="button"
        tabIndex={0}
        aria-label={`Cue ${cue.name || cue.number || cue.id} at ${Math.floor(cue.position_ms / 1000)}s`}
      />

      {/* Line (thin when not hovered) */}
      <line
        x1={x}
        y1={0}
        x2={x}
        y2={height}
        stroke={color}
        strokeWidth={isHovered || isNear ? 3 : 1.5}
        opacity={isHovered ? 1 : 0.8}
      />

      {/* Diamond marker at middle */}
      <circle
        cx={x}
        cy={mid}
        r={isHovered ? 6 : 4}
        fill={color}
        opacity={isHovered ? 1 : 0.85}
      />

      {/* Flash on beat (visual feedback point 581-590) */}
      {isHovered && (
        <circle
          cx={x}
          cy={mid}
          r={10}
          fill="none"
          stroke={color}
          strokeWidth={2}
          opacity={0.5}
          style={{
            animation: 'cue-pulse 0.5s ease-out',
          }}
        />
      )}
    </g>
  );
}

const MemoizedCuePointElement = React.memo(CuePointElement);

export const CuePointsSVG = React.memo(function CuePointsSVG({
  cuePoints,
  duration,
  height,
  zoom,
  currentTime,
  visibleStart,
  visibleEnd,
  pxPerSec,
  onCueClick,
  onCueDrag,
  hoveredCueId,
}: CuePointsSVGProps) {
  // Precompute visible cues (LOD optimization)
  const visibleCues = useMemo(() => {
    const minMs = (visibleStart / pxPerSec) * 1000;
    const maxMs = (visibleEnd / pxPerSec) * 1000;
    return cuePoints.filter((c) => c.position_ms >= minMs && c.position_ms <= maxMs);
  }, [cuePoints, visibleStart, visibleEnd, pxPerSec]);

  // Precompute x positions for all visible cues
  const cueElements = useMemo(() => {
    return visibleCues.map((cue) => {
      const x = (cue.position_ms / 1000 / duration) * (visibleEnd - visibleStart) + visibleStart;
      const isNear = Math.abs(cue.position_ms - currentTime) < 500; // Within 500ms
      const isHovered = cue.id === hoveredCueId;

      return (
        <MemoizedCuePointElement
          key={cue.id}
          cue={cue}
          x={x}
          height={height}
          isHovered={isHovered}
          isNear={isNear}
          onCueClick={onCueClick}
          onMouseEnter={() => {}} // Handle in parent
          onMouseLeave={() => {}} // Handle in parent
        />
      );
    });
  }, [visibleCues, visibleStart, visibleEnd, duration, currentTime, hoveredCueId, onCueClick]);

  return (
    <svg width={visibleEnd - visibleStart} height={height} style={{ position: 'absolute', top: 0 }}>
      <style>{`
        @keyframes cue-pulse {
          0% { r: 10; opacity: 0.8; }
          100% { r: 20; opacity: 0; }
        }
      `}</style>
      {cueElements}
    </svg>
  );
});

export default CuePointsSVG;
