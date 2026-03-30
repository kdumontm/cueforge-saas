'use client';
import { HOT_CUE_COLORS } from '@/lib/constants';

interface HotCue {
  slot: number;
  time: string;
  label: string;
  position?: number; // 0-100 percentage
}

interface WaveformDisplayProps {
  height?: number;
  overview?: boolean;
  hotCues?: HotCue[];
  progress?: number; // 0-1
}

export default function WaveformDisplay({ height = 80, overview = false, hotCues = [], progress = 0.35 }: WaveformDisplayProps) {
  const bars = overview ? 200 : 120;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${bars} ${height}`} preserveAspectRatio="none">
      {Array.from({ length: bars }, (_, i) => {
        const h = overview
          ? Math.random() * height * 0.7 + height * 0.1
          : (Math.sin(i * 0.3) * 0.4 + 0.6) * height * 0.85;
        const isPlayed = i / bars < progress;
        const mid = height / 2;
        const low = (Math.sin(i * 0.8 + 1) * 0.5 + 0.5) * h * 0.4;
        const mid2 = (Math.sin(i * 0.5 + 0.5) * 0.5 + 0.5) * h * 0.35;
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
      {/* Playhead */}
      {!overview && <line x1={`${progress * 100}%`} y1={0} x2={`${progress * 100}%`} y2={height} stroke="white" strokeWidth={1.5} opacity={0.9} />}
      {/* Hot cue markers */}
      {!overview && hotCues.map((c, i) => {
        const pct = c.position ?? [8, 26, 61, 88][i] ?? 30;
        return <line key={i} x1={`${pct}%`} y1={0} x2={`${pct}%`} y2={height} stroke={HOT_CUE_COLORS[c.slot]} strokeWidth={1.5} opacity={0.85} />;
      })}
    </svg>
  );
}
