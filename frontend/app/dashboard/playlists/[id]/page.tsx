'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, ListMusic, Music2, Disc3, Trash2, Download,
  Plus, Loader2, GripVertical, Clock, Zap, Hash,
} from 'lucide-react';
import { getPlaylist, removeTrackFromPlaylist, listTracks } from '@/lib/api';
import type { PlaylistDetail, PlaylistTrackItem } from '@/lib/api';
import type { Track } from '@/types';

function msToMin(ms: number | null | undefined) {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<number | null>(null);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      const data = await getPlaylist(Number(id));
      setPlaylist(data);
    } catch {}
    finally { setLoading(false); }
  }

  async function handleRemove(trackId: number) {
    if (!playlist) return;
    setRemovingId(trackId);
    try {
      await removeTrackFromPlaylist(playlist.id, trackId);
      setPlaylist(prev => prev ? {
        ...prev,
        tracks: prev.tracks.filter(t => t.track_id !== trackId),
        track_count: prev.track_count - 1,
      } : null);
    } catch {}
    setRemovingId(null);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-[var(--text-muted)]">
      <Loader2 size={20} className="animate-spin mr-2" /> Chargement...
    </div>
  );

  if (!playlist) return (
    <div className="p-6 text-[var(--text-muted)]">Playlist introuvable.</div>
  );

  const totalMs = 0; // Would sum analysis.duration_ms if available

  return (
    <div className="p-6 max-w-4xl">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors bg-transparent border-none cursor-pointer mb-5 p-0"
      >
        <ArrowLeft size={14} /> Retour aux playlists
      </button>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-blue-900/50 to-purple-900/50 flex items-center justify-center flex-shrink-0">
          <ListMusic size={32} className="text-blue-400/60" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">{playlist.name}</h1>
          {playlist.description && (
            <p className="text-[13px] text-[var(--text-muted)] mt-1">{playlist.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-[12px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1"><Music2 size={12} /> {playlist.track_count} tracks</span>
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '')}/api/v1/export/playlist/${playlist.id}/m3u`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs rounded-lg transition-colors"
            download
          >
            <Download size={13} /> M3U
          </a>
        </div>
      </div>

      {/* Track list */}
      {playlist.tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-[var(--bg-card)] rounded-2xl border border-dashed border-[var(--border-subtle)]">
          <Music2 size={32} className="text-[var(--text-muted)] mb-3 opacity-40" />
          <p className="text-[14px] font-medium text-[var(--text-secondary)]">Playlist vide</p>
          <p className="text-[12px] text-[var(--text-muted)] mt-1">
            Ajoute des tracks depuis le dashboard principal
          </p>
        </div>
      ) : (
        <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[28px_1fr_80px_40px] gap-3 px-4 py-2.5 border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            <span>#</span>
            <span>Titre</span>
            <span className="text-right">Durée</span>
            <span></span>
          </div>
          {playlist.tracks.map((entry, idx) => (
            <div
              key={entry.id}
              className="group grid grid-cols-[28px_1fr_80px_40px] gap-3 items-center px-4 py-3 hover:bg-[var(--bg-hover)] border-b border-[var(--border-subtle)] last:border-b-0 transition-colors"
            >
              {/* Number */}
              <span className="text-[12px] text-[var(--text-muted)] font-mono group-hover:opacity-0 transition-opacity">
                {idx + 1}
              </span>

              {/* Title + artist */}
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                  {entry.title || entry.filename || `Track ${entry.track_id}`}
                </p>
                {entry.artist && (
                  <p className="text-[11px] text-[var(--text-muted)] truncate">{entry.artist}</p>
                )}
              </div>

              {/* Duration placeholder */}
              <span className="text-[12px] text-[var(--text-muted)] font-mono text-right">—</span>

              {/* Remove */}
              <button
                onClick={() => handleRemove(entry.track_id)}
                disabled={removingId === entry.track_id}
                className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center w-7 h-7 rounded-lg hover:bg-red-500/15 text-[var(--text-muted)] hover:text-red-400 bg-transparent border-none cursor-pointer ml-auto"
                title="Retirer de la playlist"
              >
                {removingId === entry.track_id
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Trash2 size={12} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
