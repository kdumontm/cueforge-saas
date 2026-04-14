'use client';

import { useState, useEffect } from 'react';
import {
  ArrowLeft, Clock, Music, ListMusic, Zap, FileUp, Download,
  Settings, Loader2, ChevronDown,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ActivityLog {
  id: number;
  action: string;
  resource_type: string | null;
  resource_id: number | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  'track.uploaded': <FileUp size={16} className="text-blue-400" />,
  'track.analyzed': <Zap size={16} className="text-purple-400" />,
  'playlist.created': <ListMusic size={16} className="text-green-400" />,
  'playlist.modified': <ListMusic size={16} className="text-green-300" />,
  'export.rekordbox': <Download size={16} className="text-orange-400" />,
  'cue.created': <Music size={16} className="text-cyan-400" />,
  'settings.updated': <Settings size={16} className="text-slate-400" />,
};

const ACTION_LABELS: Record<string, string> = {
  'track.uploaded': 'Track importé',
  'track.analyzed': 'Track analysé',
  'playlist.created': 'Playlist créée',
  'playlist.modified': 'Playlist modifiée',
  'export.rekordbox': 'Export Rekordbox',
  'cue.created': 'Cue point créé',
  'settings.updated': 'Réglages mis à jour',
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'à l\'instant';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days}j`;

  return date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' });
}

export default function ActivityPage() {
  const router = useRouter();
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  useEffect(() => {
    loadActivities();
  }, [page]);

  async function loadActivities() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), per_page: '20' });
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/activity?${params}`,
        { credentials: 'include' }
      );
      if (res.ok) {
        const data = await res.json();
        // L'API peut retourner un array ou un objet {activities: [...]}
        const items: ActivityLog[] = Array.isArray(data) ? data : (data.activities || data.items || []);
        if (page === 1) {
          setActivities(items);
        } else {
          setActivities(prev => [...prev, ...items]);
        }
        setHasMore(items.length >= 20);
      }
    } catch {}
    setLoading(false);
  }

  const filteredActivities = selectedAction
    ? activities.filter(a => a.action === selectedAction)
    : activities;

  const uniqueActions = Array.from(new Set(activities.map(a => a.action)));

  return (
    <div className="p-6 max-w-3xl">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors bg-transparent border-none cursor-pointer mb-5 p-0"
      >
        <ArrowLeft size={14} /> Retour
      </button>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2 mb-2">
          <Clock size={20} /> Historique d'activité
        </h1>
        <p className="text-[13px] text-[var(--text-muted)]">
          Suivi de toutes vos actions sur TrackCue
        </p>
      </div>

      {/* Filter dropdown */}
      {uniqueActions.length > 0 && (
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setSelectedAction(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedAction === null
                ? 'bg-blue-600 text-white'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Tous
          </button>
          {uniqueActions.slice(0, 5).map(action => (
            <button
              key={action}
              onClick={() => setSelectedAction(action)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedAction === action
                  ? 'bg-blue-600 text-white'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {ACTION_LABELS[action] || action}
            </button>
          ))}
        </div>
      )}

      {/* Timeline */}
      {loading && filteredActivities.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-[var(--text-muted)]">
          <Loader2 size={20} className="animate-spin mr-2" /> Chargement...
        </div>
      ) : filteredActivities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center bg-[var(--bg-card)] rounded-2xl border border-dashed border-[var(--border-subtle)]">
          <Clock size={32} className="text-[var(--text-muted)] mb-3 opacity-40" />
          <p className="text-[14px] font-medium text-[var(--text-secondary)]">Aucune activité</p>
          <p className="text-[12px] text-[var(--text-muted)] mt-1">
            Commencez à importer et analyser des tracks
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-500/50 to-purple-500/50" />

          {/* Activity entries */}
          <div className="space-y-4">
            {filteredActivities.map((activity, idx) => (
              <div key={activity.id} className="relative pl-16">
                {/* Dot on timeline */}
                <div className="absolute left-0 w-12 h-12 flex items-center justify-center">
                  <div className="w-11 h-11 rounded-full bg-[var(--bg-card)] border-2 border-blue-500 flex items-center justify-center">
                    {ACTION_ICONS[activity.action] || <Clock size={16} className="text-slate-400" />}
                  </div>
                </div>

                {/* Content */}
                <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                        {ACTION_LABELS[activity.action] || activity.action}
                      </p>
                      {activity.metadata?.title && (
                        <p className="text-[12px] text-[var(--text-muted)] mt-1">
                          {activity.metadata.title}
                        </p>
                      )}
                      {activity.metadata?.description && (
                        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                          {activity.metadata.description}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                      {formatRelativeTime(activity.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Load more button */}
          {hasMore && (
            <div className="flex justify-center mt-6">
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Chargement...
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} /> Charger plus
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
