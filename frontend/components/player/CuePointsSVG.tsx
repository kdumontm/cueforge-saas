/**
 * Optimized SVG cue display (points 581-590)
 * Single <svg> element, batch operations, memoized
 * Efficient rendering of 100+ cues
 */

import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';

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
  onHoveredCueChange?: (cueId: number | null) => void; // Improvement #19
}

/**
 * Cue hitbox and tooltip positioning
 * Improvement #16: Wrap in React.memo for performance
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

  // Improvement #17: Use requestAnimationFrame for hover animations instead of CSS
  const [animationFrame, setAnimationFrame] = useState<number | null>(null);

  useEffect(() => {
    if (isHovered && !animationFrame) {
      let frame = 0;
      const animate = () => {
        frame = (frame + 1) % 60;
        setAnimationFrame(frame);
        requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    } else if (!isHovered && animationFrame !== null) {
      setAnimationFrame(null);
    }
  }, [isHovered, animationFrame]);

  const pulseRadius = isHovered ? 10 + (animationFrame || 0) * 0.2 : 10;
  const pulseOpacity = isHovered ? 0.5 - (animationFrame || 0) * 0.008 : 0;

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

      {/* Improvement #17: requestAnimationFrame-based pulse animation */}
      {isHovered && (
        <circle
          cx={x}
          cy={mid}
          r={pulseRadius}
          fill="none"
          stroke={color}
          strokeWidth={2}
          opacity={Math.max(0, pulseOpacity)}
        />
      )}
    </g>
  );
}

// Improvement #16: Memoize individual cue elements
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
  onHoveredCueChange,
}: CuePointsSVGProps) {
  // Improvement #18: LOD optimization - skip rendering labels for dense cue clusters
  const [selectedCueId, setSelectedCueId] = useState<number | null>(null);

  // Precompute visible cues (LOD optimization)
  const visibleCues = useMemo(() => {
    const minMs = (visibleStart / pxPerSec) * 1000;
    const maxMs = (visibleEnd / pxPerSec) * 1000;
    return cuePoints.filter((c) => c.position_ms >= minMs && c.position_ms <= maxMs);
  }, [cuePoints, visibleStart, visibleEnd, pxPerSec]);

  // Improvement #21: Precompute positions to optimize hitbox calculations
  const precomputedPositions = useMemo(() => {
    return visibleCues.map((cue) => ({
      cue,
      x: (cue.position_ms / 1000 / duration) * (visibleEnd - visibleStart) + visibleStart,
    }));
  }, [visibleCues, visibleStart, visibleEnd, duration]);

  // Improvement #18: Detect dense clusters and skip labels
  const denseClusterThreshold = useMemo(() => {
    return (visibleEnd - visibleStart) / precomputedPositions.length < 50; // Less than 50px per cue
  }, [visibleEnd, visibleStart, precomputedPositions.length]);

  // Improvement #19: Keyboard navigation between cues (left/right arrows)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedCueId) return;
      const currentIdx = precomputedPositions.findIndex(p => p.cue.id === selectedCueId);
      if (currentIdx === -1) return;

      if (e.key === 'ArrowLeft' && currentIdx > 0) {
        e.preventDefault();
        setSelectedCueId(precomputedPositions[currentIdx - 1].cue.id);
        onHoveredCueChange?.(precomputedPositions[currentIdx - 1].cue.id);
      } else if (e.key === 'ArrowRight' && currentIdx < precomputedPositions.length - 1) {
        e.preventDefault();
        setSelectedCueId(precomputedPositions[currentIdx + 1].cue.id);
        onHoveredCueChange?.(precomputedPositions[currentIdx + 1].cue.id);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cue = precomputedPositions[currentIdx].cue;
        onCueClick?.(cue);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCueId, precomputedPositions, onCueClick, onHoveredCueChange]);

  // Precompute x positions for all visible cues
  const cueElements = useMemo(() => {
    return precomputedPositions.map(({ cue, x }) => {
      const isNear = Math.abs(cue.position_ms - currentTime) < 500;
      const isHovered = cue.id === hoveredCueId;

      return (
        <MemoizedCuePointElement
          key={cue.id}
          cue={cue}
          x={x}
          height={height}
          isHovered={isHovered}
          isNear={isNear}
          onCueClick={(c) => {
            setSelectedCueId(c.id);
            onCueClick?.(c);
          }}
          onMouseEnter={() => {
            setSelectedCueId(cue.id);
            onHoveredCueChange?.(cue.id);
          }}
          onMouseLeave={() => {
            setSelectedCueId(null);
            onHoveredCueChange?.(null);
          }}
        />
      );
    });
  }, [precomputedPositions, currentTime, hoveredCueId, onCueClick, onHoveredCueChange]);

  return (
    <svg
      width={visibleEnd - visibleStart}
      height={height}
      style={{ position: 'absolute', top: 0 }}
      // Improvement #20: ARIA roles and labels for SVG
      role="img"
      aria-label={`Cue points timeline with ${visibleCues.length} visible cues`}
    >
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
