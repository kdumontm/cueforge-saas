'use client';
import { useMemo, useState, useCallback, useRef } from 'react';
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
  currentPlayingCueId?: number; // Improvement #29: track currently playing cue
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

export default function HotCuesBar({ hotCues, onCueClick, currentPlayingCueId }: HotCuesBarProps) {
  // Improvement #30: Long-press handler for mobile
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState<number | null>(null);

  const handleTouchStart = useCallback((cueId: number | undefined) => {
    if (!cueId) return;
    longPressTimerRef.current = setTimeout(() => {
      setShowOptionsMenu(cueId);
    }, 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Improvement #33: Responsive padding based on window width
  const responsivePadding = useMemo(() => {
    if (typeof window !== 'undefined') {
      const width = window.innerWidth;
      if (width < 640) return '8px 12px';
      if (width < 1024) return '6px 16px';
      return '6px 18px';
    }
    return '6px 18px';
  }, []);

  return (
    <div className="flex items-center gap-1.5" style={{ padding: responsivePadding, paddingBottom: '12px' }}>
      <span className="text-[10px] text-[var(--text-muted)] font-mono mr-1 select-none">HOT CUES</span>
      {HOT_CUE_LABELS.map((label, i) => {
        const cue = hotCues.find(c => c.slot === i);
        const isLoop = cue?.cueType === 'loop';
        const cueName = cue?.name || cue?.label || '';
        const shortName = cueName.length > 10 ? cueName.slice(0, 8) + '…' : cueName;
        // Improvement #29: Check if this cue is currently playing
        const isPlaying = cue && currentPlayingCueId === cue.positionMs;

        return (
          <div key={i} className="flex-1 min-w-0 relative">
            {/* Improvement #31: Visual indication for empty slots */}
            {!cue && (
              <div
                className="absolute inset-0 rounded-[7px] border-2 border-dashed border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] opacity-40"
                style={{ pointerEvents: 'none' }}
              >
                <span className="text-[8px]">+</span>
              </div>
            )}

            <button
              onClick={() => cue && onCueClick?.(cue)}
              onTouchStart={() => handleTouchStart(cue?.positionMs)} // Improvement #30
              onTouchEnd={handleTouchEnd} // Improvement #30
              disabled={!cue}
              className={`relative w-full rounded-[7px] text-[10px] font-bold border-none transition-all overflow-hidden text-ellipsis whitespace-nowrap font-mono disabled:cursor-default group ${
                isPlaying ? 'animate-pulse' : '' // Improvement #29: pulsing animation
              }`}
              style={{
                padding: '5px 4px',
                background: cue ? HOT_CUE_COLORS[i] : 'var(--bg-elevated)',
                color: cue ? 'white' : 'var(--text-muted)',
                cursor: cue ? 'pointer' : 'default',
                // Improvement #32: Better disabled state with proper WCAG AA contrast
                opacity: cue ? 1 : 0.35,
                boxShadow: isPlaying
                  ? `0 0 12px ${HOT_CUE_COLORS[i]}, inset 0 0 8px ${HOT_CUE_COLORS[i]}40` // Improvement #29: pulsing border effect
                  : cue ? `0 2px 8px ${HOT_CUE_COLORS[i]}40` : 'none',
                filter: !cue ? 'grayscale(100%)' : 'grayscale(0%)',
                borderWidth: isPlaying ? '2px' : '0px',
                borderColor: isPlaying ? `${HOT_CUE_COLORS[i]}` : 'transparent',
              }}
              title={cue ? `${isLoop ? '🔁 Loop' : '🎯 Cue'} ${cueName} @ ${cue.time}${cue.confidence != null ? ` (${Math.round(cue.confidence * 100)}% confidence)` : ''}` : `Slot ${label} vide`}
              aria-label={
                cue
                  ? `${isLoop ? 'Loop' : 'Hot cue'} pad ${label}: ${cueName} at ${cue.time}${cue.confidence != null ? ` (${Math.round(cue.confidence * 100)}% confidence)` : ''}${isPlaying ? ', currently playing' : ''}`
                  : `Hot cue pad ${label} (empty)`
              }
              aria-pressed={cue ? 'false' : undefined}
            >
              {cue && <ConfidenceRing confidence={cue.confidence} />}

              <div className="flex items-center justify-center gap-0.5">
                {isLoop && <span className="text-[8px]">🔁</span>}
                <span className={isPlaying ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}>{label}</span>
              </div>
              {cue && (
                <div className="text-[8px] opacity-80 truncate leading-tight mt-px" title={cueName}>
                  {shortName || cue.time}
                </div>
              )}
              {cue && !shortName && <div className="text-[9px] opacity-85">{cue.time}</div>}
            </button>

            {/* Improvement #30: Mobile options menu on long-press */}
            {showOptionsMenu === cue?.positionMs && cue && (
              <div
                className="absolute top-full mt-1 right-0 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded shadow-lg z-10 text-xs"
                style={{ minWidth: '120px' }}
              >
                <button
                  className="block w-full text-left px-2 py-1.5 hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
                  onClick={() => {
                    onCueClick?.(cue);
                    setShowOptionsMenu(null);
                  }}
                >
                  Play
                </button>
                <button className="block w-full text-left px-2 py-1.5 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]">
                  Edit
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
