'use client';
import { HOT_CUE_COLORS, HOT_CUE_LABELS } from '@/lib/constants';

interface HotCue {
  slot: number;
  time: string;
  label: string;
  positionMs?: number;
  cueType?: string;
  endPositionMs?: number | null;
  confidence?: number | null;
  name?: string;
}

interface HotCuesBarProps {
  hotCues: HotCue[];
  onCueClick?: (cue: HotCue) => void;
}

/** Petit indicateur de qualité du cue point (visible sur le pad) */
function ConfidenceRing({ confidence }: { confidence?: number | null }) {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  // Couleur selon la confiance
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#eab308' : pct >= 40 ? '#f97316' : '#ef4444';
  return (
    <span
      className="absolute top-0.5 right-0.5 text-[7px] font-bold leading-none px-[3px] py-[1px] rounded-full"
      style={{
        background: `${color}30`,
        color,
        border: `1px solid ${color}50`,
      }}
    >
      {pct}
    </span>
  );
}

export default function HotCuesBar({ hotCues, onCueClick }: HotCuesBarProps) {
  return (
    <div className="flex items-center gap-1.5 px-[18px] py-[6px] pb-3">
      <span className="text-[10px] text-[var(--text-muted)] font-mono mr-1 select-none">HOT CUES</span>
      {HOT_CUE_LABELS.map((label, i) => {
        const cue = hotCues.find(c => c.slot === i);
        const isLoop = cue?.cueType === 'loop';
        const cueName = cue?.name || cue?.label || '';
        // Nom court pour le pad (max 8 chars)
        const shortName = cueName.length > 10 ? cueName.slice(0, 8) + '…' : cueName;
        return (
          <div key={i} className="flex-1 min-w-0">
            <button
              onClick={() => cue && onCueClick?.(cue)}
              disabled={!cue}
              className="relative w-full rounded-[7px] text-[10px] font-bold border-none transition-all overflow-hidden text-ellipsis whitespace-nowrap font-mono disabled:cursor-default group"
              style={{
                padding: '5px 4px',
                background: cue ? HOT_CUE_COLORS[i] : 'var(--bg-elevated)',
                color: cue ? 'white' : 'var(--text-muted)',
                cursor: cue ? 'pointer' : 'default',
                opacity: cue ? 1 : 0.5,
                boxShadow: cue ? `0 2px 8px ${HOT_CUE_COLORS[i]}40` : 'none',
              }}
              title={cue ? `${isLoop ? '🔁 Loop' : '🎯 Cue'} ${cueName} @ ${cue.time}${cue.confidence != null ? ` (${Math.round(cue.confidence * 100)}% confidence)` : ''}` : `Slot ${label} vide`}
              // Improvement #15: Add ARIA labels for accessibility
              aria-label={
                cue
                  ? `${isLoop ? 'Loop' : 'Hot cue'} pad ${label}: ${cueName} at ${cue.time}${cue.confidence != null ? ` (${Math.round(cue.confidence * 100)}% confidence)` : ''}`
                  : `Hot cue pad ${label} (empty)`
              }
              aria-pressed={cue ? 'false' : undefined}
            >
              {/* Confidence ring en haut à droite */}
              {cue && <ConfidenceRing confidence={cue.confidence} />}

              <div className="flex items-center justify-center gap-0.5">
                {isLoop && <span className="text-[8px]">🔁</span>}
                <span className="group-hover:scale-110 transition-transform">{label}</span>
              </div>
              {/* Nom intelligent du cue sous le label */}
              {cue && (
                <div className="text-[8px] opacity-80 truncate leading-tight mt-px" title={cueName}>
                  {shortName || cue.time}
                </div>
              )}
              {cue && !shortName && <div className="text-[9px] opacity-85">{cue.time}</div>}
            </button>
          </div>
        );
      })}
    </div>
  );
}
