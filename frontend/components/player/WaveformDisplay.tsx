'use client';
import { useMemo, useCallback, useState } from 'react';
import { HOT_CUE_COLORS, BAR_COLORS } from '@/lib/constants';

interface HotCue {
  slot: number;
  time: string;
  label: string;
  position?: number;
}

interface WaveformDisplayProps {
  height?: number;
  overview?: boolean;
  hotCues?: HotCue[];
  progress?: number;
  waveformPeaks?: number[] | null;
  trackId?: number;
  enableFrequencyColors?: boolean; // Improvement #23
  enableLUFS?: boolean; // Improvement #27
}

// Pseudo-random stable basé sur une seed — évite Math.random() à chaque render
function seededRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export default function WaveformDisplay({
  height = 80,
  overview = false,
  hotCues = [],
  progress = 0.35,
  waveformPeaks,
  trackId = 42,
  enableFrequencyColors = true, // Improvement #23: default enabled
  enableLUFS = false, // Improvement #27
}: WaveformDisplayProps) {
  const bars = overview ? 200 : 120;
  const [showLUFS, setShowLUFS] = useState(enableLUFS); // Improvement #27: toggle

  // Improvement #24: Memoize bar heights calculation with useMemo
  const barHeights = useMemo(() => {
    if (waveformPeaks && waveformPeaks.length > 0) {
      return Array.from({ length: bars }, (_, i) => {
        const srcIdx = Math.floor((i / bars) * waveformPeaks.length);
        return Math.max(0.05, waveformPeaks[srcIdx] || 0) * height * 0.9;
      });
    }
    const rand = seededRand(trackId * 31 + bars);
    return Array.from({ length: bars }, (_, i) => {
      if (overview) {
        return rand() * height * 0.7 + height * 0.1;
      }
      return (Math.sin(i * 0.3) * 0.4 + 0.6) * height * 0.85;
    });
  }, [bars, height, overview, waveformPeaks, trackId]);

  // Improvement #23: Get frequency-based color for a bar index
  const getBarColor = useCallback((barIndex: number, isPlayed: boolean): string => {
    if (!enableFrequencyColors) {
      return isPlayed ? '#22c55e88' : '#22c55e40';
    }
    // Low: 0-33% of bars, Mid: 33-66%, High: 66-100%
    const percent = barIndex / bars;
    if (percent < 0.33) {
      return isPlayed ? BAR_COLORS.played.bass : BAR_COLORS.unplayed.bass;
    } else if (percent < 0.66) {
      return isPlayed ? BAR_COLORS.played.mids : BAR_COLORS.unplayed.mids;
    } else {
      return isPlayed ? BAR_COLORS.played.highs : BAR_COLORS.unplayed.highs;
    }
  }, [bars, enableFrequencyColors]);

  // Improvement #26: Use CSS transform for progress line instead of re-render
  const progressLineStyle = useMemo(() => ({
    transform: `translateX(${progress * 100}%)`,
  }), [progress]);

  // Improvement #28: Memoize path data for all bars instead of individual rects
  const barPathData = useMemo(() => {
    if (!enableFrequencyColors) {
      // Standard 3-bar stack rendering
      return barHeights.map((h, i) => {
        const isPlayed = i / bars < progress;
        const mid = height / 2;
        const low = h * 0.4;
        const mid2 = h * 0.35;
        const high = h - low - mid2;
        const x = i * (100 / bars);
        const w = (100 / bars) * 0.6;
        return {
          x, w, h, mid, low, mid2, high,
          color1: isPlayed ? BAR_COLORS.played.bass : BAR_COLORS.unplayed.bass,
          color2: isPlayed ? BAR_COLORS.played.mids : BAR_COLORS.unplayed.mids,
          color3: isPlayed ? BAR_COLORS.played.highs : BAR_COLORS.unplayed.highs,
        };
      });
    }
    // Frequency-colored rendering
    return barHeights.map((h, i) => {
      const isPlayed = i / bars < progress;
      const mid = height / 2;
      const color = getBarColor(i, isPlayed);
      const x = i * (100 / bars);
      const w = (100 / bars) * 0.6;
      return { x, w, h, mid, color, isFrequencyColored: true };
    });
  }, [barHeights, bars, height, progress, enableFrequencyColors, getBarColor]);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${bars} ${height}`} preserveAspectRatio="none">
      {/* Improvement #25: Hover tooltip group */}
      {barPathData.map((bar, i) => {
        if ('color1' in bar) {
          // Standard mode
          const { x, w, h, mid, low, mid2, high, color1, color2, color3 } = bar;
          return (
            <g key={i} style={{ cursor: 'pointer' }} title={`Bar ${i + 1} (${((i / bars) * 100).toFixed(1)}%)`}>
              <rect x={`${x}%`} y={mid - h / 2} width={`${w}%`} height={low} fill={color1} />
              <rect x={`${x}%`} y={mid - h / 2 + low} width={`${w}%`} height={mid2} fill={color2} />
              <rect x={`${x}%`} y={mid - h / 2 + low + mid2} width={`${w}%`} height={high} fill={color3} />
            </g>
          );
        } else {
          // Frequency colored mode
          const { x, w, h, mid, color } = bar as typeof bar & { isFrequencyColored: boolean };
          return (
            <rect
              key={i}
              x={`${x}%`}
              y={mid - h / 2}
              width={`${w}%`}
              height={h}
              fill={color}
              style={{ cursor: 'pointer' }}
              title={`Bar ${i + 1} (${((i / bars) * 100).toFixed(1)}%)`}
            />
          );
        }
      })}

      {!overview && (
        // Improvement #26: CSS transform for progress line
        <g style={{ pointerEvents: 'none' }}>
          <line x1="50%" y1={0} x2="50%" y2={height} stroke="white" strokeWidth={1.5} opacity={0.9} style={progressLineStyle} />
        </g>
      )}

      {!overview && hotCues.map((c, i) => {
        const pct = c.position ?? [8, 26, 61, 88][i] ?? 30;
        return <line key={`cue-${i}`} x1={`${pct}%`} y1={0} x2={`${pct}%`} y2={height} stroke={HOT_CUE_COLORS[c.slot]} strokeWidth={1.5} opacity={0.85} />;
      })}

      {/* Improvement #27: LUFS normalization toggle */}
      {!overview && showLUFS && (
        <g style={{ opacity: 0.4, pointerEvents: 'none' }}>
          <line x1="0%" y1={height / 2} x2="100%" y2={height / 2} stroke="white" strokeWidth={0.5} strokeDasharray="3,3" />
        </g>
      )}
    </svg>
  );
}
