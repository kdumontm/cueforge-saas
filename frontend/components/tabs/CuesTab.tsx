// @ts-nocheck
'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Track, CuePoint } from '@/types';
import { HOT_CUE_COLORS, HOT_CUE_LABELS, formatTimeMs, ANIMATION_DURATIONS, KEYBOARD_SHORTCUTS, CUE_QUALITY_GRADES, CUE_GROUPING_OPTIONS, CUE_TEMPLATE_PRESETS } from '@/lib/constants';
import { Trash2, Plus, GripVertical, ChevronDown, Zap, Play, Square, Copy, Move, Search, ArrowUpDown, RotateCcw } from 'lucide-react';
import { useLang } from '@/components/LangProvider';
import { tr } from '@/lib/i18n';
// Accessibility
import { announceCue } from '@/lib/accessibility';

const CUE_TYPES = [
  { value: 'hot_cue',   label: 'Hot Cue',   icon: '🎯', color: '#22c55e' },
  { value: 'loop',      label: 'Loop',       icon: '🔁', color: '#3b82f6' },
  { value: 'fade_in',   label: 'Fade In',    icon: '⬆️', color: '#f59e0b' },
  { value: 'fade_out',  label: 'Fade Out',   icon: '⬇️', color: '#f97316' },
  { value: 'drop',      label: 'Drop',       icon: '💥', color: '#ef4444' },
  { value: 'phrase',    label: 'Phrase',     icon: '🎵', color: '#8b5cf6' },
  { value: 'section',   label: 'Section',    icon: '📍', color: '#06b6d4' },
  { value: 'load',      label: 'Load Point', icon: '📌', color: '#ec4899' },
];

const SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

// ═══ Helper Components ═══

const ConfidenceDot = ({ confidence }: { confidence?: number | null }) => {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#eab308' : pct >= 40 ? '#f97316' : '#ef4444';
  return (
    <span className="inline-flex items-center gap-0.5 ml-1.5">
      <span style={{ color, fontSize: 8 }}>●</span>
      <span className="text-[9px] tabular-nums" style={{ color: `${color}aa` }}>{pct}%</span>
    </span>
  );
};

const CueTypeBadge = ({ type, color }: { type: string; color?: string }) => {
  const typeConfig: Record<string, { label: string; bg: string }> = {
    drop: { label: 'DROP', bg: 'rgba(239,68,68,0.2)' },
    section: { label: 'SEC', bg: 'rgba(59,130,246,0.2)' },
    phrase: { label: 'PHR', bg: 'rgba(34,197,94,0.2)' },
    hot_cue: { label: 'CUE', bg: 'rgba(99,102,241,0.2)' },
    loop: { label: 'LOOP', bg: 'rgba(6,182,212,0.2)' },
    build: { label: 'BLD', bg: 'rgba(255,140,0,0.2)' },
    fade_in: { label: 'FADE↑', bg: 'rgba(245,158,11,0.2)' },
    fade_out: { label: 'FADE↓', bg: 'rgba(249,115,22,0.2)' },
    load: { label: 'LOAD', bg: 'rgba(236,72,153,0.2)' },
  };
  const config = typeConfig[type] || { label: type?.slice(0, 3).toUpperCase() || 'CUE', bg: 'rgba(255,255,255,0.1)' };
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
      style={{ background: config.bg, color: color || '#fff' }}
    >
      {config.label}
    </span>
  );
};

interface CuesTabProps {
  track: Track | null;
  cuePoints?: CuePoint[];
  onCreateCue?: (cue: { name: string; position_ms: number; color: string; cue_type: string; number?: number; end_position_ms?: number }) => void;
  onDeleteCue?: (cueId: number) => void;
  onCueClick?: (cue: CuePoint) => void;
  onPreviewCue?: (cue: CuePoint) => void;
  onRegenerateCues?: () => void;
  initialPositionMs?: number | null;
  playerRef?: React.MutableRefObject<{ seekTo?: (ms: number) => void; play?: () => void; pause?: () => void } | null>;
  onUpdateCue?: (cueId: number, updates: Partial<CuePoint>) => void; // Improvement #11, #12
}

export function CuesTab({
  track,
  cuePoints = [],
  onCreateCue,
  onDeleteCue,
  onCueClick,
  onPreviewCue,
  onRegenerateCues,
  initialPositionMs,
  playerRef,
  onUpdateCue,
}: CuesTabProps) {
  const { lang } = useLang();
  const [localOrder, setLocalOrder] = useState<number[]>([]);
  const cueListRef = useRef<HTMLDivElement>(null);
  const [selectedCueForScroll, setSelectedCueForScroll] = useState<number | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [showLoadingSkeleton, setShowLoadingSkeleton] = useState(false);

  // Improvement #13: Inline editing state
  const [editingCueId, setEditingCueId] = useState<number | null>(null);
  const [editingCueName, setEditingCueName] = useState<string>('');

  // Improvement #14: Context menu state for right-click actions
  const [contextMenuCueId, setContextMenuCueId] = useState<number | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Improvement #15: Cue grouping
  const [groupingMode, setGroupingMode] = useState<keyof typeof CUE_GROUPING_OPTIONS>('none');

  // Improvement #16: Template save
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);

  // Improvement #1: Undo/redo for cue operations (keep last 10 states)
  const [undoStack, setUndoStack] = useState<number[][]>([]);
  const [redoStack, setRedoStack] = useState<number[][]>([]);

  // Improvement #15: Prefers reduced motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const pushUndoState = useCallback((state: number[]) => {
    setUndoStack((prev) => [...prev.slice(-9), state]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previousState = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, localOrder]);
    setLocalOrder(previousState);
    setUndoStack((prev) => prev.slice(0, -1));
  }, [undoStack, localOrder]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    pushUndoState(localOrder);
    setLocalOrder(nextState);
    setRedoStack((prev) => prev.slice(0, -1));
  }, [redoStack, localOrder, pushUndoState]);

  // Improvement #2: Search/filter input
  const [searchFilter, setSearchFilter] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);

  // Improvement #3: Bulk delete functionality
  const [selectedCueIds, setSelectedCueIds] = useState<Set<number>>(new Set());
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);

  // Improvement #4: Sort by options (now with secondary sort)
  const [sortBy, setSortBy] = useState<'position' | 'name' | 'type' | 'confidence'>('position');
  const [secondarySortBy, setSecondarySortBy] = useState<'position' | 'name' | 'type' | 'confidence' | null>(null);

  // Improvement #5: Export selection
  const [exportMode, setExportMode] = useState(false);

  // Improvement #8: Cue statistics
  const cueStats = useMemo(() => {
    const stats = {
      total: cuePoints.length,
      byType: {} as Record<string, number>,
      avgConfidence: 0,
      confidenceMin: 0,
      confidenceMax: 0,
    };

    if (cuePoints.length === 0) return stats;

    const confidences: number[] = [];
    cuePoints.forEach(c => {
      const type = c.cue_type || 'hot_cue';
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      if (c.confidence != null) confidences.push(c.confidence);
    });

    if (confidences.length > 0) {
      stats.avgConfidence = confidences.reduce((a, b) => a + b) / confidences.length;
      stats.confidenceMin = Math.min(...confidences);
      stats.confidenceMax = Math.max(...confidences);
    }

    return stats;
  }, [cuePoints]);

  // Improvement #16: Confidence threshold filter
  const [confidenceThreshold, setConfidenceThreshold] = useState(0);

  // Improvement #17: Density heatmap — visual indicator of cue concentration
  const [showDensityHeatmap, setShowDensityHeatmap] = useState(false);

  // Improvement #20: Pinned cues
  const [pinnedCueIds, setPinnedCueIds] = useState<Set<number>>(new Set());

  // Improvement #21: Cue notes/comments
  const [cueNotes, setCueNotes] = useState<Map<number, string>>(new Map());
  const [notesCueId, setNotesCueId] = useState<number | null>(null);

  // Improvement #25: Collapsible cue details
  const [expandedCueIds, setExpandedCueIds] = useState<Set<number>>(new Set());

  // Improvement #10: Debounce rapid cue creation
  const createDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Improvement #14: Progress indicator during regeneration
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Improvement #13: Memoize expensive calculations
  const getBarNumber = useMemo(() => {
    return (posMs: number): number => {
      const bpm = (track?.analysis?.bpm ?? (track as any)?.bpm) ?? 128;
      const barMs = (60000 / Math.max(bpm, 60)) * 4;
      return Math.floor(posMs / barMs) + 1;
    };
  }, [track?.analysis?.bpm, track?.bpm]);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCueName, setNewCueName] = useState('');
  const [newCueType, setNewCueType] = useState('hot_cue');
  const [newCueSlot, setNewCueSlot] = useState<number>(0);
  const [newCueColor, setNewCueColor] = useState(HOT_CUE_COLORS[0]);
  const [loopDurationSec, setLoopDurationSec] = useState<number>(4);
  const [hoveredCue, setHoveredCue] = useState<number | null>(null);
  const [hoveredDetailsCue, setHoveredDetailsCue] = useState<number | null>(null); // Improvement #13: tooltip

  // Improvement #13: Memoize cue indices calculation
  const indices = useMemo(() => {
    return localOrder.length === cuePoints.length
      && localOrder.every(i => i < cuePoints.length)
      ? localOrder
      : cuePoints.map((_, i) => i);
  }, [localOrder, cuePoints.length]);

  // Improvement #2: Filter and sort cues based on user input
  const filteredIndices = useMemo(() => {
    let filtered = [...indices];

    // Apply search filter
    if (searchFilter.trim()) {
      const query = searchFilter.toLowerCase();
      filtered = filtered.filter((idx) => {
        const cue = cuePoints[idx];
        return (
          (cue?.name || '').toLowerCase().includes(query) ||
          (cue?.cue_type || '').toLowerCase().includes(query)
        );
      });
    }

    // Apply type filter
    if (filterType) {
      filtered = filtered.filter((idx) => cuePoints[idx]?.cue_type === filterType);
    }

    // Improvement #16: Apply confidence threshold filter
    if (confidenceThreshold > 0) {
      filtered = filtered.filter((idx) => {
        const conf = cuePoints[idx]?.confidence ?? 0;
        return conf >= confidenceThreshold;
      });
    }

    // Apply sorting with primary + secondary sort (Improvement #24)
    filtered.sort((aIdx, bIdx) => {
      const cueA = cuePoints[aIdx];
      const cueB = cuePoints[bIdx];
      if (!cueA || !cueB) return 0;

      // Improvement #20: Pinned cues come first
      const aPinned = pinnedCueIds.has(cueA.id) ? 0 : 1;
      const bPinned = pinnedCueIds.has(cueB.id) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;

      // Primary sort
      let primaryCmp = 0;
      switch (sortBy) {
        case 'name':
          primaryCmp = (cueA.name || '').localeCompare(cueB.name || '');
          break;
        case 'type':
          primaryCmp = (cueA.cue_type || '').localeCompare(cueB.cue_type || '');
          break;
        case 'confidence':
          primaryCmp = (cueB.confidence || 0) - (cueA.confidence || 0);
          break;
        case 'position':
        default:
          primaryCmp = (cueA.position_ms || 0) - (cueB.position_ms || 0);
      }

      if (primaryCmp !== 0 && secondarySortBy) return primaryCmp;

      // Secondary sort
      if (secondarySortBy && primaryCmp === 0) {
        switch (secondarySortBy) {
          case 'name':
            return (cueA.name || '').localeCompare(cueB.name || '');
          case 'type':
            return (cueA.cue_type || '').localeCompare(cueB.cue_type || '');
          case 'confidence':
            return (cueB.confidence || 0) - (cueA.confidence || 0);
          case 'position':
            return (cueA.position_ms || 0) - (cueB.position_ms || 0);
        }
      }

      return primaryCmp;
    });

    // Improvement #15: Apply grouping (optional)
    if (groupingMode === 'byType') {
      filtered.sort((aIdx, bIdx) => {
        const typeA = cuePoints[aIdx]?.cue_type || 'hot_cue';
        const typeB = cuePoints[bIdx]?.cue_type || 'hot_cue';
        return typeA.localeCompare(typeB);
      });
    }

    return filtered;
  }, [indices, cuePoints, searchFilter, filterType, sortBy, secondarySortBy, confidenceThreshold, pinnedCueIds, groupingMode]);

  const cues = indices.map(i => cuePoints[i]);

  useEffect(() => {
    setLocalOrder(cuePoints.map((_, i) => i));
  }, [cuePoints.length]);

  // Improvement #6: Keyboard shortcut Ctrl+Z for undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.key !== 'z') return;

      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Ctrl+Y or Cmd+Shift+Z for redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }

      // Keyboard shortcuts: 1-8 to jump to cues
      const num = parseInt(e.key);
      if (num >= 1 && num <= 8 && !(e.target instanceof HTMLInputElement)) {
        const cue = cuePoints[filteredIndices[num - 1]];
        if (cue && onCueClick) {
          onCueClick(cue);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredIndices, cuePoints, onCueClick, handleUndo, handleRedo]);

  // Improvement #1: Smooth scroll to cue on selection
  const smoothScrollToCue = useCallback((cueId: number) => {
    if (!cueListRef.current) return;
    const cueElement = cueListRef.current.querySelector(`[data-cue-id="${cueId}"]`);
    if (cueElement) {
      const duration = prefersReducedMotion ? 0 : ANIMATION_DURATIONS.normal;
      cueElement.scrollIntoView({
        behavior: duration > 0 ? 'smooth' : 'auto',
        block: 'nearest',
      });
      // Announcement for screen readers
      announceCue(`Scrolled to cue ${cueId}`);
    }
  }, [prefersReducedMotion]);

  // Improvement #13: Handle inline editing
  const handleStartEdit = useCallback((cue: CuePoint) => {
    setEditingCueId(cue.id);
    setEditingCueName(cue.name || '');
  }, []);

  const handleSaveEdit = useCallback((cueId: number) => {
    if (editingCueName.trim()) {
      onUpdateCue?.(cueId, { name: editingCueName.trim() });
    }
    setEditingCueId(null);
  }, [editingCueName, onUpdateCue]);

  // Improvement #14: Handle context menu (right-click)
  const handleContextMenu = useCallback((e: React.MouseEvent, cue: CuePoint) => {
    e.preventDefault();
    setContextMenuCueId(cue.id);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  // Improvement #12: Multi-select with Shift+Click
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);
  const handleCueClick = useCallback((e: React.MouseEvent, idx: number, cue: CuePoint) => {
    if (e.shiftKey && lastSelectedIdx !== null) {
      // Shift+Click: select range
      const start = Math.min(lastSelectedIdx, idx);
      const end = Math.max(lastSelectedIdx, idx);
      const newSelected = new Set(selectedCueIds);
      for (let i = start; i <= end; i++) {
        const rangeCue = cuePoints[filteredIndices[i]];
        if (rangeCue) newSelected.add(rangeCue.id);
      }
      setSelectedCueIds(newSelected);
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl+Click: toggle single
      const newSelected = new Set(selectedCueIds);
      if (newSelected.has(cue.id)) newSelected.delete(cue.id);
      else newSelected.add(cue.id);
      setSelectedCueIds(newSelected);
    } else {
      // Regular click
      setSelectedCueIds(new Set([cue.id]));
    }
    setLastSelectedIdx(idx);
  }, [selectedCueIds, filteredIndices, cuePoints, lastSelectedIdx]);

  // Cue preview on hover (point 246): play 2s of audio when hovering a cue
  const handleCuePreview = useCallback((positionMs: number) => {
    if (playerRef?.current) {
      const player = playerRef.current;
      if (player.seekTo && player.play) {
        player.seekTo(positionMs / 1000); // Convert ms to seconds
        player.play();
        setTimeout(() => {
          if (player.pause) player.pause();
        }, 2000); // 2 second preview
      }
    }
  }, [playerRef]);

  // Calculate max position for timeline scaling
  const trackDurationMs = track?.analysis?.duration_ms ?? (track as any)?.duration_ms ?? 0;
  const maxMs = Math.max(1, ...cuePoints.map(c => c.position_ms ?? c.time_ms ?? 0), ...(trackDurationMs ? [trackDurationMs] : []));

  const handleAddCue = useCallback(() => {
    const posMs = initialPositionMs ?? 0;
    const selectedType = CUE_TYPES.find(t => t.value === newCueType) || CUE_TYPES[0];
    const name = newCueName.trim() || `${selectedType.label} ${cuePoints.length + 1}`;
    onCreateCue?.({
      name,
      position_ms: posMs,
      color: newCueColor || selectedType.color,
      cue_type: newCueType,
      number: newCueSlot,
      ...(newCueType === 'loop' ? { end_position_ms: posMs + loopDurationSec * 1000 } : {}),
    });
    setNewCueName('');
    setShowAddForm(false);
    setNewCueSlot(prev => Math.min(8, prev + 1));
    setNewCueColor(HOT_CUE_COLORS[(newCueSlot + 1) % HOT_CUE_COLORS.length]);
  }, [newCueType, newCueName, newCueColor, newCueSlot, loopDurationSec, initialPositionMs, onCreateCue, cuePoints.length]);

  // Improvement #10: Debounce rapid cue creation
  const handleQuickAdd = useCallback(() => {
    if (createDebounceRef.current) clearTimeout(createDebounceRef.current);
    createDebounceRef.current = setTimeout(() => {
      const posMs = initialPositionMs ?? 0;
      const nextColor = HOT_CUE_COLORS[cuePoints.length % HOT_CUE_COLORS.length];
      onCreateCue?.({
        name: `Cue ${cuePoints.length + 1}`,
        position_ms: posMs,
        color: nextColor,
        cue_type: 'hot_cue',
        number: cuePoints.length % 9,
      });
    }, 100);
  }, [initialPositionMs, onCreateCue, cuePoints.length]);

  const handleDragStart = (idx: number) => {
    pushUndoState(localOrder); // Improvement #15: persist drag-reorder to undo stack
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const next = [...indices];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(toIdx, 0, moved);
    setLocalOrder(next);
    // Improvement #15: Persist to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(`trackcue_cue_order_${track?.id}`, JSON.stringify(next));
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  // Improvement #11: Copy cue functionality
  const handleCopyCue = useCallback((cue: CuePoint) => {
    const posMs = initialPositionMs ?? (cue.position_ms ?? 0);
    onCreateCue?.({
      name: `${cue.name} (copy)`,
      position_ms: posMs,
      color: cue.color || '#22c55e',
      cue_type: cue.cue_type || 'hot_cue',
      ...(cue.cue_type === 'loop' && cue.end_position_ms
        ? { end_position_ms: posMs + ((cue.end_position_ms - (cue.position_ms ?? 0)) || 4000) }
        : {}),
    });
  }, [initialPositionMs, onCreateCue]);

  // Improvement #12: Move to nearest beat
  const handleMoveToNearestBeat = useCallback((cue: CuePoint) => {
    const bpm = (track?.analysis?.bpm ?? (track as any)?.bpm) ?? 128;
    const beatMs = (60000 / Math.max(bpm, 60));
    const currentPos = cue.position_ms ?? 0;
    const nearestBeat = Math.round(currentPos / beatMs) * beatMs;
    onUpdateCue?.(cue.id, { position_ms: nearestBeat });
  }, [track?.analysis?.bpm, track?.bpm, onUpdateCue]);

  // Improvement #3: Handle bulk delete
  const handleBulkDelete = useCallback(() => {
    selectedCueIds.forEach((cueId) => onDeleteCue?.(cueId));
    setSelectedCueIds(new Set());
    setBulkDeleteMode(false);
  }, [selectedCueIds, onDeleteCue]);

  if (!track) {
    return (
      <div className="flex items-center justify-center h-32 text-[var(--text-muted)] text-sm">
        {tr('cues.select_track', lang)}
      </div>
    );
  }

  const posLabel = initialPositionMs != null ? formatTimeMs(initialPositionMs) : '0:00';
  const selectedTypeInfo = CUE_TYPES.find(t => t.value === newCueType) || CUE_TYPES[0];

  return (
    <div className="flex flex-col h-full">

      {/* ═══ Mini timeline visualization ═══ */}
      {cues.length > 0 && (
        <div className="px-3 pt-3 pb-1 flex-shrink-0">
          <div
            className="relative h-8 rounded-lg overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {/* Waveform visualization hint */}
            <div className="absolute inset-0 flex items-end px-1 gap-px">
              {Array.from({ length: 80 }).map((_, i) => {
                const h = 3 + Math.sin(i * 0.35) * 10 + Math.cos(i * 0.65) * 5 + Math.sin(i * 1.2) * 3;
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-sm"
                    style={{
                      height: `${Math.max(2, Math.abs(h))}px`,
                      background: 'rgba(255,255,255,0.05)',
                    }}
                  />
                );
              })}
            </div>

            {/* Cue markers on timeline */}
            {cues.map((cue, idx) => {
              const posMs = cue.position_ms ?? cue.time_ms ?? 0;
              const pct = Math.min(97, Math.max(1, (posMs / maxMs) * 100));
              const color = cue.color || cue.color_rgb || '#22c55e';
              const isHovered = hoveredCue === cue.id;
              return (
                <div
                  key={cue.id}
                  className="absolute top-0 bottom-0 cursor-pointer transition-opacity"
                  style={{ left: `${pct}%`, width: 2, background: color, opacity: isHovered ? 1 : 0.7 }}
                  onClick={() => onCueClick?.(cue)}
                  onMouseEnter={() => {
                    setHoveredCue(cue.id);
                    handleCuePreview(cue.position_ms ?? cue.time_ms ?? 0);
                  }}
                  onMouseLeave={() => setHoveredCue(null)}
                >
                  {/* Triangle marker */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: -4,
                      width: 0,
                      height: 0,
                      borderLeft: '4px solid transparent',
                      borderRight: '4px solid transparent',
                      borderTop: `6px solid ${color}`,
                      filter: isHovered ? `drop-shadow(0 0 4px ${color})` : 'none',
                    }}
                  />
                  {/* Loop range */}
                  {(cue.cue_type === 'loop' || cue.cue_mode === 'loop') && cue.end_position_ms != null && (
                    <div
                      className="absolute top-0 bottom-0"
                      style={{
                        left: 0,
                        width: `${Math.max(4, ((cue.end_position_ms - posMs) / maxMs) * 100)}px`,
                        background: `${color}15`,
                        borderRight: `1px solid ${color}40`,
                      }}
                    />
                  )}
                </div>
              );
            })}

            {/* Playhead position */}
            {initialPositionMs != null && (
              <div
                className="absolute top-0 bottom-0"
                style={{
                  left: `${Math.min(99, (initialPositionMs / maxMs) * 100)}%`,
                  width: 1.5,
                  background: '#fff',
                  opacity: 0.5,
                  boxShadow: '0 0 4px rgba(255,255,255,0.3)',
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* ═══ Add cue buttons ═══ */}
      <div className="p-3 border-b border-[var(--border-subtle)] flex-shrink-0 space-y-2">
        <div className="flex gap-1.5 mb-2">
          <button
            onClick={handleQuickAdd}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-white text-xs font-semibold transition-all"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
              boxShadow: '0 2px 8px rgba(59,130,246,0.25)',
            }}
          >
            <Zap size={11} />
            {tr('cues.add_at', lang)} {posLabel}
          </button>
          {onRegenerateCues && (
            <button
              onClick={() => {
                setIsRegenerating(true);
                onRegenerateCues();
                setTimeout(() => setIsRegenerating(false), 2000);
              }}
              disabled={isRegenerating}
              className="px-2 py-1.5 rounded-lg border text-xs font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              style={{
                background: isRegenerating ? 'rgba(245,158,11,0.5)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                borderColor: '#f59e0b',
                color: 'white',
                boxShadow: '0 2px 8px rgba(245,158,11,0.25)',
              }}
              title="Régénérer les repères"
            >
              <Zap size={11} className={isRegenerating ? 'animate-spin' : ''} />
              {isRegenerating ? 'En cours...' : 'Régénérer'}
            </button>
          )}
          <button
            onClick={() => setShowAddForm(p => !p)}
            className={`px-2 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
              showAddForm
                ? 'border-blue-500/50 bg-blue-500/15 text-blue-400'
                : 'border-[var(--border-default)] bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
            }`}
            title={tr('cues.advanced', lang)}
          >
            <ChevronDown size={13} className={`transition-transform ${showAddForm ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Improvement #2: Search/filter controls */}
        <div className="flex gap-1.5">
          <div className="flex-1 relative">
            <Search size={12} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Chercher les cues..."
              className="w-full pl-6 pr-2 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-blue-500"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-2 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] outline-none focus:border-blue-500 cursor-pointer"
            title="Trier par"
          >
            <option value="position">Position</option>
            <option value="name">Nom</option>
            <option value="type">Type</option>
            <option value="confidence">Confiance</option>
          </select>
        </div>

        {/* Improvement #3: Bulk delete controls */}
        {bulkDeleteMode && (
          <div className="flex gap-1.5 p-1.5 bg-red-500/10 rounded-lg border border-red-500/25">
            <span className="text-xs text-red-400 flex-1">{selectedCueIds.size} sélectionné(s)</span>
            <button
              onClick={handleBulkDelete}
              className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            >
              Supprimer
            </button>
            <button
              onClick={() => {
                setBulkDeleteMode(false);
                setSelectedCueIds(new Set());
              }}
              className="px-2 py-1 text-xs bg-transparent border border-[var(--border-default)] rounded hover:bg-[var(--bg-hover)] transition-colors"
            >
              Annuler
            </button>
          </div>
        )}

        {/* Advanced form */}
        {showAddForm && (
          <div className="space-y-2 pt-1">
            <input
              type="text"
              value={newCueName}
              onChange={e => setNewCueName(e.target.value)}
              placeholder={`${selectedTypeInfo.label} ${cuePoints.length + 1}`}
              className="w-full px-2 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-blue-500"
            />
            <div className="flex gap-1.5">
              <select
                value={newCueType}
                onChange={e => setNewCueType(e.target.value)}
                className="flex-1 px-1.5 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] outline-none focus:border-blue-500 cursor-pointer"
              >
                {CUE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                ))}
              </select>
              <select
                value={newCueSlot}
                onChange={e => setNewCueSlot(parseInt(e.target.value))}
                className="w-14 px-1.5 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] outline-none focus:border-blue-500 cursor-pointer"
                title="Slot (0-8)"
              >
                {SLOTS.map(s => <option key={s} value={s}>#{s}</option>)}
              </select>
            </div>
            {newCueType === 'loop' && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/25">
                <span className="text-[10px] text-blue-400 font-semibold whitespace-nowrap">🔁 {tr('cues.loop_duration', lang)}</span>
                <div className="flex gap-1 flex-wrap">
                  {[1, 2, 4, 8, 16, 32].map(bars => (
                    <button
                      key={bars}
                      onClick={() => setLoopDurationSec(bars)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer border transition-all ${
                        loopDurationSec === bars
                          ? 'bg-blue-500 border-blue-400 text-white font-bold'
                          : 'bg-transparent border-[var(--border-default)] text-[var(--text-muted)] hover:border-blue-400'
                      }`}
                    >
                      {bars}s
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={0.5}
                  max={120}
                  step={0.5}
                  value={loopDurationSec}
                  onChange={e => setLoopDurationSec(parseFloat(e.target.value) || 1)}
                  className="w-14 px-1.5 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] outline-none focus:border-blue-500 text-right"
                  title={tr('cues.loop_duration', lang)}
                />
                <span className="text-[10px] text-[var(--text-muted)]">sec</span>
              </div>
            )}
            <div className="flex gap-1 flex-wrap">
              {HOT_CUE_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewCueColor(c)}
                  className={`w-5 h-5 rounded cursor-pointer border-2 transition-all ${newCueColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <button
              onClick={handleAddCue}
              className="w-full px-2 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            >
              {selectedTypeInfo.icon} {tr('cues.add_type', lang)} {selectedTypeInfo.label} @ {posLabel} · {tr('cues.slot', lang)} #{newCueSlot}
            </button>
          </div>
        )}
      </div>

      {/* ═══ Cue list — redesigned ═══ */}
      <div className="flex-1 overflow-y-auto" ref={cueListRef}>
        {/* Improvement #12: Loading skeleton */}
        {showLoadingSkeleton && (
          <div className="p-2 flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="h-10 rounded-lg bg-[var(--bg-hover)] animate-pulse"
                style={{ animationDelay: `${i * 100}ms` }}
              />
            ))}
          </div>
        )}

        {filteredIndices.length === 0 && !showLoadingSkeleton ? (
          <div className="flex flex-col items-center justify-center h-32 text-[var(--text-muted)] text-xs gap-2 p-4">
            {/* Improvement #8: Empty state illustration */}
            <div className="text-4xl opacity-30">🎵</div>
            <span>{searchFilter ? 'Aucun cue trouvé' : tr('cues.no_cue', lang)}</span>
          </div>
        ) : (
          <>
            {/* Improvement #9: Cue count badge */}
            <div className="sticky top-0 px-3 py-1 bg-[var(--bg-primary)] border-b border-[var(--border-subtle)] flex justify-between items-center text-[10px] text-[var(--text-muted)]">
              <span>{filteredIndices.length} repère{filteredIndices.length > 1 ? 's' : ''}</span>
              {undoStack.length > 0 && (
                <button
                  onClick={handleUndo}
                  className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                  title="Annuler (Ctrl+Z)"
                >
                  <RotateCcw size={10} /> Annuler
                </button>
              )}
            </div>
            <div className="p-2 flex flex-col gap-1">
              {filteredIndices.map((idx) => {
                const cue = cuePoints[idx];
              if (!cue) return null;
              const typeInfo = CUE_TYPES.find(t => t.value === (cue.cue_type || 'hot_cue')) || CUE_TYPES[0];
              const color = cue.color || cue.color_rgb || typeInfo.color;
              const label = HOT_CUE_LABELS[cue.number ?? idx] || String(cue.number ?? idx);
              const isHovered = hoveredCue === cue.id;
              const showDetails = hoveredDetailsCue === cue.id;
              const posMs = cue.position_ms ?? cue.time_ms ?? 0;
              const barNumber = getBarNumber(posMs);
              const isSelected = selectedCueIds.has(cue.id);
              const isPinned = pinnedCueIds.has(cue.id);
              const isExpanded = expandedCueIds.has(cue.id);
              const cueNote = cueNotes.get(cue.id);
              const twoBarThreshold = (60000 / Math.max((track?.analysis?.bpm ?? (track as any)?.bpm) ?? 128, 60)) * 8; // 2 bars in ms
              const nextCue = filteredIndices[filteredIndices.indexOf(idx) + 1];
              const nextCuePos = nextCue ? cuePoints[nextCue]?.position_ms : null;
              const distToNext = nextCuePos ? (nextCuePos - posMs) / 1000 : null;

              return (
                <div key={cue.id}>
                  <div
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={() => handleDrop(idx)}
                    onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                    onContextMenu={(e) => handleContextMenu(e, cue)}
                    onClick={(e) => {
                      if (bulkDeleteMode) {
                        const next = new Set(selectedCueIds);
                        if (next.has(cue.id)) next.delete(cue.id);
                        else next.add(cue.id);
                        setSelectedCueIds(next);
                      } else {
                        handleCueClick(e, idx, cue);
                        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
                          onCueClick?.(cue);
                        }
                      }
                    }}
                    onMouseEnter={() => {
                      setHoveredCue(cue.id);
                      setHoveredDetailsCue(cue.id);
                    }}
                    onMouseLeave={() => {
                      setHoveredCue(null);
                      setHoveredDetailsCue(null);
                    }}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all cursor-grab active:cursor-grabbing select-none ${
                      dragOverIdx === idx && dragIdx !== idx
                        ? 'scale-[1.01]'
                        : dragIdx === idx
                          ? 'opacity-30'
                          : ''
                    } ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
                    style={{
                      background: isHovered
                        ? `linear-gradient(90deg, ${color}18, transparent 80%)`
                        : `linear-gradient(90deg, ${color}0a, transparent 60%)`,
                      border: dragOverIdx === idx && dragIdx !== idx
                        ? `1px solid #3b82f6`
                        : dragIdx === idx
                          ? '1px dashed var(--border-default)'
                          : `1px solid rgba(255,255,255,0.04)`,
                      borderLeftWidth: '2.5px',
                      borderLeftColor: color,
                    }}
                  >
                  {/* Improvement #3: Checkbox for bulk delete mode */}
                  {bulkDeleteMode && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        const next = new Set(selectedCueIds);
                        if (next.has(cue.id)) next.delete(cue.id);
                        else next.add(cue.id);
                        setSelectedCueIds(next);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-3.5 h-3.5 cursor-pointer"
                    />
                  )}

                  {!bulkDeleteMode && <GripVertical size={10} className="text-[var(--text-muted)] flex-shrink-0 opacity-40" />}

                  {/* Hot cue badge — neon glow style */}
                  <div
                    className="w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center font-black text-[10px] transition-all"
                    style={{
                      backgroundColor: `${color}20`,
                      border: `1.5px solid ${color}60`,
                      color: color,
                      boxShadow: isHovered ? `0 0 10px ${color}40, inset 0 0 6px ${color}15` : `0 0 6px ${color}20`,
                      textShadow: `0 0 8px ${color}`,
                    }}
                    title={`Slot ${label}`}
                  >
                    {label}
                  </div>

                  {/* Cue type badge — improved */}
                  <CueTypeBadge type={cue.cue_type || 'hot_cue'} color={color} />

                  {/* Name + metadata section */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {/* Improvement #20: Pin button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = new Set(pinnedCueIds);
                          if (next.has(cue.id)) next.delete(cue.id);
                          else next.add(cue.id);
                          setPinnedCueIds(next);
                        }}
                        className="flex-shrink-0 opacity-40 hover:opacity-100 transition-opacity"
                        style={{ fontSize: '10px' }}
                      >
                        {isPinned ? '📌' : '📍'}
                      </button>

                      {/* Improvement #13: Inline editing mode */}
                      {editingCueId === cue.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={editingCueName}
                          onChange={(e) => setEditingCueName(e.target.value)}
                          onBlur={() => handleSaveEdit(cue.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(cue.id);
                            if (e.key === 'Escape') setEditingCueId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 px-2 py-1 rounded bg-blue-500/20 border border-blue-500/50 text-xs text-[var(--text-primary)] outline-none focus:border-blue-400"
                        />
                      ) : (
                        <div
                          onDoubleClick={() => handleStartEdit(cue)}
                          className="text-xs font-semibold text-[var(--text-primary)] truncate leading-tight tracking-wide flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                          style={{ textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.04em' }}
                          title="Double-click to edit"
                        >
                          {cue.name || `${typeInfo.label} ${idx + 1}`}
                        </div>
                      )}
                      <ConfidenceDot confidence={cue.confidence} />
                    </div>
                    <div className="text-[9px] flex items-center gap-2 mt-0.5 flex-wrap" style={{ color: `${color}99` }}>
                      <span className="font-mono">{formatTimeMs(posMs)}</span>
                      <span className="opacity-60">·</span>
                      <span className="opacity-70">Bar {barNumber}</span>
                      {(cue.cue_type === 'loop' || cue.cue_mode === 'loop') && cue.end_position_ms != null && (
                        <>
                          <span className="opacity-60">·</span>
                          <span className="text-blue-400">
                            {formatTimeMs(cue.end_position_ms)} ({((cue.end_position_ms - posMs) / 1000).toFixed(1)}s)
                          </span>
                        </>
                      )}
                      {/* Improvement #23: Show estimated time between cues */}
                      {distToNext !== null && distToNext > 0 && (
                        <>
                          <span className="opacity-60">·</span>
                          <span className="opacity-70 text-[8px]">+{distToNext.toFixed(1)}s</span>
                        </>
                      )}
                      {/* Improvement #22: Visual warning for cues too close */}
                      {distToNext !== null && distToNext < twoBarThreshold / 1000 && distToNext > 0 && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-yellow-500/30 border border-yellow-500/50 text-yellow-300">
                          ⚠️ Proche
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Color circle indicator */}
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0 transition-all"
                    style={{
                      background: color,
                      boxShadow: isHovered ? `0 0 6px ${color}, 0 0 12px ${color}60` : `0 0 3px ${color}80`,
                    }}
                  />

                  {/* Action buttons */}
                  {!bulkDeleteMode && (
                    <>
                      {/* Improvement #25: Expand/collapse button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = new Set(expandedCueIds);
                          if (next.has(cue.id)) next.delete(cue.id);
                          else next.add(cue.id);
                          setExpandedCueIds(next);
                        }}
                        className="p-1 rounded hover:bg-blue-500/15 text-[var(--text-muted)] hover:text-blue-400 transition-colors flex-shrink-0"
                        style={{ opacity: isHovered ? 1 : 0.5 }}
                        title="Détails complets"
                      >
                        <ChevronDown size={11} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                      </button>

                      {/* Improvement #11: Copy cue */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyCue(cue);
                        }}
                        className="p-1 rounded hover:bg-purple-500/15 text-[var(--text-muted)] hover:text-purple-400 transition-colors flex-shrink-0"
                        style={{ opacity: isHovered ? 1 : 0 }}
                        title="Copier ce cue"
                      >
                        <Copy size={11} />
                      </button>

                      {/* Improvement #12: Move to nearest beat */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveToNearestBeat(cue);
                        }}
                        className="p-1 rounded hover:bg-orange-500/15 text-[var(--text-muted)] hover:text-orange-400 transition-colors flex-shrink-0"
                        style={{ opacity: isHovered ? 1 : 0 }}
                        title="Déplacer au beat le plus proche"
                      >
                        <Move size={11} />
                      </button>

                      {/* Preview (play 2s) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreviewCue?.(cue);
                        }}
                        className="p-1 rounded hover:bg-green-500/15 text-[var(--text-muted)] hover:text-green-400 transition-colors flex-shrink-0"
                        style={{ opacity: isHovered ? 1 : 0.4 }}
                        title={tr('cues.preview', lang)}
                      >
                        <Play size={11} fill="currentColor" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteCue?.(cue.id);
                        }}
                        className="p-1 rounded hover:bg-red-500/15 text-[var(--text-muted)] hover:text-red-400 transition-colors flex-shrink-0"
                        style={{ opacity: isHovered ? 1 : 0 }}
                        title={tr('cues.delete', lang)}
                      >
                        <Trash2 size={11} />
                      </button>
                    </>
                  )}
                </div>

                {/* Improvement #13: Tooltip showing full cue details on hover */}
                {showDetails && (
                  <div className="text-[8px] px-2.5 py-1.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] space-y-0.5 mb-1">
                    <div><strong>Nom:</strong> {cue.name}</div>
                    <div><strong>Type:</strong> {cue.cue_type}</div>
                    <div><strong>Position:</strong> {formatTimeMs(posMs)}</div>
                    {cue.confidence && <div><strong>Confiance:</strong> {Math.round(cue.confidence * 100)}%</div>}
                    {cue.end_position_ms && <div><strong>Fin:</strong> {formatTimeMs(cue.end_position_ms)}</div>}
                  </div>
                )}

                {/* Improvement #25: Collapsible cue details */}
                {isExpanded && (
                  <div className="px-2.5 py-1.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[8px] space-y-2 mb-1">
                    <div className="space-y-0.5">
                      <div><strong>Détails complets:</strong></div>
                      <div className="text-[7px] font-mono space-y-0.5 text-[var(--text-secondary)]">
                        <div>ID: {cue.id}</div>
                        <div>Type: {cue.cue_type}</div>
                        <div>Position: {formatTimeMs(posMs)}</div>
                        <div>Confiance: {Math.round((cue.confidence || 0) * 100)}%</div>
                        {cue.end_position_ms && <div>Fin: {formatTimeMs(cue.end_position_ms)}</div>}
                      </div>
                    </div>

                    {/* Improvement #21: Cue notes/comments */}
                    <div className="space-y-1">
                      <label className="text-[8px] font-semibold text-[var(--text-primary)]">Notes:</label>
                      <textarea
                        value={cueNote || ''}
                        onChange={(e) => {
                          const next = new Map(cueNotes);
                          if (e.target.value) next.set(cue.id, e.target.value);
                          else next.delete(cue.id);
                          setCueNotes(next);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Ajouter une note..."
                        className="w-full p-1 rounded text-[7px] bg-[var(--bg-primary)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-none"
                        rows={2}
                      />
                    </div>
                  </div>
                )}
              </div>
              );
            })}
            </div>
          </>
        )}
      </div>

      {/* Improvement #3: Bulk delete mode toggle */}
      {!bulkDeleteMode && cuePoints.length > 0 && (
        <div className="px-3 py-2 border-t border-[var(--border-subtle)] flex-shrink-0">
          <button
            onClick={() => setBulkDeleteMode(true)}
            className="w-full text-xs px-2 py-1.5 rounded bg-transparent border border-[var(--border-default)] text-[var(--text-muted)] hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-400 transition-colors"
          >
            Supprimer en lot...
          </button>
        </div>
      )}

      {/* ═══ Legend — compact pills ═══ */}
      <div className="px-3 py-2 border-t border-[var(--border-subtle)] flex-shrink-0">
        <div className="flex flex-wrap gap-1.5">
          {CUE_TYPES.slice(0, 5).map(t => (
            <span
              key={t.value}
              className="text-[8px] px-1.5 py-0.5 rounded-full"
              style={{
                background: `${t.color}12`,
                border: `1px solid ${t.color}25`,
                color: `${t.color}cc`,
              }}
            >
              {t.icon} {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* Improvement #14: Context menu (right-click actions) */}
      {contextMenuCueId !== null && contextMenuPos && (
        <div
          className="fixed bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded shadow-lg z-50 text-xs"
          style={{
            left: `${contextMenuPos.x}px`,
            top: `${contextMenuPos.y}px`,
            minWidth: '140px',
          }}
          onMouseLeave={() => setContextMenuCueId(null)}
        >
          <button
            onClick={() => {
              const cue = cuePoints.find(c => c.id === contextMenuCueId);
              if (cue) handleStartEdit(cue);
              setContextMenuCueId(null);
            }}
            className="block w-full text-left px-3 py-1.5 hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            Éditer
          </button>
          <button
            onClick={() => {
              const cue = cuePoints.find(c => c.id === contextMenuCueId);
              if (cue) handleCopyCue(cue);
              setContextMenuCueId(null);
            }}
            className="block w-full text-left px-3 py-1.5 hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            Copier
          </button>
          <button
            onClick={() => {
              const cue = cuePoints.find(c => c.id === contextMenuCueId);
              if (cue) onPreviewCue?.(cue);
              setContextMenuCueId(null);
            }}
            className="block w-full text-left px-3 py-1.5 hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            Écouter
          </button>
          <div className="border-t border-[var(--border-subtle)]" />
          <button
            onClick={() => {
              onDeleteCue?.(contextMenuCueId);
              setContextMenuCueId(null);
            }}
            className="block w-full text-left px-3 py-1.5 hover:bg-red-500/15 text-red-400"
          >
            Supprimer
          </button>
        </div>
      )}
    </div>
  );
}

export default React.memo(CuesTab);
