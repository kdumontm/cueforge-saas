// @ts-nocheck
'use client';

import { useState } from 'react';
import { Track, CuePoint } from '@/types';
import { HOT_CUE_COLORS, formatTimeMs } from '@/lib/constants';
import { Trash2, Plus, GripVertical, ChevronDown } from 'lucide-react';

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

interface CuesTabProps {
  track: Track | null;
  cuePoints?: CuePoint[];
  onCreateCue?: (cue: { name: string; position_ms: number; color: string; cue_type: string; number?: number }) => void;
  onDeleteCue?: (cueId: number) => void;
  onCueClick?: (cue: CuePoint) => void;
  initialPositionMs?: number | null;
}

export function CuesTab({
  track,
  cuePoints = [],
  onCreateCue,
  onDeleteCue,
  onCueClick,
  initialPositionMs,
}: CuesTabProps) {
  const [localOrder, setLocalOrder] = useState<number[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCueName, setNewCueName] = useState('');
  const [newCueType, setNewCueType] = useState('hot_cue');
  const [newCueSlot, setNewCueSlot] = useState<number>(0);
  const [newCueColor, setNewCueColor] = useState(HOT_CUE_COLORS[0]);

  const indices = localOrder.length === cuePoints.length
    && localOrder.every(i => i < cuePoints.length)
    ? localOrder
    : cuePoints.map((_, i) => i);

  const cues = indices.map(i => cuePoints[i]);

  if (localOrder.length !== cuePoints.length) {
    setLocalOrder(cuePoints.map((_, i) => i));
  }

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
    });
    setNewCueName('');
    setShowAddForm(false);
    // Auto-increment slot
    setNewCueSlot(prev => Math.min(8, prev + 1));
    // Auto-cycle color
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
        Sélectionne un morceau
      </div>
    );
  }

  const posLabel = initialPositionMs != null ? formatTimeMs(initialPositionMs) : '0:00';
  const selectedTypeInfo = CUE_TYPES.find(t => t.value === newCueType) || CUE_TYPES[0];

  return (
    <div className="flex flex-col h-full">

      {/* Add cue buttons */}
      <div className="p-3 border-b border-[var(--border-subtle)] flex-shrink-0 space-y-2">
        <div className="flex gap-1.5">
          {/* Quick add */}
          <button
            onClick={handleQuickAdd}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
          >
            <Plus size={12} />
            Cue @ {posLabel}
          </button>
          {/* Advanced add toggle */}
          <button
            onClick={() => setShowAddForm(p => !p)}
            className={`px-2 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
              showAddForm
                ? 'border-blue-500/50 bg-blue-500/15 text-blue-400'
                : 'border-[var(--border-default)] bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
            }`}
            title="Options avancées"
          >
            <ChevronDown size={13} className={`transition-transform ${showAddForm ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Advanced form */}
        {showAddForm && (
          <div className="space-y-2 pt-1">
            {/* Name */}
            <input
              type="text"
              value={newCueName}
              onChange={e => setNewCueName(e.target.value)}
              placeholder={`${selectedTypeInfo.label} ${cuePoints.length + 1}`}
              className="w-full px-2 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-blue-500"
            />
            <div className="flex gap-1.5">
              {/* Type */}
              <select
                value={newCueType}
                onChange={e => setNewCueType(e.target.value)}
                className="flex-1 px-1.5 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] outline-none focus:border-blue-500 cursor-pointer"
              >
                {CUE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                ))}
              </select>
              {/* Slot */}
              <select
                value={newCueSlot}
                onChange={e => setNewCueSlot(parseInt(e.target.value))}
                className="w-14 px-1.5 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] outline-none focus:border-blue-500 cursor-pointer"
                title="Slot (0-8)"
              >
                {SLOTS.map(s => <option key={s} value={s}>#{s}</option>)}
              </select>
            </div>
            {/* Color swatches */}
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
              {selectedTypeInfo.icon} Ajouter {selectedTypeInfo.label} @ {posLabel} · Slot #{newCueSlot}
            </button>
          </div>
        )}
      </div>

      {/* Cue list */}
      <div className="flex-1 overflow-y-auto">
        {cues.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 text-[var(--text-muted)] text-xs gap-1 p-4">
            <span>Aucun cue — positionne le playhead puis clique le bouton</span>
          </div>
        ) : (
          <div className="p-2 flex flex-col gap-1">
            {cues.map((cue, idx) => {
              const typeInfo = CUE_TYPES.find(t => t.value === (cue.cue_type || 'hot_cue')) || CUE_TYPES[0];
              return (
                <div
                  key={cue.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  onClick={() => onCueClick?.(cue)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-all cursor-grab active:cursor-grabbing select-none ${
                    dragOverIdx === idx && dragIdx !== idx
                      ? 'border-blue-500 bg-blue-500/10 scale-[1.01]'
                      : dragIdx === idx
                        ? 'opacity-30 border-dashed border-[var(--border-default)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <GripVertical size={11} className="text-[var(--text-muted)] flex-shrink-0" />

                  {/* Color badge */}
                  <div
                    className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                    style={{ backgroundColor: cue.color || cue.color_rgb || typeInfo.color }}
                    title={`Slot #${cue.number ?? idx}`}
                  >
                    {cue.number ?? idx}
                  </div>

                  {/* Type icon */}
                  <span className="text-[10px] flex-shrink-0" title={typeInfo.label}>{typeInfo.icon}</span>

                  {/* Name + time */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[var(--text-primary)] truncate leading-tight">
                      {cue.name || `${typeInfo.label} ${idx + 1}`}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono">
                      {formatTimeMs(cue.position_ms ?? cue.time_ms ?? 0)}
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteCue?.(cue.id); }}
                    className="p-1 rounded hover:bg-red-500/15 text-[var(--text-muted)] hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-3 py-2 border-t border-[var(--border-subtle)] flex-shrink-0">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {CUE_TYPES.slice(0, 4).map(t => (
            <span key={t.value} className="text-[9px] text-[var(--text-muted)]">
              {t.icon} {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CuesTab;
