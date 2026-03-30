'use client';

import { useState } from 'react';
import { Track, CuePoint } from '@/types';
import { HOT_CUE_COLORS, formatTimeMs } from '@/lib/constants';
import { Trash2, Edit2, Plus, Wand2 } from 'lucide-react';

interface CuesTabProps {
  track: Track | null;
  cuePoints?: CuePoint[];
  onCreateCue: (cue: { name: string; position_ms: number; color: string; cue_type: string; number?: number }) => void;
  onDeleteCue: (cueId: number) => void;
  onCueClick?: (cue: CuePoint) => void;
  onAutoDetect?: () => void;
}

export function CuesTab({
  track,
  cuePoints = [],
  onCreateCue,
  onDeleteCue,
  onCueClick,
  onAutoDetect,
}: CuesTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [position, setPosition] = useState('0:00.000');
  const [selectedColor, setSelectedColor] = useState(HOT_CUE_COLORS[0]);
  const [cueType, setCueType] = useState<'hot_cue' | 'memory'>('hot_cue');

  if (!track) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--text-muted)]">
        <p>Sélectionne un morceau</p>
      </div>
    );
  }

  const handleCreateCue = () => {
    const parts = position.split(':');
    const minutes = parseInt(parts[0]) || 0;
    const seconds = parseFloat(parts[1] || '0') || 0;
    const positionMs = (minutes * 60 + seconds) * 1000;

    onCreateCue({
      name: name || `Cue ${cuePoints.length + 1}`,
      position_ms: positionMs,
      color: selectedColor,
      cue_type: cueType,
    });

    setName('');
    setPosition('0:00.000');
    setSelectedColor(HOT_CUE_COLORS[0]);
    setCueType('hot_cue');
    setShowForm(false);
  };

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Points de cue ({cuePoints.length})</h3>
        {cuePoints.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Aucun point de cue</p>
        ) : (
          <div className="space-y-2">
            {cuePoints.map((cue) => (
              <div
                key={cue.id}
                className="flex items-center gap-3 p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-default)]"
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cue.color || cue.color_rgb }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--text-primary)] truncate">{cue.name}</div>
                  <div className="text-xs text-[var(--text-muted)] flex gap-2">
                    <span>{formatTimeMs(cue.position_ms)}</span>
                    <span className="capitalize">
                      {cue.cue_mode === 'hot' ? 'Hot Cue' : 'Mémoire'}
                    </span>
                    {cue.number !== null && <span>Slot {cue.number}</span>}
                  </div>
                </div>
                <button
                  onClick={() => onCueClick?.(cue)}
                  className="p-1 hover:bg-[var(--bg-hover)] rounded transition-colors"
                  title="Éditer"
                >
                  <Edit2 className="w-4 h-4 text-blue-400" />
                </button>
                <button
                  onClick={() => onDeleteCue(cue.id)}
                  className="p-1 hover:bg-[var(--bg-hover)] rounded transition-colors"
                  title="Supprimer"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ajouter un cue
        </button>
        {onAutoDetect && (
          <button
            onClick={onAutoDetect}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
          >
            <Wand2 className="w-4 h-4" />
            Détection auto
          </button>
        )}
      </div>

      {showForm && (
        <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Drop, Build..."
              className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded text-[var(--text-primary)] text-sm placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Position (mm:ss.ms)</label>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="0:00.000"
              className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded text-[var(--text-primary)] text-sm placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">Couleur</label>
            <div className="flex gap-2">
              {HOT_CUE_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`w-7 h-7 rounded-lg border-2 transition-all ${
                    selectedColor === color ? 'border-white' : 'border-[var(--border-default)]'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Type</label>
            <select
              value={cueType}
              onChange={(e) => setCueType(e.target.value as 'hot_cue' | 'memory')}
              className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded text-[var(--text-primary)] text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="hot_cue">Hot Cue</option>
              <option value="memory">Mémoire</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCreateCue}
              className="flex-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              Créer
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-sm font-medium transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export default CuesTab;
