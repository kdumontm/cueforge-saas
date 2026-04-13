'use client';

import { useState, useEffect } from 'react';
import adminApi from '../_components/api';

interface SessionRecording {
  id: string;
  user_id: string;
  device: string;
  has_errors: boolean;
  has_rage_clicks: boolean;
  starred: boolean;
  duration: number;
  pages_visited: number;
  created_at: string;
  tags: string[];
}

interface Overview {
  total_recordings: number;
  avg_duration: number;
  recordings_with_errors: number;
  recordings_with_rage_clicks: number;
}

export default function SessionRecordingsPage() {
  const [recordings, setRecordings] = useState<SessionRecording[]>([]);
  const [overview, setOverview] = useState<Overview>({
    total_recordings: 0,
    avg_duration: 0,
    recordings_with_errors: 0,
    recordings_with_rage_clicks: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selectedRecording, setSelectedRecording] = useState<SessionRecording | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [filters, setFilters] = useState({
    device: '',
    has_errors: false,
    has_rage_clicks: false,
    starred: false,
  });
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    loadRecordings();
    loadOverview();
  }, [filters]);

  const loadRecordings = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getSessionRecordings(filters);
      setRecordings(data);
    } catch (error) {
      console.error('Erreur chargement enregistrements:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOverview = async () => {
    try {
      const data = await adminApi.getRecordingsOverview();
      setOverview(data);
    } catch (error) {
      console.error('Erreur chargement aperçu:', error);
    }
  };

  const handleStarRecording = async (id: string, starred: boolean) => {
    try {
      await adminApi.updateSessionRecording(id, { starred: !starred });
      loadRecordings();
    } catch (error) {
      console.error('Erreur marquage étoile:', error);
    }
  };

  const handleAddTag = async () => {
    if (!selectedRecording || !newTag.trim()) return;

    try {
      await adminApi.updateSessionRecording(selectedRecording.id, {
        tags: [...selectedRecording.tags, newTag],
      });
      setNewTag('');
      const updated = await adminApi.getSessionRecording(selectedRecording.id);
      setSelectedRecording(updated);
      loadRecordings();
    } catch (error) {
      console.error('Erreur ajout tag:', error);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!selectedRecording) return;

    try {
      const updatedTags = selectedRecording.tags.filter((t) => t !== tag);
      await adminApi.updateSessionRecording(selectedRecording.id, {
        tags: updatedTags,
      });
      const updated = await adminApi.getSessionRecording(selectedRecording.id);
      setSelectedRecording(updated);
      loadRecordings();
    } catch (error) {
      console.error('Erreur suppression tag:', error);
    }
  };

  const handleDeleteRecording = async (id: string) => {
    if (!confirm('Êtes-vous sûr?')) return;

    try {
      await adminApi.deleteSessionRecording(id);
      loadRecordings();
      setShowDetail(false);
    } catch (error) {
      console.error('Erreur suppression enregistrement:', error);
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  const handleViewDetail = async (recording: SessionRecording) => {
    try {
      const detail = await adminApi.getSessionRecording(recording.id);
      setSelectedRecording(detail);
      setShowDetail(true);
    } catch (error) {
      console.error('Erreur chargement détails:', error);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <h1 className="text-3xl font-bold mb-8">Enregistrements de sessions</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-[#0a0a1a] p-6 rounded-lg border border-purple-600">
            <div className="text-gray-400 text-sm mb-2">Total</div>
            <div className="text-3xl font-bold">{overview.total_recordings}</div>
          </div>
          <div className="bg-[#0a0a1a] p-6 rounded-lg border border-blue-600">
            <div className="text-gray-400 text-sm mb-2">Durée moyenne</div>
            <div className="text-3xl font-bold">{Math.round(overview.avg_duration)}s</div>
          </div>
          <div className="bg-[#0a0a1a] p-6 rounded-lg border border-red-600">
            <div className="text-gray-400 text-sm mb-2">Avec erreurs</div>
            <div className="text-3xl font-bold">{overview.recordings_with_errors}</div>
          </div>
          <div className="bg-[#0a0a1a] p-6 rounded-lg border border-orange-600">
            <div className="text-gray-400 text-sm mb-2">Clics rageux</div>
            <div className="text-3xl font-bold">{overview.recordings_with_rage_clicks}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-[#0a0a1a] p-4 rounded-lg mb-8 border border-gray-700">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Appareil</label>
              <input
                type="text"
                value={filters.device}
                onChange={(e) => setFilters({ ...filters, device: e.target.value })}
                className="w-full bg-[#1a1a2e] border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-600"
                placeholder="Ex: Chrome"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.has_errors}
                  onChange={(e) => setFilters({ ...filters, has_errors: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm">Avec erreurs</span>
              </label>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.has_rage_clicks}
                  onChange={(e) => setFilters({ ...filters, has_rage_clicks: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm">Clics rageux</span>
              </label>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.starred}
                  onChange={(e) => setFilters({ ...filters, starred: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm">Marqués</span>
              </label>
            </div>
          </div>
        </div>

        {/* Recordings List */}
        {loading ? (
          <div className="text-center py-8 text-gray-400">Chargement...</div>
        ) : recordings.length === 0 ? (
          <div className="text-center py-8 text-gray-400">Aucun enregistrement</div>
        ) : (
          <div className="bg-[#0a0a1a] rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-400">Utilisateur</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-400">Appareil</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-400">Pages</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-400">Durée</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-400">Statut</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recordings.map((recording) => (
                  <tr key={recording.id} className="border-b border-gray-700 hover:bg-gray-800/30">
                    <td className="px-6 py-4 text-sm">{recording.user_id}</td>
                    <td className="px-6 py-4 text-sm text-gray-400">{recording.device}</td>
                    <td className="px-6 py-4 text-sm">{recording.pages_visited}</td>
                    <td className="px-6 py-4 text-sm">{formatDuration(recording.duration)}</td>
                    <td className="px-6 py-4 text-sm space-x-2">
                      {recording.has_errors && (
                        <span className="px-2 py-1 bg-red-600/20 text-red-400 rounded-full text-xs">
                          Erreurs
                        </span>
                      )}
                      {recording.has_rage_clicks && (
                        <span className="px-2 py-1 bg-orange-600/20 text-orange-400 rounded-full text-xs">
                          Clics rageux
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm space-x-2">
                      <button
                        onClick={() => handleStarRecording(recording.id, recording.starred)}
                        className={`px-3 py-1 rounded text-xs font-medium transition ${
                          recording.starred
                            ? 'bg-yellow-600 hover:bg-yellow-700'
                            : 'bg-gray-600 hover:bg-gray-700'
                        }`}
                      >
                        {recording.starred ? '★' : '☆'}
                      </button>
                      <button
                        onClick={() => handleViewDetail(recording)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium transition"
                      >
                        Détails
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Detail Modal */}
        {showDetail && selectedRecording && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-[#0a0a1a] rounded-lg p-6 max-w-2xl w-full max-h-96 overflow-y-auto border border-purple-600">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold mb-2">Enregistrement: {selectedRecording.user_id}</h2>
                  <p className="text-gray-400 text-sm">{selectedRecording.device}</p>
                </div>
                <button
                  onClick={() => setShowDetail(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-gray-400 text-sm">Pages visitées</span>
                    <p className="text-lg font-medium">{selectedRecording.pages_visited}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Durée</span>
                    <p className="text-lg font-medium">{formatDuration(selectedRecording.duration)}</p>
                  </div>
                </div>

                <div>
                  <span className="text-gray-400 text-sm block mb-2">Tags</span>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedRecording.tags.map((tag) => (
                      <div
                        key={tag}
                        className="bg-purple-600/20 text-purple-400 px-2 py-1 rounded-full text-xs flex items-center gap-2"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-purple-300"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                      className="flex-1 bg-[#1a1a2e] border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-600 text-sm"
                      placeholder="Ajouter un tag..."
                    />
                    <button
                      onClick={handleAddTag}
                      className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium transition"
                    >
                      Ajouter
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowDetail(false)}
                  className="flex-1 px-4 py-2 border border-gray-600 rounded-lg font-medium hover:border-gray-500 transition"
                >
                  Fermer
                </button>
                <button
                  onClick={() => handleDeleteRecording(selectedRecording.id)}
                  className="flex-1 px-4 py-2 bg-red-700 hover:bg-red-800 rounded-lg font-medium transition"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
