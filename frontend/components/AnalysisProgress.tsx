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
      className="rounded-lg overflow-hidden shadow-lg backdrop-blur-sm"
      style={{
        background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.92))',
        border: '1px solid rgba(99,102,241,0.2)',
      }}
    >
      <div className="px-3 py-2 space-y-1.5">
        {/* Header row: label + badge + percentage */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Loader2 size={11} className="animate-spin" style={{ color }} />
            <span className="text-[10px] font-semibold text-[var(--text-primary)]">
              {tr('analysis.in_progress', lang)}
            </span>
            <span className={`text-[8px] px-1 py-px rounded-full font-medium ${
              isLocal
                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/25'
                : 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
            }`}>
              {isLocal ? tr('analysis.local', lang) : tr('analysis.cloud', lang)}
            </span>
          </div>
          <span className="text-[10px] font-mono font-bold" style={{ color }}>
            {pct}%
          </span>
        </div>

        {/* Track name */}
        {trackTitle && (
          <div className="text-[9px] text-[var(--text-muted)] truncate">
            {trackTitle}
            {queueSize > 1 && (
              <span className="ml-1 opacity-60">
                ({queuePosition}/{queueSize})
              </span>
            )}
          </div>
        )}

        {/* Progress bar — compact */}
        <div className="relative w-full h-1.5 bg-[var(--bg-primary)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${color}80, ${color})`,
              boxShadow: `0 0 6px ${color}30`,
            }}
          />
        </div>

        {/* Step label */}
        <div className="text-[9px] text-[var(--text-muted)]">
          {pct >= 100 ? '✓ ' + tr('analysis.done', lang) : tr(currentStep.key, lang)}
        </div>
      </div>
    </div>
  );
}
