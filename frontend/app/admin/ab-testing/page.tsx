'use client';

import { useState, useEffect } from 'react';
import adminApi from '../_components/api';

interface ABTest {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'completed';
  test_type: 'split' | 'multivariate';
  target_page: string;
  variants: string[];
  created_at: string;
}

interface Stats {
  total: number;
  running: number;
  completed: number;
}

export default function ABTestingPage() {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, running: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    test_type: 'split' as 'split' | 'multivariate',
    target_page: '',
    variants: ['', ''],
  });

  useEffect(() => {
    loadTests();
    loadStats();
  }, []);

  const loadTests = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getABTests();
      setTests(data);
    } catch (error) {
      console.error('Erreur chargement tests:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const data = await adminApi.getABTestsOverview();
      setStats(data);
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    }
  };

  const handleCreateTest = async () => {
    if (!formData.name || !formData.target_page) return;

    try {
      await adminApi.createABTest({
        name: formData.name,
        test_type: formData.test_type,
        target_page: formData.target_page,
        variants: formData.variants.filter((v) => v.trim()),
      });

      setFormData({
        name: '',
        test_type: 'split',
        target_page: '',
        variants: ['', ''],
      });
      setShowModal(false);
      loadTests();
      loadStats();
    } catch (error) {
      console.error('Erreur création test:', error);
    }
  };

  const handleStartTest = async (id: string) => {
    try {
      await adminApi.startABTest(id);
      loadTests();
      loadStats();
    } catch (error) {
      console.error('Erreur démarrage test:', error);
    }
  };

  const handleStopTest = async (id: string) => {
    try {
      await adminApi.stopABTest(id);
      loadTests();
      loadStats();
    } catch (error) {
      console.error('Erreur arrêt test:', error);
    }
  };

  const handlePauseTest = async (id: string) => {
    try {
      await adminApi.pauseABTest(id);
      loadTests();
      loadStats();
    } catch (error) {
      console.error('Erreur pause test:', error);
    }
  };

  const handleDuplicateTest = async (id: string) => {
    try {
      await adminApi.duplicateABTest(id);
      loadTests();
      loadStats();
    } catch (error) {
      console.error('Erreur duplication test:', error);
    }
  };

  const handleDeleteTest = async (id: string) => {
    if (!confirm('Êtes-vous sûr?')) return;

    try {
      await adminApi.deleteABTest(id);
      loadTests();
      loadStats();
    } catch (error) {
      console.error('Erreur suppression test:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-600';
      case 'running':
        return 'bg-green-600';
      case 'completed':
        return 'bg-blue-600';
      default:
        return 'bg-gray-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft':
        return 'Brouillon';
      case 'running':
        return 'En cours';
      case 'completed':
        return 'Complété';
      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Tests A/B</h1>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition"
          >
            Créer un test
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-[#0a0a1a] p-6 rounded-lg border border-purple-600">
            <div className="text-gray-400 text-sm mb-2">Total</div>
            <div className="text-3xl font-bold">{stats.total}</div>
          </div>
          <div className="bg-[#0a0a1a] p-6 rounded-lg border border-green-600">
            <div className="text-gray-400 text-sm mb-2">En cours</div>
            <div className="text-3xl font-bold">{stats.running}</div>
          </div>
          <div className="bg-[#0a0a1a] p-6 rounded-lg border border-blue-600">
            <div className="text-gray-400 text-sm mb-2">Complétés</div>
            <div className="text-3xl font-bold">{stats.completed}</div>
          </div>
        </div>

        {/* Tests List */}
        {loading ? (
          <div className="text-center py-8 text-gray-400">Chargement...</div>
        ) : tests.length === 0 ? (
          <div className="text-center py-8 text-gray-400">Aucun test pour le moment</div>
        ) : (
          <div className="bg-[#0a0a1a] rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-400">Nom</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-400">Type</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-400">Page cible</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-400">Statut</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-400">Variantes</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((test) => (
                  <tr key={test.id} className="border-b border-gray-700 hover:bg-gray-800/30">
                    <td className="px-6 py-4 text-sm">{test.name}</td>
                    <td className="px-6 py-4 text-sm">
                      {test.test_type === 'split' ? 'Split' : 'Multivarié'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">{test.target_page}</td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium text-white ${getStatusColor(
                          test.status
                        )}`}
                      >
                        {getStatusLabel(test.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">{test.variants.length}</td>
                    <td className="px-6 py-4 text-sm space-x-2">
                      {test.status === 'draft' && (
                        <button
                          onClick={() => handleStartTest(test.id)}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs font-medium transition"
                        >
                          Démarrer
                        </button>
                      )}
                      {test.status === 'running' && (
                        <>
                          <button
                            onClick={() => handlePauseTest(test.id)}
                            className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-xs font-medium transition"
                          >
                            Pause
                          </button>
                          <button
                            onClick={() => handleStopTest(test.id)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-medium transition"
                          >
                            Arrêter
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDuplicateTest(test.id)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium transition"
                      >
                        Dupliquer
                      </button>
                      <button
                        onClick={() => handleDeleteTest(test.id)}
                        className="px-3 py-1 bg-red-700 hover:bg-red-800 rounded text-xs font-medium transition"
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-[#0a0a1a] rounded-lg p-6 max-w-md w-full border border-purple-600">
              <h2 className="text-xl font-bold mb-4">Créer un nouveau test</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Nom du test</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full bg-[#1a1a2e] border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-600"
                    placeholder="Ex: Couleur bouton CTA"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Type de test</label>
                  <select
                    value={formData.test_type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        test_type: e.target.value as 'split' | 'multivariate',
                      })
                    }
                    className="w-full bg-[#1a1a2e] border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-purple-600"
                  >
                    <option value="split">Split (A/B)</option>
                    <option value="multivariate">Multivarié</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Page cible</label>
                  <input
                    type="text"
                    value={formData.target_page}
                    onChange={(e) =>
                      setFormData({ ...formData, target_page: e.target.value })
                    }
                    className="w-full bg-[#1a1a2e] border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-600"
                    placeholder="Ex: /landing"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Variantes</label>
                  {formData.variants.map((variant, index) => (
                    <input
                      key={index}
                      type="text"
                      value={variant}
                      onChange={(e) => {
                        const newVariants = [...formData.variants];
                        newVariants[index] = e.target.value;
                        setFormData({ ...formData, variants: newVariants });
                      }}
                      className="w-full bg-[#1a1a2e] border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-600 mb-2"
                      placeholder={`Variante ${index + 1}`}
                    />
                  ))}
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
                  onClick={handleCreateTest}
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
