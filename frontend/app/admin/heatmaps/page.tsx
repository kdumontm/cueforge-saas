'use client';

import { useState, useEffect } from 'react';
import adminApi from '../_components/api';

interface Heatmap {
  id: string;
  name: string;
  page_url: string;
  heatmap_type: 'click' | 'scroll' | 'move' | 'attention';
  sample_rate: number;
  active: boolean;
  paused: boolean;
  created_at: string;
}

export default function HeatmapsPage() {
  const [heatmaps, setHeatmaps] = useState<Heatmap[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [heatmapTypes, setHeatmapTypes] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    page_url: '',
    heatmap_type: 'click' as 'click' | 'scroll' | 'move' | 'attention',
    sample_rate: 100,
  });

  useEffect(() => {
    loadHeatmaps();
    loadHeatmapTypes();
  }, []);

  const loadHeatmaps = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getHeatmaps();
      setHeatmaps(data);
    } catch (error) {
      console.error('Erreur chargement heatmaps:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHeatmapTypes = async () => {
    try {
      const types = await adminApi.getHeatmapTypes();
      setHeatmapTypes(types);
    } catch (error) {
      console.error('Erreur chargement types:', error);
    }
  };

  const handleCreateHeatmap = async () => {
    if (!formData.name || !formData.page_url) return;

    try {
      await adminApi.createHeatmap({
        name: formData.name,
        page_url: formData.page_url,
        heatmap_type: formData.heatmap_type,
        sample_rate: formData.sample_rate,
      });

      setFormData({
        name: '',
        page_url: '',
        heatmap_type: 'click',
        sample_rate: 100,
      });
      setShowModal(false);
      loadHeatmaps();
    } catch (error) {
      console.error('Erreur création heatmap:', error);
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    try {
      await adminApi.updateHeatmap(id, { active: !active });
      loadHeatmaps();
    } catch (error) {
      console.error('Erreur mise à jour statut:', error);
    }
  };

  const handleTogglePaused = async (id: string, paused: boolean) => {
    try {
      await adminApi.updateHeatmap(id, { paused: !paused });
      loadHeatmaps();
    } catch (error) {
      console.error('Erreur mise à jour pause:', error);
    }
  };

  const handleDeleteHeatmap = async (id: string) => {
    if (!confirm('Êtes-vous sûr?')) return;

    try {
      await adminApi.deleteHeatmap(id);
      loadHeatmaps();
    } catch (error) {
      console.error('Erreur suppression heatmap:', error);
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      click: 'Clics',
      scroll: 'Défilement',
      move: 'Mouvements',
      attention: 'Attention',
    };
    return labels[type] || type;
  };

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Cartes de chaleur</h1>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition"
          >
            Créer une carte
          </button>
        </div>

        {/* Heatmaps List */}
        {loading ? (
          <div className="text-center py-8 text-gray-400">Chargement...</div>
        ) : heatmaps.length === 0 ? (
          <div className="text-center py-8 text-gray-400">Aucune carte pour le moment</div>
        ) : (
          <div className="grid gap-4">
            {heatmaps.map((heatmap) => (
              <div
                key={heatmap.id}
                className="bg-[#0a0a1a] rounded-lg p-6 border border-gray-700 hover:border-purple-600 transition"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold mb-1">{heatmap.name}</h3>
                    <p className="text-gray-400 text-sm">{heatmap.page_url}</p>
                  </div>
                  <div className="flex gap-2">
                    {heatmap.active && (
                      <span className="px-2 py-1 bg-green-600/20 text-green-400 rounded-full text-xs font-medium">
                        Actif
                      </span>
                    )}
                    {heatmap.paused && (
                      <span className="px-2 py-1 bg-yellow-600/20 text-yellow-400 rounded-full text-xs font-medium">
                        En pause
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <span className="text-gray-400 text-sm">Type</span>
                    <p className="font-medium">{getTypeLabel(heatmap.heatmap_type)}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Taux d'échantillonnage</span>
                    <p className="font-medium">{heatmap.sample_rate}%</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleActive(heatmap.id, heatmap.active)}
                    className={`px-3 py-1 rounded text-xs font-medium transition ${
                      heatmap.active
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-gray-600 hover:bg-gray-700'
                    }`}
                  >
                    {heatmap.active ? 'Désactiver' : 'Activer'}
                  </button>

                  <button
                    onClick={() => handleTogglePaused(heatmap.id, heatmap.paused)}
                    className={`px-3 py-1 rounded text-xs font-medium transition ${
                      heatmap.paused
                        ? 'bg-yellow-600 hover:bg-yellow-700'
                        : 'bg-gray-600 hover:bg-gray-700'
                    }`}
                  >
                    {heatmap.paused ? 'Reprendre' : 'Pause'}
                  </button>

                  <button
                    onClick={() => handleDeleteHeatmap(heatmap.id)}
                    className="px-3 py-1 bg-red-700 hover:bg-red-800 rounded text-xs font-medium transition"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-[#0a0a1a] rounded-lg p-6 max-w-md w-full border border-purple-600">
              <h2 className="text-xl font-bold mb-4">Créer une carte de chaleur</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Nom</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full bg-[#1a1a2e] border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-600"
                    placeholder="Ex: Clics page d'accueil"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">URL de la page</label>
                  <input
                    type="text"
                    value={formData.page_url}
                    onChange={(e) =>
                      setFormData({ ...formData, page_url: e.target.value })
                    }
                    className="w-full bg-[#1a1a2e] border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-600"
                    placeholder="Ex: /dashboard"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Type de carte</label>
                  <select
                    value={formData.heatmap_type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        heatmap_type: e.target.value as 'click' | 'scroll' | 'move' | 'attention',
                      })
                    }
                    className="w-full bg-[#1a1a2e] border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-purple-600"
                  >
                    <option value="click">Clics</option>
                    <option value="scroll">Défilement</option>
                    <option value="move">Mouvements</option>
                    <option value="attention">Attention</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Taux d'échantillonnage: {formData.sample_rate}%
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={formData.sample_rate}
                    onChange={(e) =>
                      setFormData({ ...formData, sample_rate: parseInt(e.target.value) })
                    }
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-600 rounded-lg font-medium hover:border-gray-500 transition"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCreateHeatmap}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition"
                >
                  Créer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
