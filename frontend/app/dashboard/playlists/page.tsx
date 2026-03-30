'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ListMusic, Plus, Trash2, Disc3, FolderOpen, ChevronRight,
  Music, MoreVertical, Edit2, Check, X, Loader2, Copy,
} from 'lucide-react';
import {
  listPlaylists, createPlaylist, deletePlaylist, updatePlaylist,
} from '@/lib/api';
import type { Playlist } from '@/lib/api';

export default function PlaylistsPage() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [openMenu, setOpenMenu] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await listPlaylists();
      setPlaylists(data);
    } catch {}
    finally { setLoading(false); }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const pl = await createPlaylist({ name: newName.trim() });
      setPlaylists(prev => [pl, ...prev]);
      setNewName('');
      setCreating(false);
    } catch {}
  }

  async function handleDelete(id: number) {
    try {
      await deletePlaylist(id);
      setPlaylists(prev => prev.filter(p => p.id !== id));
    } catch {}
    setOpenMenu(null);
  }

  async function handleRename(id: number) {
    if (!editingName.trim()) return;
    try {
      const updated = await updatePlaylist(id, { name: editingName.trim() });
      setPlaylists(prev => prev.map(p => p.id === id ? { ...p, name: updated.name } : p));
      setEditingId(null);
    } catch {}
  }

  const folders = playlists.filter(p => p.is_folder);
  const regular = playlists.filter(p => !p.is_folder);

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ListMusic size={20} className="text-blue-400" />
            Playlists
          </h1>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
            {regular.length} playlist{regular.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors border-none cursor-pointer"
          >
            <Plus size={14} /> Nouvelle playlist
          </button>
        </div>
      </div>

      {/* New playlist form */}
      {creating && (
        <form onSubmit={handleCreate} className="flex items-center gap-2 mb-4 bg-[var(--bg-card)] border border-blue-500/40 rounded-xl p-3">
          <Disc3 size={16} className="text-blue-400 flex-shrink-0" />
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Nom de la playlist..."
            className="flex-1 bg-transparent text-[var(--text-primary)] text-sm outline-none placeholder:text-[var(--text-muted)]"
            onKeyDown={e => e.key === 'Escape' && setCreating(false)}
          />
          <button type="submit" className="p-1 text-green-400 hover:text-green-300 bg-transparent border-none cursor-pointer">
            <Check size={15} />
          </button>
          <button type="button" onClick={() => setCreating(false)} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer">
            <X size={15} />
          </button>
        </form>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
          <Loader2 size={20} className="animate-spin mr-2" /> Chargement...
        </div>
      )}

      {/* Empty state */}
      {!loading && playlists.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-600/10 flex items-center justify-center mb-4">
            <ListMusic size={28} className="text-blue-400" />
          </div>
          <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">Aucune playlist</h3>
          <p className="text-[13px] text-[var(--text-muted)] mb-4">Crée ta première playlist pour organiser tes tracks</p>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors border-none cursor-pointer"
          >
            <Plus size={14} /> Créer une playlist
          </button>
        </div>
      )}

      {/* Playlist grid */}
      {!loading && regular.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {regular.map((pl) => (
            <div
              key={pl.id}
              className="relative group bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-blue-500/30 rounded-xl p-4 cursor-pointer transition-all hover:shadow-lg hover:shadow-blue-900/10"
              onClick={() => {
                if (editingId !== pl.id) router.push(`/dashboard/playlists/${pl.id}`);
              }}
            >
              {/* Artwork placeholder */}
              <div className="w-full aspect-square rounded-lg bg-gradient-to-br from-blue-900/40 to-purple-900/40 flex items-center justify-center mb-3 overflow-hidden">
                <Music size={32} className="text-blue-400/50" />
              </div>

              {/* Name */}
              {editingId === pl.id ? (
                <form onSubmit={(e) => { e.preventDefault(); handleRename(pl.id); }} onClick={e => e.stopPropagation()}>
                  <input
                    autoFocus
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-blue-500 rounded px-2 py-1 text-sm text-[var(--text-primary)] outline-none mb-1"
                    onKeyDown={e => e.key === 'Escape' && setEditingId(null)}
                  />
                  <div className="flex gap-1">
                    <button type="submit" className="p-1 text-green-400 bg-transparent border-none cursor-pointer"><Check size={13} /></button>
                    <button type="button" onClick={() => setEditingId(null)} className="p-1 text-[var(--text-muted)] bg-transparent border-none cursor-pointer"><X size={13} /></button>
                  </div>
                </form>
              ) : (
                <h3 className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{pl.name}</h3>
              )}
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {pl.track_count} track{pl.track_count !== 1 ? 's' : ''}
              </p>

              {/* Actions menu */}
              <div className="absolute top-2 right-2" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setOpenMenu(openMenu === pl.id ? null : pl.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer"
                >
                  <MoreVertical size={14} />
                </button>
                {openMenu === pl.id && (
                  <div className="absolute right-0 top-8 z-20 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-xl py-1 min-w-[140px]">
                    <button
                      onClick={() => { setEditingId(pl.id); setEditingName(pl.name); setOpenMenu(null); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer text-left"
                    >
                      <Edit2 size={13} /> Renommer
                    </button>
                    <button
                      onClick={() => handleDelete(pl.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-400 hover:bg-red-500/10 bg-transparent border-none cursor-pointer text-left"
                    >
                      <Trash2 size={13} /> Supprimer
                    </button>
                  </div>
                )}
              </div>

              <ChevronRight size={14} className="absolute bottom-4 right-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
