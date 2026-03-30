'use client';

import { Track } from '@/types';
import { formatTimeMs } from '@/lib/constants';

interface HistoryEntry {
  trackId: number;
  timestamp: string;
}

interface HistoryTabProps {
  tracks: Track[];
  history?: HistoryEntry[];
}

export function HistoryTab({
  tracks = [],
  history = [],
}: HistoryTabProps) {
  const trackMap = new Map(tracks.map((t) => [t.id, t]));

  const historyWithTracks = history
    .map((entry) => ({
      ...entry,
      track: trackMap.get(entry.trackId),
    }))
    .filter((entry) => entry.track);

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
      <div className="text-sm font-semibold text-[var(--text-secondary)]">Historique de lecture</div>

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
                  {entry.track?.title || entry.track?.filename}
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
