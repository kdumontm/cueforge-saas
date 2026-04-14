'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '../_components/api';

interface EmailWorkflow {
  id: number;
  name: string;
  description: string;
  trigger_type: string;
  status: 'draft' | 'active' | 'paused';
  enrolled_count: number;
  completed_count: number;
  created_at: string;
}

interface WorkflowStats {
  id: number;
  enrolled: number;
  completed: number;
  open_rate: number;
  click_rate: number;
}

export default function EmailWorkflowsPage() {
  const [workflows, setWorkflows] = useState<EmailWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [stats, setStats] = useState<Record<string, WorkflowStats>>({});
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    trigger_type: 'signup',
  });

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getEmailWorkflows();
      setWorkflows(data);

      // Load stats for each workflow
      const statsData: Record<string, WorkflowStats> = {};
      for (const workflow of data) {
        try {
          const workflowStats = await adminApi.getWorkflowStats(workflow.id);
          statsData[workflow.id] = workflowStats;
        } catch (error) {
          console.error(`Erreur chargement stats ${workflow.id}:`, error);
        }
      }
      setStats(statsData);
    } catch (error) {
      console.error('Erreur chargement workflows:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorkflow = async () => {
    if (!formData.name || !formData.trigger_type) return;

    try {
      await adminApi.createEmailWorkflow({
        name: formData.name,
        description: formData.description,
        trigger_type: formData.trigger_type,
      });

      setFormData({
        name: '',
        description: '',
        trigger_type: 'signup',
      });
      setShowModal(false);
      loadWorkflows();
    } catch (error) {
      console.error('Erreur création workflow:', error);
    }
  };

  const handleActivateWorkflow = async (id: number) => {
    try {
      await adminApi.activateEmailWorkflow(id);
      loadWorkflows();
    } catch (error) {
      console.error('Erreur activation workflow:', error);
    }
  };

  const handlePauseWorkflow = async (id: number) => {
    try {
      await adminApi.pauseEmailWorkflow(id);
      loadWorkflows();
    } catch (error) {
      console.error('Erreur pause workflow:', error);
    }
  };

  const handleDuplicateWorkflow = async (id: number) => {
    try {
      await adminApi.duplicateEmailWorkflow(id);
      loadWorkflows();
    } catch (error) {
      console.error('Erreur duplication workflow:', error);
    }
  };

  const handleDeleteWorkflow = async (id: number) => {
    if (!confirm('Êtes-vous sûr?')) return;

    try {
      await adminApi.deleteEmailWorkflow(id);
      loadWorkflows();
    } catch (error) {
      console.error('Erreur suppression workflow:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-600';
      case 'active':
        return 'bg-green-600';
      case 'paused':
        return 'bg-yellow-600';
      default:
        return 'bg-gray-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft':
        return 'Brouillon';
      case 'active':
        return 'Actif';
      case 'paused':
        return 'En pause';
      default:
        return status;
    }
  };

  const getTriggerLabel = (trigger: string) => {
    const labels: Record<string, string> = {
      signup: 'Inscription',
      first_track: 'Première analyse',
      weekly: 'Hebdomadaire',
      monthly: 'Mensuel',
      abandonment: 'Abandon',
    };
    return labels[trigger] || trigger;
  };

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Flux de courrier</h1>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition"
          >
            Créer un flux
          </button>
        </div>

        {/* Workflows List */}
        {loading ? (
          <div className="text-center py-8 text-gray-400">Chargement...</div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-8 text-gray-400">Aucun flux pour le moment</div>
        ) : (
          <div className="grid gap-4">
            {workflows.map((workflow) => {
              const workflowStats = stats[workflow.id];
              return (
                <div
                  key={workflow.id}
                  className="bg-[#0a0a1a] rounded-lg p-6 border border-gray-700 hover:border-purple-600 transition"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold mb-1">{workflow.name}</h3>
                      <p className="text-gray-400 text-sm">{workflow.description}</p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium text-white ${getStatusColor(
                        workflow.status
                      )}`}
                    >
                      {getStatusLabel(workflow.status)}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div>
                      <span className="text-gray-400 text-sm">Type de déclencheur</span>
                      <p className="font-medium">{getTriggerLabel(workflow.trigger_type)}</p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">Inscrits</span>
                      <p className="font-medium">
                        {workflowStats ? workflowStats.enrolled : workflow.enrolled_count}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">Complétés</span>
                      <p className="font-medium">
                        {workflowStats ? workflowStats.completed : workflow.completed_count}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">Taux d'ouverture</span>
                      <p className="font-medium">
                        {workflowStats ? `${(workflowStats.open_rate * 100).toFixed(1)}%` : '-'}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {workflow.status === 'draft' && (
                      <button
                        onClick={() => handleActivateWorkflow(workflow.id)}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs font-medium transition"
                      >
                        Activer
                      </button>
                    )}
                    {workflow.status === 'active' && (
                      <button
                        onClick={() => handlePauseWorkflow(workflow.id)}
                        className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-xs font-medium transition"
                      >
                        Pause
                      </button>
                    )}
                    {workflow.status === 'paused' && (
                      <button
                        onClick={() => handleActivateWorkflow(workflow.id)}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs font-medium transition"
                      >
                        Reprendre
                      </button>
                    )}
                    <button
                      onClick={() => handleDuplicateWorkflow(workflow.id)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium transition"
                    >
                      Dupliquer
                    </button>
                    <button
                      onClick={() => handleDeleteWorkflow(workflow.id)}
                      className="px-3 py-1 bg-red-700 hover:bg-red-800 rounded text-xs font-medium transition"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-[#0a0a1a] rounded-lg p-6 max-w-md w-full border border-purple-600">
              <h2 className="text-xl font-bold mb-4">Créer un flux de courrier</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Nom du flux</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full bg-[#1a1a2e] border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-600"
                    placeholder="Ex: Bienvenue nouvel utilisateur"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full bg-[#1a1a2e] border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-600 resize-none"
                    rows={3}
                    placeholder="Description du flux..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Type de déclencheur</label>
                  <select
                    value={formData.trigger_type}
                    onChange={(e) =>
                      setFormData({ ...formData, trigger_type: e.target.value })
                    }
                    className="w-full bg-[#1a1a2e] border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-purple-600"
                  >
                    <option value="signup">Inscription</option>
                    <option value="first_track">Première analyse</option>
                    <option value="weekly">Hebdomadaire</option>
                    <option value="monthly">Mensuel</option>
                    <option value="abandonment">Abandon</option>
                  </select>
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
                  onClick={handleCreateWorkflow}
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
