'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Track } from '@/types';
import { clearAllHistory } from '@/lib/api';

interface HistoryEntry {
  trackId: number;
  timestamp: string;
}

interface HistoryTabProps {
  tracks: Track[];
  history?: HistoryEntry[];
  onHistoryCleared?: () => void;
}

export function HistoryTab({
  tracks = [],
  history = [],
  onHistoryCleared,
}: HistoryTabProps) {
  const [localHistory, setLocalHistory] = useState(history);
  const [clearing, setClearing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const trackMap = new Map(tracks.map((t) => [t.id, t]));

  const historyWithTracks = localHistory
    .map((entry) => ({
      ...entry,
      track: trackMap.get(entry.trackId),
    }))
    .filter((entry) => entry.track);

  const handleClearAll = async () => {
    if (!confirm) { setConfirm(true); return; }
    setClearing(true);
    try {
      await clearAllHistory();
      setLocalHistory([]);
      setConfirm(false);
      onHistoryCleared?.();
    } catch {
      // silent fail
    } finally {
      setClearing(false);
    }
  };

  const formatDate = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'À l\'instant';
      if (diffMins < 60) return `Il y a ${diffMins} min`;
      if (diffHours < 24) return `Il y a ${diffHours}h`;
      if (diffDays < 7) return `Il y a ${diffDays}j`;

      return date.toLocaleDateString('fr-FR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header + bouton clear */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-[var(--text-secondary)]">
          Historique de lecture
          {localHistory.length > 0 && (
            <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
              ({localHistory.length})
            </span>
          )}
        </div>
        {localHistory.length > 0 && (
          <button
            onClick={handleClearAll}
            disabled={clearing}
            onBlur={() => setConfirm(false)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border cursor-pointer transition-all disabled:opacity-50 ${
              confirm
                ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30 font-semibold'
                : 'bg-transparent border-[var(--border-default)] text-[var(--text-muted)] hover:text-red-400 hover:border-red-500/40'
            }`}
            title="Vider tout l'historique"
          >
            <Trash2 size={11} />
            {clearing ? 'Suppression…' : confirm ? 'Confirmer ?' : 'Tout effacer'}
          </button>
        )}
      </div>

      {historyWithTracks.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] p-3">Aucune lecture enregistrée</p>
      ) : (
        <div className="space-y-2">
          {historyWithTracks.map((entry, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-default)]"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                  {entry.track?.title || (entry.track as any)?.filename}
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {entry.track?.artist || 'Artiste inconnu'}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {entry.track?.analysis?.bpm && (
                  <div className="px-2 py-1 rounded-lg bg-[var(--bg-primary)] text-xs font-mono text-[var(--text-secondary)]">
                    {entry.track.analysis.bpm.toFixed(1)} BPM
                  </div>
                )}
                <div className="text-xs text-[var(--text-muted)] text-right whitespace-nowrap">
                  {formatDate(entry.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default HistoryTab;
