'use client';
import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { HOT_CUE_COLORS, HOT_CUE_LABELS, CUE_TYPE_BADGES, PAD_LAYOUTS, CUE_BANKS, REKORDBOX_PAD_COLORS, HAPTIC_PATTERNS, ANIMATION_DURATIONS } from '@/lib/constants';

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
  onCueDragReorder?: (fromIdx: number, toIdx: number) => void; // Improvement #41: drag reorder
  padLayout?: keyof typeof PAD_LAYOUTS; // Improvement #43: customizable layout
  performanceMode?: boolean; // Improvement #47: performance mode
  rekordboxMode?: boolean; // Improvement #48: rekordbox color mode
  bankIndex?: number; // Improvement #46: pad bank switching
  onBankChange?: (bankIdx: number) => void; // Improvement #46
  enableMidiMapping?: boolean; // Improvement #31: MIDI mapping display
  showQuickPreview?: boolean; // Improvement #38: pad preview on hover
  onLongPress?: (cueIdx: number) => void; // Improvement #34: quick-delete on long press
  customPadColors?: string[]; // Improvement #40: custom pad colors
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

/** Improvement #53: Cue type badge */
function CueTypeBadge({ cueType }: { cueType?: string }) {
  if (!cueType) return null;
  const badge = CUE_TYPE_BADGES[cueType as keyof typeof CUE_TYPE_BADGES];
  if (!badge) return null;
  return (
    <span
      className="absolute bottom-0.5 left-0.5 text-[6px] font-bold leading-none px-[2px] py-[0px] rounded"
      style={{
        background: `${badge.color}40`,
        color: badge.color,
        border: `0.5px solid ${badge.color}60`,
      }}
    >
      {badge.label}
    </span>
  );
}

/** Improvement #54: Haptic feedback trigger */
function triggerHaptic(pattern: number[] = HAPTIC_PATTERNS.tap) {
  if (typeof navigator !== 'undefined' && (navigator as any).vibrate) {
    (navigator as any).vibrate(pattern);
  }
}

export default function HotCuesBar({
  hotCues,
  onCueClick,
  currentPlayingCueId,
  onCueDragReorder,
  padLayout = '1x8',
  performanceMode = false,
  rekordboxMode = false,
  bankIndex = 0,
  onBankChange,
  enableMidiMapping = false,
  showQuickPreview = false,
  onLongPress,
  customPadColors,
}: HotCuesBarProps) {
  // Improvement #30: Long-press handler for mobile
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState<number | null>(null);

  // Improvement #41: Drag reorder state
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Improvement #42: Double-tap to set new cue
  const doubleTapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const doubleTapCountRef = useRef(0);

  // Improvement #47: LED feedback animation
  const [ledFlash, setLedFlash] = useState<number | null>(null);

  // Improvement #4: Ripple effect state
  const [ripples, setRipples] = useState<Array<{ id: string; x: number; y: number }>>([]);

  const createRipple = useCallback((e: React.MouseEvent, idx: number) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rippleId = `ripple-${Date.now()}-${idx}`;

    setRipples((prev) => [...prev, { id: rippleId, x, y }]);

    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== rippleId));
    }, ANIMATION_DURATIONS.normal);
  }, []);

  const handleTouchStart = useCallback((cueId: number | undefined) => {
    if (!cueId) return;
    longPressTimerRef.current = setTimeout(() => {
      setShowOptionsMenu(cueId);
      triggerHaptic(HAPTIC_PATTERNS.longpress);
    }, 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Improvement #42: Double-tap handler
  const handleDoubleTap = useCallback((cueId: number | undefined) => {
    if (!cueId) return;
    doubleTapCountRef.current++;

    if (doubleTapCountRef.current === 1) {
      doubleTapTimerRef.current = setTimeout(() => {
        doubleTapCountRef.current = 0;
      }, 300);
    } else if (doubleTapCountRef.current === 2) {
      doubleTapCountRef.current = 0;
      if (doubleTapTimerRef.current) clearTimeout(doubleTapTimerRef.current);
      triggerHaptic(HAPTIC_PATTERNS.doubletap);
      // Note: actual cue creation at current position would be handled by parent
    }
  }, []);

  // Improvement #47: Trigger LED flash animation
  const triggerLedFlash = useCallback((idx: number) => {
    setLedFlash(idx);
    setTimeout(() => setLedFlash(null), 300);
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

  // Improvement #43: Calculate grid layout
  const layout = PAD_LAYOUTS[padLayout as keyof typeof PAD_LAYOUTS] || PAD_LAYOUTS['1x8'];
  const isGridLayout = padLayout !== '1x8';

  // Improvement #49: CDJ-style button labels
  const getCDJLabel = (idx: number): string => {
    const baseLabel = HOT_CUE_LABELS[idx % 8];
    return bankIndex > 0 ? `${baseLabel}${CUE_BANKS[bankIndex]}` : baseLabel;
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Improvement #46: Bank switching buttons */}
      {isGridLayout && (
        <div className="flex gap-1 px-3">
          {CUE_BANKS.map((bank, idx) => (
            <button
              key={bank}
              onClick={() => {
                onBankChange?.(idx);
                triggerHaptic(HAPTIC_PATTERNS.tap);
              }}
              className={`px-2 py-1 text-[9px] font-bold rounded transition-all ${
                bankIndex === idx
                  ? 'bg-blue-500 text-white'
                  : 'bg-[var(--bg-hover)] text-[var(--text-secondary)]'
              }`}
            >
              Bank {bank}
            </button>
          ))}
        </div>
      )}

      {/* Improvement #47: Performance mode toggle and main pad area */}
      <div
        className={`flex gap-1.5 ${
          isGridLayout
            ? `grid gap-1.5 p-3`
            : 'items-center'
        }`}
        style={{
          padding: isGridLayout ? '12px' : responsivePadding,
          paddingBottom: isGridLayout ? '12px' : '12px',
          gridTemplateColumns: isGridLayout ? `repeat(${layout.cols}, 1fr)` : undefined,
          gridTemplateRows: isGridLayout ? `repeat(${layout.rows}, 1fr)` : undefined,
          gap: performanceMode ? '8px' : '6px',
        }}
      >
        {!isGridLayout && (
          <span className="text-[10px] text-[var(--text-muted)] font-mono mr-1 select-none">HOT CUES</span>
        )}
      <span className="text-[10px] text-[var(--text-muted)] font-mono mr-1 select-none">HOT CUES</span>
        {HOT_CUE_LABELS.map((label, i) => {
          const cue = hotCues.find(c => c.slot === i);
          const isLoop = cue?.cueType === 'loop';
          const cueName = cue?.name || cue?.label || '';
          const shortName = cueName.length > 10 ? cueName.slice(0, 8) + '…' : cueName;
          // Improvement #29: Check if this cue is currently playing
          const isPlaying = cue && currentPlayingCueId === cue.positionMs;
          const isDragging = dragFromIdx === i;
          const isDragOver = dragOverIdx === i;
          const isLedFlashing = ledFlash === i;

          // Improvement #48: Use Rekordbox colors if enabled, or custom colors
          const padColor = customPadColors?.[i] || (rekordboxMode && cue ? REKORDBOX_PAD_COLORS[i % REKORDBOX_PAD_COLORS.length] : (cue ? HOT_CUE_COLORS[i] : 'var(--bg-elevated)'));

          return (
            <div
              key={i}
              className={`relative ${isGridLayout ? 'w-full' : 'flex-1 min-w-0'}`}
              draggable={!!cue && isGridLayout}
              onDragStart={() => setDragFromIdx(i)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverIdx(i);
              }}
              onDragLeave={() => setDragOverIdx(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFromIdx !== null && dragFromIdx !== i) {
                  onCueDragReorder?.(dragFromIdx, i);
                }
                setDragFromIdx(null);
                setDragOverIdx(null);
              }}
              style={isDragOver ? { opacity: 0.7 } : {}}
            >
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
                onClick={(e) => {
                  if (cue) {
                    createRipple(e, i);
                    triggerLedFlash(i);
                    triggerHaptic(HAPTIC_PATTERNS.tap);
                    onCueClick?.(cue);
                  }
                }}
                onMouseEnter={() => {
                  if (showQuickPreview) setHoveredDetailsCue(i);
                }}
                onMouseLeave={() => {
                  if (showQuickPreview) setHoveredDetailsCue(null);
                }}
                onTouchStart={() => {
                  handleTouchStart(cue?.positionMs);
                  handleDoubleTap(cue?.positionMs);
                }}
                onTouchEnd={handleTouchEnd}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (cue) setShowOptionsMenu(cue.positionMs);
                }}
                disabled={!cue}
                className={`relative w-full rounded-[7px] text-[10px] font-bold border-none transition-all overflow-hidden text-ellipsis whitespace-nowrap font-mono disabled:cursor-default group ${
                  isPlaying ? 'animate-pulse' : '' // Improvement #29: pulsing animation
                } ${
                  performanceMode ? 'min-h-[48px]' : 'min-h-[36px]'
                } ${
                  isDragging ? 'opacity-50' : ''
                }`}
                style={{
                  padding: performanceMode ? '8px 6px' : '5px 4px',
                  background: padColor,
                  color: cue ? 'white' : 'var(--text-muted)',
                  cursor: cue ? 'pointer' : 'default',
                  opacity: cue ? 1 : 0.35,
                  boxShadow: isLedFlashing
                    ? `0 0 16px ${padColor}, inset 0 0 12px ${padColor}60` // Improvement #47: LED flash
                    : isPlaying
                    ? `0 0 12px ${padColor}, inset 0 0 8px ${padColor}40`
                    : cue ? `0 2px 8px ${padColor}40` : 'none',
                  filter: !cue ? 'grayscale(100%)' : 'grayscale(0%)',
                  borderWidth: isPlaying ? '2px' : '0px',
                  borderColor: isPlaying ? padColor : 'transparent',
                  transition: `all ${ANIMATION_DURATIONS.fast}ms ease-in-out`,
                }}
                aria-label={
                  cue
                    ? `${isLoop ? 'Loop' : 'Hot cue'} pad ${getCDJLabel(i)}: ${cueName} at ${cue.time}${cue.confidence != null ? ` (${Math.round(cue.confidence * 100)}% confidence)` : ''}${isPlaying ? ', currently playing' : ''}`
                    : `Hot cue pad ${getCDJLabel(i)} (empty)`
                }
                aria-pressed={cue ? 'false' : undefined}
              >
                {/* Improvement #4: Ripple effect elements */}
                {ripples.map((ripple) => (
                  <span
                    key={ripple.id}
                    style={{
                      position: 'absolute',
                      left: ripple.x,
                      top: ripple.y,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(255,255,255,0.5)',
                      pointerEvents: 'none',
                      animation: `ripple ${ANIMATION_DURATIONS.normal}ms ease-out`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                ))}
                <style>{`
                  @keyframes ripple {
                    to {
                      transform: translate(-50%, -50%) scale(4);
                      opacity: 0;
                    }
                  }
                `}</style>
                {cue && <ConfidenceRing confidence={cue.confidence} />}
                {/* Improvement #53: Cue type badge */}
                {cue && <CueTypeBadge cueType={cue.cueType} />}

                <div className="flex items-center justify-center gap-0.5">
                  {isLoop && <span className="text-[8px]">🔁</span>}
                  <span className={isPlaying ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}>
                    {getCDJLabel(i)}
                  </span>
                </div>
                {cue && (
                  <div className="text-[8px] opacity-80 truncate leading-tight mt-px" title={cueName}>
                    {shortName || cue.time}
                  </div>
                )}
                {cue && !shortName && <div className="text-[9px] opacity-85">{cue.time}</div>}

                {/* Improvement #52: Loop length display */}
                {isLoop && cue.endPositionMs && (
                  <div className="text-[7px] opacity-70">
                    {Math.round((cue.endPositionMs - (cue.positionMs ?? 0)) / 1000 / (60 / ((cue as any).bpm ?? 120) / 4))} bars
                  </div>
                )}
              </button>

              {/* Improvement #38: Pad preview tooltip on hover */}
              {showQuickPreview && cue && hoveredDetailsCue === i && (
                <div
                  className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded px-2 py-1 text-[8px] whitespace-nowrap z-20"
                  style={{ pointerEvents: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
                >
                  {cue.name || cue.label} @ {cue.time}
                </div>
              )}

              {/* Improvement #31: MIDI mapping display */}
              {enableMidiMapping && cue && (
                <div className="text-[6px] opacity-60 font-mono mt-0.5">
                  MIDI: CC{1 + i}
                </div>
              )}

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
                  <button
                    className="block w-full text-left px-2 py-1.5 hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                    onClick={() => {
                      onLongPress?.(i);
                      setShowOptionsMenu(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
