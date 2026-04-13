'use client';

import { useState } from 'react';
import { Plus, Trash2, GripVertical, Music } from 'lucide-react';

interface Playlist {
  id: number;
  name: string;
  track_count: number;
}

interface PlaylistsTabProps {
  playlists: Playlist[];
  onSelect?: (playlist: Playlist) => void;
  onCreate?: (name: string) => void;
  onDelete?: (playlistId: number) => void;
  onRename?: (playlistId: number, newName: string) => void;
}

export function PlaylistsTab({
  playlists = [],
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: PlaylistsTabProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const handleCreate = () => {
    if (newName.trim()) {
      onCreate?.(newName);
      setNewName('');
      setShowCreate(false);
    }
  };

  const handleCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreate();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowCreate(false);
      setNewName('');
    }
  };

  const handleStartRename = (playlist: Playlist) => {
    setEditingId(playlist.id);
    setEditingName(playlist.name);
  };

  const handleSaveRename = (playlistId: number) => {
    if (editingName.trim() && editingName !== playlists.find(p => p.id === playlistId)?.name) {
      onRename?.(playlistId, editingName);
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const playlistId = editingId;
      if (playlistId !== null) {
        handleSaveRename(playlistId);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingId(null);
      setEditingName('');
    }
  };

  const handleConfirmDelete = (playlistId: number) => {
    onDelete?.(playlistId);
    setDeleteConfirmId(null);
  };

  return (
    <div className="space-y-4 p-4">
      <button
        onClick={() => setShowCreate(!showCreate)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        Nouvelle playlist
      </button>

      {showCreate && (
        <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleCreateKeyDown}
            placeholder="Nom de la playlist..."
            className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded text-[var(--text-primary)] text-sm placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="flex-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              Créer
            </button>
            <button
              onClick={() => {
                setShowCreate(false);
                setNewName('');
              }}
              className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-sm font-medium transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {playlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center rounded-lg border border-[var(--border-subtle)] border-dashed">
            <Music className="w-10 h-10 text-[var(--text-muted)] mb-3 opacity-40" />
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Pas encore de playlists</p>
            <p className="text-xs text-[var(--text-muted)] mb-4">Créez votre première playlist pour organiser vos morceaux</p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              Créer une playlist
            </button>
          </div>
        ) : (
          playlists.map((playlist) => (
            <div
              key={playlist.id}
              onClick={() => !editingId && onSelect?.(playlist)}
              className="group w-full text-left flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-colors cursor-pointer"
            >
              {/* Drag handle visual hint */}
              <div className="flex items-center justify-center w-4 h-4 opacity-0 group-hover:opacity-40 transition-opacity">
                <GripVertical className="w-3 h-3 text-[var(--text-muted)]" />
              </div>

              <div className="flex-1 min-w-0">
                {editingId === playlist.id ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={handleRenameKeyDown}
                    onBlur={() => handleSaveRename(playlist.id)}
                    className="w-full px-2 py-1 bg-[var(--bg-primary)] border border-blue-500 rounded text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <div
                      onDoubleClick={() => handleStartRename(playlist)}
                      className="text-sm font-medium text-[var(--text-primary)] truncate cursor-text hover:opacity-80 transition-opacity"
                      title="Double-clic pour renommer"
                    >
                      {playlist.name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="inline-flex items-center px-2 py-0.5 rounded bg-[var(--bg-primary)] text-xs font-medium text-[var(--text-muted)]">
                        <Music className="w-3 h-3 mr-1" />
                        {playlist.track_count} morceau{playlist.track_count !== 1 ? 'x' : ''}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {deleteConfirmId === playlist.id ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConfirmDelete(playlist.id);
                  }}
                  className="px-2 py-1 rounded text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
                >
                  Confirmer?
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmId(playlist.id);
                  }}
                  className="p-2 hover:bg-[var(--bg-hover)] rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="Supprimer"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default PlaylistsTab;
