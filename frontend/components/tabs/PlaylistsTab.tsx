'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

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
}

export function PlaylistsTab({
  playlists = [],
  onSelect,
  onCreate,
  onDelete,
}: PlaylistsTabProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    if (newName.trim()) {
      onCreate?.(newName);
      setNewName('');
      setShowCreate(false);
    }
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
        <div className="p-3 rounded-lg bg-gray-900 border border-gray-800 space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nom de la playlist..."
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
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
              onClick={() => setShowCreate(false)}
              className="flex-1 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {playlists.length === 0 ? (
          <p className="text-sm text-gray-500 p-3">Pas encore de playlists</p>
        ) : (
          playlists.map((playlist) => (
            <button
              key={playlist.id}
              onClick={() => onSelect?.(playlist)}
              className="w-full text-left flex items-center gap-3 p-3 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">
                  {playlist.name}
                </div>
                <div className="text-xs text-gray-400">
                  {playlist.track_count} morceau{playlist.track_count !== 1 ? 'x' : ''}
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(playlist.id);
                }}
                className="p-2 hover:bg-gray-800 rounded transition-colors"
                title="Supprimer"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
