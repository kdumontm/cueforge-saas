// @ts-nocheck
'use client';

import { useState } from 'react';
import { Track, CuePoint } from '@/types';
import { HOT_CUE_COLORS, formatTimeMs } from '@/lib/constants';
import { Trash2, Plus, GripVertical } from 'lucide-react';

interface CuesTabProps {
  track: Track | null;
  cuePoints?: CuePoint[];
  onCreateCue?: (cue: { name: string; position_ms: number; color: string; cue_type: string; number?: number }) => void;
  onDeleteCue?: (cueId: number) => void;
  onCueClick?: (cue: CuePoint) => void;
  /** Position actuelle du playhead en ms */
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

  // Reconstruct display order: localOrder holds indices into cuePoints
  const indices = localOrder.length === cuePoints.length
    && localOrder.every(i => i < cuePoints.length)
    ? localOrder
    : cuePoints.map((_, i) => i);

  const cues = indices.map(i => cuePoints[i]);

  // When cuePoints change (new cue added/deleted), reset order
  if (localOrder.length !== cuePoints.length) {
    setLocalOrder(cuePoints.map((_, i) => i));
  }

  // ── Add cue at playhead ─────────────────────────────────────────────
  const handleAddCue = () => {
    const posMs = initialPositionMs ?? 0;
    const nextColor = HOT_CUE_COLORS[cuePoints.length % HOT_CUE_COLORS.length];
    onCreateCue?.({
      name: `Cue ${cuePoints.length + 1}`,
      position_ms: posMs,
      color: nextColor,
      cue_type: 'hot_cue',
      number: cuePoints.length,
    });
  };

  // ── Drag reorder ────────────────────────────────────────────────────
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

  return (
    <div className="flex flex-col h-full">

      {/* Bouton add — crée directement à la position du playhead */}
      <div className="p-3 border-b border-[var(--border-subtle)] flex-shrink-0">
        <button
          onClick={handleAddCue}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
        >
          <Plus size={13} />
          + Cue à {posLabel}
        </button>
      </div>

      {/* Liste des cues */}
      <div className="flex-1 overflow-y-auto">
        {cues.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 text-[var(--text-muted)] text-xs gap-1 p-4">
            <span>Aucun cue — positionne le playhead puis clique le bouton</span>
          </div>
        ) : (
          <div className="p-2 flex flex-col gap-1">
            {cues.map((cue, idx) => (
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

                {/* Badge coloré */}
                <div
                  className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ backgroundColor: cue.color || cue.color_rgb || '#666' }}
                >
                  {idx + 1}
                </div>

                {/* Nom + temps */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-[var(--text-primary)] truncate leading-tight">
                    {cue.name || `Cue ${idx + 1}`}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">
                    {formatTimeMs(cue.position_ms ?? cue.time_ms ?? 0)}
                  </div>
                </div>

                {/* Supprimer */}
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteCue?.(cue.id); }}
                  className="p-1 rounded hover:bg-red-500/15 text-[var(--text-muted)] hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CuesTab;
