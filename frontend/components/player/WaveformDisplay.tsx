'use client';
import { useMemo } from 'react';
import { HOT_CUE_COLORS } from '@/lib/constants';

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
}: WaveformDisplayProps) {
  const bars = overview ? 200 : 120;

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

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${bars} ${height}`} preserveAspectRatio="none">
      {barHeights.map((h, i) => {
        const isPlayed = i / bars < progress;
        const mid = height / 2;
        const low = h * 0.4;
        const mid2 = h * 0.35;
        const high = h - low - mid2;
        const x = `${i * (100 / bars)}%`;
        const w = `${(100 / bars) * 0.6}%`;
        return (
          <g key={i}>
            <rect x={x} y={mid - h / 2} width={w} height={low} fill={isPlayed ? "#ef444488" : "#ef444440"} />
            <rect x={x} y={mid - h / 2 + low} width={w} height={mid2} fill={isPlayed ? "#22c55e88" : "#22c55e40"} />
            <rect x={x} y={mid - h / 2 + low + mid2} width={w} height={high} fill={isPlayed ? "#3b82f688" : "#3b82f640"} />
          </g>
        );
      })}
      {!overview && (
        <line x1={`${progress * 100}%`} y1={0} x2={`${progress * 100}%`} y2={height} stroke="white" strokeWidth={1.5} opacity={0.9} />
      )}
      {!overview && hotCues.map((c, i) => {
        const pct = c.position ?? [8, 26, 61, 88][i] ?? 30;
        return <line key={i} x1={`${pct}%`} y1={0} x2={`${pct}%`} y2={height} stroke={HOT_CUE_COLORS[c.slot]} strokeWidth={1.5} opacity={0.85} />;
      })}
    </svg>
  );
}
