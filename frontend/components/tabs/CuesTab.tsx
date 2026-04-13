// @ts-nocheck
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Track, CuePoint } from '@/types';
import { HOT_CUE_COLORS, HOT_CUE_LABELS, formatTimeMs } from '@/lib/constants';
import { Trash2, Plus, GripVertical, ChevronDown, Zap, Play, Square } from 'lucide-react';
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
}: CuesTabProps) {
  const { lang } = useLang();
  const [localOrder, setLocalOrder] = useState<number[]>([]);

  // Bar number calculation helper
  const getBarNumber = (posMs: number): number => {
    const bpm = (track?.analysis?.bpm ?? (track as any)?.bpm) ?? 128;
    const barMs = (60000 / Math.max(bpm, 60)) * 4;
    return Math.floor(posMs / barMs) + 1;
  };
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCueName, setNewCueName] = useState('');
  const [newCueType, setNewCueType] = useState('hot_cue');
  const [newCueSlot, setNewCueSlot] = useState<number>(0);
  const [newCueColor, setNewCueColor] = useState(HOT_CUE_COLORS[0]);
  const [loopDurationSec, setLoopDurationSec] = useState<number>(4);
  const [hoveredCue, setHoveredCue] = useState<number | null>(null);

  const indices = localOrder.length === cuePoints.length
    && localOrder.every(i => i < cuePoints.length)
    ? localOrder
    : cuePoints.map((_, i) => i);

  const cues = indices.map(i => cuePoints[i]);

  useEffect(() => {
    setLocalOrder(cuePoints.map((_, i) => i));
  }, [cuePoints.length]);

  // Keyboard shortcuts: 1-8 to jump to cues (point 250)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return; // Skip if typing in input
      const num = parseInt(e.key);
      if (num >= 1 && num <= 8) {
        const cue = cues[num - 1];
        if (cue && onCueClick) {
          onCueClick(cue);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cues, onCueClick]);

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

  const handleAddCue = () => {
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
  };

  const handleQuickAdd = () => {
    const posMs = initialPositionMs ?? 0;
    const nextColor = HOT_CUE_COLORS[cuePoints.length % HOT_CUE_COLORS.length];
    onCreateCue?.({
      name: `Cue ${cuePoints.length + 1}`,
      position_ms: posMs,
      color: nextColor,
      cue_type: 'hot_cue',
      number: cuePoints.length % 9,
    });
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);

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
    setDragIdx(null);
    setDragOverIdx(null);
  };

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
        <div className="flex gap-1.5">
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
              onClick={onRegenerateCues}
              className="px-2 py-1.5 rounded-lg border text-xs font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                borderColor: '#f59e0b',
                color: 'white',
                boxShadow: '0 2px 8px rgba(245,158,11,0.25)',
              }}
              title="Régénérer les repères"
            >
              <Zap size={11} />
              Régénérer
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
      <div className="flex-1 overflow-y-auto">
        {cues.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 text-[var(--text-muted)] text-xs gap-1 p-4">
            <span>{tr('cues.no_cue', lang)}</span>
          </div>
        ) : (
          <div className="p-2 flex flex-col gap-1">
            {cues.map((cue, idx) => {
              const typeInfo = CUE_TYPES.find(t => t.value === (cue.cue_type || 'hot_cue')) || CUE_TYPES[0];
              const color = cue.color || cue.color_rgb || typeInfo.color;
              const label = HOT_CUE_LABELS[cue.number ?? idx] || String(cue.number ?? idx);
              const isHovered = hoveredCue === cue.id;
              const posMs = cue.position_ms ?? cue.time_ms ?? 0;
              const barNumber = getBarNumber(posMs);
              return (
                <div
                  key={cue.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  onClick={() => onCueClick?.(cue)}
                  onMouseEnter={() => setHoveredCue(cue.id)}
                  onMouseLeave={() => setHoveredCue(null)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all cursor-grab active:cursor-grabbing select-none ${
                    dragOverIdx === idx && dragIdx !== idx
                      ? 'scale-[1.01]'
                      : dragIdx === idx
                        ? 'opacity-30'
                        : ''
                  }`}
                  style={{
                    background: isHovered
                      ? `linear-gradient(90deg, ${color}18, transparent 80%)`
                      : `linear-gradient(90deg, ${color}0a, transparent 60%)`,
                    borderLeft: `2.5px solid ${color}`,
                    border: dragOverIdx === idx && dragIdx !== idx
                      ? `1px solid #3b82f6`
                      : dragIdx === idx
                        ? '1px dashed var(--border-default)'
                        : `1px solid rgba(255,255,255,0.04)`,
                    borderLeftWidth: '2.5px',
                    borderLeftColor: color,
                  }}
                >
                  <GripVertical size={10} className="text-[var(--text-muted)] flex-shrink-0 opacity-40" />

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
                      <div className="text-xs font-semibold text-[var(--text-primary)] truncate leading-tight tracking-wide" style={{ textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.04em' }}>
                        {cue.name || `${typeInfo.label} ${idx + 1}`}
                      </div>
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

                  {/* Preview (play 2s) */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onPreviewCue?.(cue); }}
                    className="p-1 rounded hover:bg-green-500/15 text-[var(--text-muted)] hover:text-green-400 transition-colors flex-shrink-0"
                    style={{ opacity: isHovered ? 1 : 0.4 }}
                    title={tr('cues.preview', lang)}
                  >
                    <Play size={11} fill="currentColor" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteCue?.(cue.id); }}
                    className="p-1 rounded hover:bg-red-500/15 text-[var(--text-muted)] hover:text-red-400 transition-colors flex-shrink-0"
                    style={{ opacity: isHovered ? 1 : 0 }}
                    title={tr('cues.delete', lang)}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
    </div>
  );
}

export default React.memo(CuesTab);
