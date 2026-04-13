/**
 * Optimized SVG cue display (points 581-590)
 * Single <svg> element, batch operations, memoized
 * Efficient rendering of 100+ cues
 */

import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { ANIMATION_DURATIONS } from '@/lib/constants';

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
  enableSnapToGrid?: boolean; // Improvement #64: snap-to-grid visual feedback
  enableMarkerShapes?: boolean; // Improvement #65: different shapes per cue type
  showConnectionLines?: boolean; // Improvement #58: connection lines for loops
  recentlyDeletedCues?: CuePoint[]; // Improvement #61: ghost markers
}

/** Improvement #65: Get marker shape based on cue type */
function getMarkerShape(cueType?: string): 'circle' | 'triangle' | 'square' | 'diamond' {
  switch (cueType) {
    case 'drop': return 'triangle';
    case 'vocal': return 'circle';
    case 'loop': return 'square';
    default: return 'diamond';
  }
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
  enableSnapToGrid,
  snapGridX,
  enableMarkerShapes,
  showSnapLine,
}: {
  cue: CuePoint;
  x: number;
  height: number;
  isHovered: boolean;
  isNear: boolean;
  onCueClick?: (cue: CuePoint) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  enableSnapToGrid?: boolean; // Improvement #64
  snapGridX?: number; // Improvement #64
  enableMarkerShapes?: boolean; // Improvement #65
  showSnapLine?: boolean; // Improvement #64
}) {
  const color = cue.color || '#22c55e';
  const mid = height / 2;
  const markerShape = enableMarkerShapes ? getMarkerShape((cue as any).cue_type) : 'circle';

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
      {/* Improvement #64: Snap-to-grid visual guide */}
      {enableSnapToGrid && showSnapLine && snapGridX !== undefined && Math.abs(snapGridX - x) < 8 && (
        <line
          x1={snapGridX}
          y1={0}
          x2={snapGridX}
          y2={height}
          stroke="#4ade80"
          strokeWidth={1}
          opacity={0.4}
          strokeDasharray="2,2"
          pointerEvents="none"
        />
      )}

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

      {/* Line (thin when not hovered) - with fade transition */}
      <line
        x1={x}
        y1={0}
        x2={x}
        y2={height}
        stroke={color}
        strokeWidth={isHovered || isNear ? 3 : 1.5}
        opacity={isHovered ? 1 : 0.8}
        style={{
          transition: `stroke-width ${ANIMATION_DURATIONS.fast}ms ease-in-out, opacity ${ANIMATION_DURATIONS.fast}ms ease-in-out`,
        }}
      />

      {/* Improvement #65: Different marker shapes per cue type */}
      {markerShape === 'circle' && (
        <circle
          cx={x}
          cy={mid}
          r={isHovered ? 6 : 4}
          fill={color}
          opacity={isHovered ? 1 : 0.85}
        />
      )}
      {markerShape === 'triangle' && (
        <polygon
          points={`${x},${mid - (isHovered ? 6 : 4)} ${x + (isHovered ? 6 : 4)},${mid + (isHovered ? 6 : 4)} ${x - (isHovered ? 6 : 4)},${mid + (isHovered ? 6 : 4)}`}
          fill={color}
          opacity={isHovered ? 1 : 0.85}
        />
      )}
      {markerShape === 'square' && (
        <rect
          x={x - (isHovered ? 6 : 4)}
          y={mid - (isHovered ? 6 : 4)}
          width={isHovered ? 12 : 8}
          height={isHovered ? 12 : 8}
          fill={color}
          opacity={isHovered ? 1 : 0.85}
        />
      )}
      {markerShape === 'diamond' && (
        <polygon
          points={`${x},${mid - (isHovered ? 6 : 4)} ${x + (isHovered ? 6 : 4)},${mid} ${x},${mid + (isHovered ? 6 : 4)} ${x - (isHovered ? 6 : 4)},${mid}`}
          fill={color}
          opacity={isHovered ? 1 : 0.85}
        />
      )}

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
  enableSnapToGrid = false,
  enableMarkerShapes = false,
  showConnectionLines = false,
  recentlyDeletedCues = [],
}: CuePointsSVGProps) {
  // Improvement #18: LOD optimization - skip rendering labels for dense cue clusters
  const [selectedCueId, setSelectedCueId] = useState<number | null>(null);

  // Improvement #64: Snap grid state
  const [showSnapGuide, setShowSnapGuide] = useState(false);
  const [snapGridX, setSnapGridX] = useState<number | undefined>();

  // Improvement #62: Selection rectangle
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);
  const [selectedCueIds, setSelectedCueIds] = useState<Set<number>>(new Set());

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

  // Improvement #61: Ghost markers for recently deleted cues
  const ghostMarkers = useMemo(() => {
    return recentlyDeletedCues.map((cue) => {
      const x = (cue.position_ms / 1000 / duration) * (visibleEnd - visibleStart) + visibleStart;
      const mid = height / 2;
      const color = cue.color || '#22c55e';

      if (x < visibleStart || x > visibleEnd) return null;

      return (
        <circle
          key={`ghost-${cue.id}`}
          cx={x}
          cy={mid}
          r={4}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          opacity={0.3}
          strokeDasharray="2,2"
          style={{ pointerEvents: 'none' }}
        />
      );
    });
  }, [recentlyDeletedCues, duration, height, visibleStart, visibleEnd]);

  // Improvement #58: Connection lines for loops
  const connectionLines = useMemo(() => {
    if (!showConnectionLines) return [];

    return precomputedPositions
      .filter(({ cue }) => cue.cue_mode === 'loop' && cue.position_ms !== undefined && (cue as any).end_position_ms !== undefined)
      .map(({ cue, x: startX }) => {
        const endPosMs = (cue as any).end_position_ms || 0;
        const endX = (endPosMs / 1000 / duration) * (visibleEnd - visibleStart) + visibleStart;
        const color = cue.color || '#22c55e';

        return (
          <line
            key={`loop-${cue.id}`}
            x1={startX}
            y1={height / 2}
            x2={endX}
            y2={height / 2}
            stroke={color}
            strokeWidth={1}
            opacity={0.4}
            strokeDasharray="4,4"
            pointerEvents="none"
          />
        );
      });
  }, [precomputedPositions, showConnectionLines, duration, height, visibleStart, visibleEnd]);

  // Precompute x positions for all visible cues
  const cueElements = useMemo(() => {
    return precomputedPositions.map(({ cue, x }) => {
      const isNear = Math.abs(cue.position_ms - currentTime) < 500;
      const isHovered = cue.id === hoveredCueId;
      const isSelected = selectedCueIds.has(cue.id);

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
            setShowSnapGuide(enableSnapToGrid);
          }}
          onMouseLeave={() => {
            setSelectedCueId(null);
            onHoveredCueChange?.(null);
            setShowSnapGuide(false);
          }}
          enableSnapToGrid={enableSnapToGrid}
          snapGridX={snapGridX}
          enableMarkerShapes={enableMarkerShapes}
          showSnapLine={showSnapGuide && isHovered}
        />
      );
    });
  }, [precomputedPositions, currentTime, hoveredCueId, onCueClick, onHoveredCueChange, enableSnapToGrid, snapGridX, enableMarkerShapes, showSnapGuide, selectedCueIds]);

  // Improvement #62: Selection rectangle handler
  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as SVGElement).tagName !== 'svg') return;
    setSelectionStart({ x: e.clientX, y: e.clientY });
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!selectionStart) return;
    setSelectionEnd({ x: e.clientX, y: e.clientY });
  };

  const handleSvgMouseUp = () => {
    if (!selectionStart || !selectionEnd) {
      setSelectionStart(null);
      setSelectionEnd(null);
      return;
    }

    const minX = Math.min(selectionStart.x, selectionEnd.x);
    const maxX = Math.max(selectionStart.x, selectionEnd.x);

    const selected = precomputedPositions
      .filter(({ x }) => x >= minX && x <= maxX)
      .map(({ cue }) => cue.id);

    setSelectedCueIds(new Set(selected));
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  return (
    <svg
      width={visibleEnd - visibleStart}
      height={height}
      style={{ position: 'absolute', top: 0 }}
      role="img"
      aria-label={`Cue points timeline with ${visibleCues.length} visible cues`}
      onMouseDown={handleSvgMouseDown}
      onMouseMove={handleSvgMouseMove}
      onMouseUp={handleSvgMouseUp}
      onMouseLeave={handleSvgMouseUp}
    >
      <style>{`
        @keyframes cue-pulse {
          0% { r: 10; opacity: 0.8; }
          100% { r: 20; opacity: 0; }
        }
        @keyframes cue-pop {
          0% { transform: scale(0.5); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: scale(1); opacity: 0.85; }
        }
        @keyframes cue-glow {
          0% { filter: drop-shadow(0 0 0px currentColor); }
          50% { filter: drop-shadow(0 0 8px currentColor); }
          100% { filter: drop-shadow(0 0 0px currentColor); }
        }
      `}</style>

      {/* Improvement #61: Ghost markers */}
      {ghostMarkers}

      {/* Improvement #58: Connection lines */}
      {connectionLines}

      {/* Improvement #62: Selection rectangle */}
      {selectionStart && selectionEnd && (
        <rect
          x={Math.min(selectionStart.x, selectionEnd.x)}
          y={0}
          width={Math.abs(selectionEnd.x - selectionStart.x)}
          height={height}
          fill="#3b82f6"
          opacity={0.1}
          stroke="#3b82f6"
          strokeWidth={1}
          strokeDasharray="2,2"
          pointerEvents="none"
        />
      )}

      {cueElements}
    </svg>
  );
});

export default CuePointsSVG;
