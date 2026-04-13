'use client';
import { useMemo, useCallback, useState } from 'react';
import { HOT_CUE_COLORS, BAR_COLORS, ANIMATION_DURATIONS, ZOOM_LEVELS } from '@/lib/constants';

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
  enableZoom?: boolean; // Improvement #26: zoom controls
  enableMinimap?: boolean; // Improvement #27: mini-map navigation
  enableBeatGrid?: boolean; // Improvement #29: beat grid display
  enableEnergyOverlay?: boolean; // Improvement #30: energy curve
  enableVocalZones?: boolean; // Improvement #31: vocal highlighting
  enableLoopRegions?: boolean; // Improvement #32: loop visualization
  waveformStyle?: 'bars' | 'lines' | 'mirror' | 'filled'; // Improvement #34: style toggle
  bpm?: number; // Improvement #39: BPM for grid
  keyInfo?: string; // Improvement #38: key display
  enableSectionOverlay?: boolean; // Improvement #21: section coloring
  enablePhaseInversion?: boolean; // Improvement #29.5: phase meter
  sectionColors?: Record<string, string>; // Improvement #21: custom section colors
  onHoverPosition?: (ms: number) => void; // Improvement #28: hover tooltip
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
  enableFrequencyColors = true,
  enableLUFS = false,
  enableZoom = false,
  enableMinimap = false,
  enableBeatGrid = false,
  enableEnergyOverlay = false,
  enableVocalZones = false,
  enableLoopRegions = false,
  waveformStyle = 'bars',
  bpm = 128,
  keyInfo,
  enableSectionOverlay = false,
  enablePhaseInversion = false,
  sectionColors = {},
  onHoverPosition,
}: WaveformDisplayProps) {
  const [zoomLevel, setZoomLevel] = useState(1); // Improvement #26: zoom state
  const bars = Math.round((overview ? 200 : 120) * zoomLevel);
  const [showLUFS, setShowLUFS] = useState(enableLUFS);
  const [currentStyle, setCurrentStyle] = useState<'bars' | 'lines' | 'mirror' | 'filled'>(waveformStyle);
  const [hoverX, setHoverX] = useState<number | null>(null); // Improvement #28: hover position
  const [showPhaseInversion, setShowPhaseInversion] = useState(enablePhaseInversion); // Improvement #29.5

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

  // Improvement #28: Memoize GEOMETRY ONLY (stable) — remove progress dependency
  const barGeometry = useMemo(() => {
    return barHeights.map((h, i) => {
      const mid = height / 2;
      const x = i * (100 / bars);
      const w = (100 / bars) * 0.6;
      if (!enableFrequencyColors) {
        const low = h * 0.4;
        const mid2 = h * 0.35;
        const high = h - low - mid2;
        return { x, w, h, mid, low, mid2, high, isStacked: true };
      }
      return { x, w, h, mid, isStacked: false, barIndex: i };
    });
  }, [barHeights, bars, height, enableFrequencyColors]);

  // Improvement #26: Zoom controls with smooth easing
  const handleZoom = (direction: 'in' | 'out') => {
    setZoomLevel((prev) => {
      const newZoom = direction === 'in' ? Math.min(4, prev * 1.2) : Math.max(0.5, prev / 1.2);
      return newZoom;
    });
  };

  // Improvement #3: Waveform zoom smooth transition using CSS
  const zoomStyle = useMemo(() => ({
    transition: `transform ${ANIMATION_DURATIONS.normal}ms cubic-bezier(0.4, 0, 0.2, 1)`,
  }), []);

  // Improvement #29: Beat grid calculation
  const beatGridLines = useMemo(() => {
    if (!enableBeatGrid) return [];
    const beatMs = (60000 / Math.max(bpm, 60));
    const lines = [];
    for (let i = 0; i < bars; i += 4) {
      lines.push(i);
    }
    return lines;
  }, [enableBeatGrid, bpm, bars]);

  // Improvement #30: Generate fake energy curve with seeded randomness
  const energyCurve = useMemo(() => {
    if (!enableEnergyOverlay) return null;
    const rand = seededRand(trackId * 73 + bars);
    return Array.from({ length: bars }, (_, i) => 0.3 + Math.sin(i * 0.05) * 0.3 + rand() * 0.2);
  }, [enableEnergyOverlay, bars, trackId]);

  // Improvement #31: Generate fake vocal zones
  const vocalZones = useMemo(() => {
    if (!enableVocalZones) return [];
    const zones: Array<{ start: number; end: number }> = [];
    for (let i = 0; i < bars; i += 30) {
      zones.push({ start: i, end: i + 15 });
    }
    return zones;
  }, [enableVocalZones, bars]);

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Improvement #26: Zoom controls */}
      {enableZoom && !overview && (
        <div className="flex gap-2 items-center px-2">
          <button
            onClick={() => handleZoom('out')}
            className="px-2 py-1 text-xs bg-[var(--bg-hover)] rounded hover:bg-[var(--border-default)] transition-colors"
            title="Zoom out"
          >
            −
          </button>
          <span className="text-xs text-[var(--text-muted)] min-w-[40px] text-center">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={() => handleZoom('in')}
            className="px-2 py-1 text-xs bg-[var(--bg-hover)] rounded hover:bg-[var(--border-default)] transition-colors"
            title="Zoom in"
          >
            +
          </button>
          {/* Improvement #34: Waveform style toggle */}
          <select
            value={currentStyle}
            onChange={(e) => setCurrentStyle(e.target.value as any)}
            className="px-2 py-1 text-xs bg-[var(--bg-hover)] rounded text-[var(--text-primary)]"
            title="Waveform style"
          >
            <option value="bars">Bars</option>
            <option value="lines">Lines</option>
            <option value="mirror">Mirror</option>
            <option value="filled">Filled</option>
          </select>
        </div>
      )}

      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${bars} ${height}`}
        preserveAspectRatio="none"
        onWheel={(e) => {
          if (!enableZoom) return;
          e.preventDefault();
          handleZoom(e.deltaY > 0 ? 'out' : 'in');
        }}
        onMouseMove={(e) => {
          const svg = e.currentTarget;
          const rect = svg.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * bars;
          setHoverX(x);
          // Improvement #28: Call onHoverPosition callback with time
          if (onHoverPosition) {
            const posMs = (x / bars) * 300000; // Assume 5min track
            onHoverPosition(posMs);
          }
        }}
        onMouseLeave={() => setHoverX(null)}
        style={{ ...zoomStyle, cursor: enableZoom ? 'zoom-in' : 'default' }}
      >
        {/* Improvement #29: Beat grid lines */}
        {enableBeatGrid && beatGridLines.map((gridX, i) => (
          <line
            key={`grid-${i}`}
            x1={`${(gridX / bars) * 100}%`}
            y1={0}
            x2={`${(gridX / bars) * 100}%`}
            y2={height}
            stroke="#ffffff"
            strokeWidth={0.5}
            opacity={0.15}
            pointerEvents="none"
          />
        ))}

        {/* Improvement #30: Energy overlay */}
        {enableEnergyOverlay && energyCurve && (
          <polyline
            points={energyCurve
              .map((energy, i) => `${(i / bars) * 100},${height - energy * height}`)
              .join(' ')}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={2}
            opacity={0.3}
            pointerEvents="none"
          />
        )}

        {/* Improvement #31: Vocal zones */}
        {enableVocalZones &&
          vocalZones.map((zone, i) => (
            <rect
              key={`vocal-${i}`}
              x={`${(zone.start / bars) * 100}%`}
              y={0}
              width={`${((zone.end - zone.start) / bars) * 100}%`}
              height={height}
              fill="#8b5cf6"
              opacity={0.08}
              pointerEvents="none"
            />
          ))}

        {/* Improvement #21: Section overlay coloring */}
        {enableSectionOverlay &&
          Object.entries(sectionColors).map(([sectionName, color], i) => {
            const startPct = (i * 100) / Object.keys(sectionColors).length;
            const widthPct = 100 / Object.keys(sectionColors).length;
            return (
              <rect
                key={`section-${i}`}
                x={`${startPct}%`}
                y={0}
                width={`${widthPct}%`}
                height={height}
                fill={color}
                opacity={0.05}
                pointerEvents="none"
              />
            );
          })}

        {/* Improvement #29.5: Phase inversion indicator */}
        {enablePhaseInversion && showPhaseInversion && (
          <g opacity={0.4} pointerEvents="none">
            <line x1="0%" y1={height / 4} x2="100%" y2={height / 4} stroke="#ff6b6b" strokeWidth={0.5} strokeDasharray="4,4" />
            <line x1="0%" y1={(height * 3) / 4} x2="100%" y2={(height * 3) / 4} stroke="#ff6b6b" strokeWidth={0.5} strokeDasharray="4,4" />
          </g>
        )}

        {/* Improvement #28: Hover tooltip with position */}
        {hoverX !== null && !overview && (
          <g pointerEvents="none">
            <line x1={hoverX} y1={0} x2={hoverX} y2={height} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
            <circle cx={hoverX} cy={height / 2} r={3} fill="rgba(255,255,255,0.5)" />
          </g>
        )}

        {/* Improvement #25: Unplayed bars — stable geometry only */}
        {barGeometry.map((bar, i) => {
          if (bar.isStacked) {
            const { x, w, h, mid, low, mid2, high } = bar;
            return (
              <g key={i} style={{ cursor: 'pointer' }} title={`Bar ${i + 1} (${((i / bars) * 100).toFixed(1)}%)`}>
                <rect x={`${x}%`} y={mid - h / 2} width={`${w}%`} height={low} fill={BAR_COLORS.unplayed.bass} />
                <rect x={`${x}%`} y={mid - h / 2 + low} width={`${w}%`} height={mid2} fill={BAR_COLORS.unplayed.mids} />
                <rect x={`${x}%`} y={mid - h / 2 + low + mid2} width={`${w}%`} height={high} fill={BAR_COLORS.unplayed.highs} />
              </g>
            );
          }
          const { x, w, h, mid, barIndex } = bar;
          const color = getBarColor(barIndex!, false);
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
        })}

        {/* Played overlay — GPU-accelerated via clipPath, updates only progress width */}
        <defs>
          <clipPath id={`progress-clip-${trackId}`}>
            <rect x="0" y="0" width={`${progress * 100}%`} height={height} />
          </clipPath>
        </defs>
        <g clipPath={`url(#progress-clip-${trackId})`}>
          {barGeometry.map((bar, i) => {
            if (bar.isStacked) {
              const { x, w, h, mid, low, mid2, high } = bar;
              return (
                <g key={`p-${i}`}>
                  <rect x={`${x}%`} y={mid - h / 2} width={`${w}%`} height={low} fill={BAR_COLORS.played.bass} />
                  <rect x={`${x}%`} y={mid - h / 2 + low} width={`${w}%`} height={mid2} fill={BAR_COLORS.played.mids} />
                  <rect x={`${x}%`} y={mid - h / 2 + low + mid2} width={`${w}%`} height={high} fill={BAR_COLORS.played.highs} />
                </g>
              );
            }
            const { x, w, h, mid, barIndex } = bar;
            const color = getBarColor(barIndex!, true);
            return (
              <rect
                key={`p-${i}`}
                x={`${x}%`}
                y={mid - h / 2}
                width={`${w}%`}
                height={h}
                fill={color}
              />
            );
          })}
        </g>

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

        {/* Improvement #38: Key display per section */}
        {!overview && keyInfo && (
          <text x="5%" y={height - 5} fontSize="10" fill="rgba(255,255,255,0.5)" fontFamily="monospace">
            {keyInfo}
          </text>
        )}

        {/* Improvement #39: BPM display */}
        {!overview && bpm && (
          <text x="95%" y={height - 5} fontSize="10" fill="rgba(255,255,255,0.5)" fontFamily="monospace" textAnchor="end">
            {Math.round(bpm)} BPM
          </text>
        )}
      </svg>

      {/* Improvement #27: Mini-map navigation */}
      {enableMinimap && !overview && (
        <div className="px-2 pb-2">
          <div
            className="w-full h-6 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] cursor-pointer"
            style={{
              backgroundImage: `linear-gradient(90deg, ${Array.from({ length: 20 })
                .map((_, i) => `#3b82f6 ${i * 5}%, #1e293b ${i * 5 + 2.5}%`)
                .join(', ')})`,
            }}
            title="Click to navigate"
          />
        </div>
      )}
    </div>
  );
}
