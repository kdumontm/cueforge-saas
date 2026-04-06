// @ts-nocheck
'use client';

import { Loader2 } from 'lucide-react';
import { useLang } from '@/components/LangProvider';
import { tr } from '@/lib/i18n';

const ANALYSIS_STEPS = [
  { min: 0,  max: 5,  key: 'analysis.decoding' },
  { min: 5,  max: 20, key: 'analysis.preparing' },
  { min: 20, max: 35, key: 'analysis.bpm' },
  { min: 35, max: 45, key: 'analysis.beat_grid' },
  { min: 45, max: 55, key: 'analysis.energy_profile' },
  { min: 55, max: 65, key: 'analysis.drops_phrases' },
  { min: 65, max: 70, key: 'analysis.sections' },
  { min: 70, max: 80, key: 'analysis.key' },
  { min: 80, max: 90, key: 'analysis.energy' },
  { min: 90, max: 95, key: 'analysis.cue_points' },
  { min: 95, max: 100, key: 'analysis.finalizing' },
];

interface AnalysisProgressProps {
  /** Track title being analyzed */
  trackTitle?: string;
  /** Progress percentage 0-100 */
  progress: number;
  /** Whether using local (desktop) or cloud analysis */
  isLocal?: boolean;
  /** Number of tracks in queue */
  queueSize?: number;
  /** Current queue position (1-based) */
  queuePosition?: number;
}

export default function AnalysisProgress({
  trackTitle,
  progress,
  isLocal = false,
  queueSize = 1,
  queuePosition = 1,
}: AnalysisProgressProps) {
  const { lang } = useLang();
  const pct = Math.min(100, Math.max(0, Math.round(progress)));
  const currentStep = ANALYSIS_STEPS.find(s => pct >= s.min && pct < s.max) || ANALYSIS_STEPS[ANALYSIS_STEPS.length - 1];

  // Color based on progress
  const getColor = () => {
    if (pct >= 90) return '#22c55e';
    if (pct >= 60) return '#3b82f6';
    if (pct >= 30) return '#8b5cf6';
    return '#6366f1';
  };
  const color = getColor();

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.05))',
        border: '1px solid rgba(99,102,241,0.15)',
      }}
    >
      <div className="px-4 py-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" style={{ color }} />
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              {tr('analysis.in_progress', lang)}
            </span>
            {isLocal && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/25 font-medium">
                {tr('analysis.local', lang)}
              </span>
            )}
            {!isLocal && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25 font-medium">
                {tr('analysis.cloud', lang)}
              </span>
            )}
          </div>
          <span className="text-xs font-mono font-bold" style={{ color }}>
            {pct}%
          </span>
        </div>

        {/* Track name */}
        {trackTitle && (
          <div className="text-[11px] text-[var(--text-secondary)] truncate font-medium">
            {trackTitle}
            {queueSize > 1 && (
              <span className="text-[var(--text-muted)] ml-1">
                ({queuePosition}/{queueSize})
              </span>
            )}
          </div>
        )}

        {/* Progress bar */}
        <div className="relative w-full h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${color}80, ${color})`,
              boxShadow: `0 0 8px ${color}40`,
            }}
          />
          {/* Shimmer effect */}
          {pct < 100 && (
            <div
              className="absolute inset-0 overflow-hidden rounded-full"
              style={{ width: `${pct}%` }}
            >
              <div
                className="h-full w-20 absolute top-0 animate-pulse"
                style={{
                  background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)`,
                  right: 0,
                }}
              />
            </div>
          )}
        </div>

        {/* Step labels */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--text-muted)]">
            {pct >= 100 ? '✓ ' + tr('analysis.done', lang) : tr(currentStep.key, lang)}
          </span>
          {/* Mini step indicators */}
          <div className="flex gap-0.5">
            {ANALYSIS_STEPS.map((s, i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full transition-all"
                style={{
                  background: pct >= s.max ? color : pct >= s.min ? `${color}60` : 'rgba(255,255,255,0.08)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
