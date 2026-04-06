'use client';

import { useMemo, useState } from 'react';
import { Trash2, X, History } from 'lucide-react';
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
  onSelectTrack?: (track: Track) => void;
  onDeleteEntry?: (index: number) => void;
}

type DateCategory = 'today' | 'yesterday' | 'thisWeek' | 'older';

interface GroupedEntry {
  entry: HistoryEntry & { track: Track };
  originalIndex: number;
  category: DateCategory;
  relativeTime: string;
}

export function HistoryTab({
  tracks = [],
  history = [],
  onHistoryCleared,
  onSelectTrack,
  onDeleteEntry,
}: HistoryTabProps) {
  const [clearing, setClearing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const trackMap = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);

  // Use useMemo instead of useState to properly track prop changes
  const historyWithTracks = useMemo(() => {
    return history
      .map((entry, originalIndex) => ({
        entry: {
          ...entry,
          track: trackMap.get(entry.trackId),
        },
        originalIndex,
      }))
      .filter((item) => item.entry.track)
      .map((item) => ({
        ...item,
        entry: item.entry as HistoryEntry & { track: Track },
      }));
  }, [history, trackMap]);

  const getDateCategory = (timestamp: string): DateCategory => {
    try {
      const date = new Date(timestamp);
      const now = new Date();

      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);

      if (date >= todayStart) return 'today';
      if (date >= yesterdayStart) return 'yesterday';
      if (date >= weekStart) return 'thisWeek';
      return 'older';
    } catch {
      return 'older';
    }
  };

  const formatTime = (timestamp: string): string => {
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

  // Group entries by date category
  const groupedEntries = useMemo(() => {
    const grouped: Record<DateCategory, GroupedEntry[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    };

    historyWithTracks.forEach((item) => {
      const category = getDateCategory(item.entry.timestamp);
      grouped[category].push({
        entry: item.entry,
        originalIndex: item.originalIndex,
        category,
        relativeTime: formatTime(item.entry.timestamp),
      });
    });

    return grouped;
  }, [historyWithTracks]);

  const handleClearAll = async () => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setClearing(true);
    try {
      await clearAllHistory();
      setConfirm(false);
      onHistoryCleared?.();
    } catch {
      // silent fail
    } finally {
      setClearing(false);
    }
  };

  const handleDeleteEntry = (index: number) => {
    onDeleteEntry?.(index);
  };

  const getCategoryLabel = (category: DateCategory): string => {
    const labels: Record<DateCategory, string> = {
      today: 'Aujourd\'hui',
      yesterday: 'Hier',
      thisWeek: 'Cette semaine',
      older: 'Plus ancien',
    };
    return labels[category];
  };

  const totalEntries = historyWithTracks.length;

  return (
    <div className="space-y-4 p-4">
      {/* Header + bouton clear */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-[var(--text-secondary)]">
          Historique de lecture
          {totalEntries > 0 && (
            <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
              ({totalEntries})
            </span>
          )}
        </div>
        {totalEntries > 0 && (
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

      {totalEntries === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <History size={40} className="text-[var(--text-muted)] mb-3 opacity-50" />
          <p className="text-sm text-[var(--text-muted)]">Aucune lecture enregistrée</p>
          <p className="text-xs text-[var(--text-muted)] opacity-70 mt-1">
            Vos morceaux écoutés apparaîtront ici
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {(['today', 'yesterday', 'thisWeek', 'older'] as DateCategory[]).map((category) => {
            const entries = groupedEntries[category];
            if (entries.length === 0) return null;

            return (
              <div key={category} className="space-y-2">
                <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide px-1">
                  {getCategoryLabel(category)}
                </h3>
                <div className="space-y-1.5">
                  {entries.map((item) => (
                    <div
                      key={`${item.originalIndex}-${item.entry.timestamp}`}
                      className="group flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)]/80 transition-all cursor-pointer"
                      onClick={() => onSelectTrack?.(item.entry.track)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {item.entry.track?.title || (item.entry.track as any)?.filename}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {item.entry.track?.artist || 'Artiste inconnu'}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {item.entry.track?.analysis?.bpm && (
                          <div className="px-2 py-1 rounded-lg bg-[var(--bg-primary)] text-xs font-mono text-[var(--text-secondary)]">
                            {item.entry.track.analysis.bpm.toFixed(1)} BPM
                          </div>
                        )}
                        <div className="text-xs text-[var(--text-muted)] text-right whitespace-nowrap">
                          {item.relativeTime}
                        </div>
                      </div>

                      {/* Delete button - appears on hover */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteEntry(item.originalIndex);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-1.5 rounded-md hover:bg-red-500/20 text-[var(--text-muted)] hover:text-red-400"
                        title="Supprimer cette entrée"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default HistoryTab;
