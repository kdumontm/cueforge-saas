"use client";

import { useEffect, useState } from "react";
import {
  Trash2, RotateCcw, Eye, Filter, AlertTriangle, CheckCircle,
  Clock, AlertCircle, Loader, RefreshCw
} from "lucide-react";
import { Card, Badge, PageWrapper, LoadingScreen } from "../_components/shared";
import { adminApi } from "../_components/api";

interface Queue {
  name: string;
  pending: number;
  processing: number;
  failed: number;
  completed: number;
}

interface QueueJob {
  id: number;
  queue: string;
  status: "pending" | "processing" | "completed" | "failed";
  data?: Record<string, any>;
  error?: string;
  attempts: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

interface QueueStats {
  total_queues: number;
  total_jobs: number;
  total_pending: number;
  total_processing: number;
  total_failed: number;
  queues: Queue[];
}

export default function QueuesPage() {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQueue, setSelectedQueue] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const statsData = await adminApi.getQueueStats();
      setStats(statsData);
      if (statsData.queues.length > 0 && !selectedQueue) {
        setSelectedQueue(statsData.queues[0].name);
      }
    } catch (err) {
      console.error("Erreur chargement queues:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadJobs = async () => {
    if (!selectedQueue) return;
    try {
      const jobsData = await adminApi.getQueueJobs({
        queue: selectedQueue,
        status: selectedStatus || undefined,
      });
      setJobs(jobsData);
    } catch (err) {
      console.error("Erreur chargement jobs:", err);
    }
  };

  useEffect(() => {
    if (selectedQueue) {
      loadJobs();
    }
  }, [selectedQueue, selectedStatus]);

  const handleRetryJob = async (id: number) => {
    try {
      await adminApi.retryQueueJob(id);
      loadJobs();
    } catch (err) {
      console.error("Erreur:", err);
    }
  };

  const handleDeleteJob = async (id: number) => {
    if (window.confirm("Confirmer la suppression de ce job ?")) {
      try {
        await adminApi.deleteQueueJob(id);
        loadJobs();
      } catch (err) {
        console.error("Erreur:", err);
      }
    }
  };

  const handlePurgeDeadJobs = async () => {
    if (window.confirm("Purger tous les dead jobs ?")) {
      setPurging(true);
      try {
        await adminApi.purgeDeadJobs();
        loadData();
        loadJobs();
      } catch (err) {
        console.error("Erreur:", err);
      } finally {
        setPurging(false);
      }
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle size={18} className="text-green-400" />;
      case "processing":
        return <Loader size={18} className="text-blue-400 animate-spin" />;
      case "failed":
        return <AlertTriangle size={18} className="text-red-400" />;
      default:
        return <Clock size={18} className="text-yellow-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-900 text-green-100";
      case "processing":
        return "bg-blue-900 text-blue-100";
      case "failed":
        return "bg-red-900 text-red-100";
      default:
        return "bg-yellow-900 text-yellow-100";
    }
  };

  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  if (loading && !stats) return <LoadingScreen />;

  return (
    <PageWrapper title="Monitoring des queues">
      {/* Global Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a]">
          <div className="text-text-muted text-sm mb-2">Total queues</div>
          <div className="text-3xl font-bold text-white">{stats?.total_queues ?? 0}</div>
        </Card>
        <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a]">
          <div className="text-text-muted text-sm mb-2">Total jobs</div>
          <div className="text-3xl font-bold text-white">{stats?.total_jobs ?? 0}</div>
        </Card>
        <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a]">
          <div className="text-text-muted text-sm mb-2">En attente</div>
          <div className="text-3xl font-bold text-yellow-400">{stats?.total_pending ?? 0}</div>
        </Card>
        <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a]">
          <div className="text-text-muted text-sm mb-2">En cours</div>
          <div className="text-3xl font-bold text-blue-400">{stats?.total_processing ?? 0}</div>
        </Card>
        <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a]">
          <div className="text-text-muted text-sm mb-2">Échoués</div>
          <div className="text-3xl font-bold text-red-400">{stats?.total_failed ?? 0}</div>
        </Card>
      </div>

      {/* Queue Cards */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-white mb-4">Queues</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats?.queues.map((queue) => (
            <Card
              key={queue.name}
              className={`p-6 bg-[#0a0a1a] border-[#2a2a4a] cursor-pointer transition hover:border-purple-600 ${
                selectedQueue === queue.name ? "border-purple-600 bg-purple-600/10" : ""
              }`}
              onClick={() => setSelectedQueue(queue.name)}
            >
              <h3 className="text-lg font-bold text-white mb-4">{queue.name}</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-muted">En attente</span>
                  <span className="font-bold text-yellow-400">{queue.pending}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-muted">En cours</span>
                  <span className="font-bold text-blue-400">{queue.processing}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-muted">Échoués</span>
                  <span className="font-bold text-red-400">{queue.failed}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-muted">Complétés</span>
                  <span className="font-bold text-green-400">{queue.completed}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Filters */}
      <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a] mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Queue</label>
            <select
              value={selectedQueue}
              onChange={(e) => setSelectedQueue(e.target.value)}
              className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600"
            >
              <option value="">Sélectionner une queue</option>
              {stats?.queues.map((q) => (
                <option key={q.name} value={q.name}>
                  {q.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Statut</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600"
            >
              <option value="">Tous</option>
              <option value="pending">En attente</option>
              <option value="processing">En cours</option>
              <option value="completed">Complétés</option>
              <option value="failed">Échoués</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={loadJobs}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium transition flex items-center gap-2"
          >
            <RefreshCw size={16} /> Actualiser
          </button>
          <button
            onClick={handlePurgeDeadJobs}
            disabled={purging}
            className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded font-medium transition flex items-center gap-2 disabled:opacity-50"
          >
            <Trash2 size={16} /> Purger dead jobs
          </button>
        </div>
      </Card>

      {/* Jobs Table */}
      <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a2a4a]">
              <th className="text-left py-3 px-4 text-text-muted font-medium">ID</th>
              <th className="text-left py-3 px-4 text-text-muted font-medium">Statut</th>
              <th className="text-left py-3 px-4 text-text-muted font-medium">Tentatives</th>
              <th className="text-left py-3 px-4 text-text-muted font-medium">Créé</th>
              <th className="text-left py-3 px-4 text-text-muted font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-text-muted">
                  Aucun job dans cette queue
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr key={job.id} className="border-b border-[#1a1a2e] hover:bg-[#1a1a2e]/50 transition">
                  <td className="py-3 px-4 text-white font-mono text-xs">{String(job.id).substring(0, 12)}...</td>
                  <td className="py-3 px-4">
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded text-xs font-medium ${getStatusColor(job.status)}`}>
                      {getStatusIcon(job.status)}
                      {job.status}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-text-muted">
                    {job.attempts}/{job.max_attempts}
                  </td>
                  <td className="py-3 px-4 text-text-muted text-xs">
                    {new Date(job.created_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="py-3 px-4 flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedJobId(job.id);
                        setShowJobModal(true);
                      }}
                      className="text-purple-400 hover:text-purple-300 transition"
                    >
                      <Eye size={16} />
                    </button>
                    {job.status === "failed" && (
                      <button
                        onClick={() => handleRetryJob(job.id)}
                        className="text-blue-400 hover:text-blue-300 transition"
                      >
                        <RotateCcw size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteJob(job.id)}
                      className="text-red-400 hover:text-red-300 transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {/* Job Detail Modal */}
      {showJobModal && selectedJob && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#0a0a1a] border-[#2a2a4a] max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-6">Détails du job</h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-text-muted mb-3">Informations</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-text-muted mb-1">ID</div>
                    <div className="text-white font-mono text-xs break-all">{selectedJob.id}</div>
                  </div>
                  <div>
                    <div className="text-xs text-text-muted mb-1">Queue</div>
                    <div className="text-white">{selectedJob.queue}</div>
                  </div>
                  <div>
                    <div className="text-xs text-text-muted mb-1">Statut</div>
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded text-xs font-medium ${getStatusColor(selectedJob.status)}`}>
                      {getStatusIcon(selectedJob.status)}
                      {selectedJob.status}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-text-muted mb-1">Tentatives</div>
                    <div className="text-white">{selectedJob.attempts}/{selectedJob.max_attempts}</div>
                  </div>
                  <div>
                    <div className="text-xs text-text-muted mb-1">Créé</div>
                    <div className="text-white text-xs">
                      {new Date(selectedJob.created_at).toLocaleString("fr-FR")}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-text-muted mb-1">Mis à jour</div>
                    <div className="text-white text-xs">
                      {new Date(selectedJob.updated_at).toLocaleString("fr-FR")}
                    </div>
                  </div>
                </div>
              </div>

              {selectedJob.data && (
                <div>
                  <h3 className="text-sm font-medium text-text-muted mb-3">Données</h3>
                  <pre className="bg-[#1a1a2e] border border-[#2a2a4a] p-4 rounded text-xs text-white overflow-auto max-h-48">
                    {JSON.stringify(selectedJob.data, null, 2)}
                  </pre>
                </div>
              )}

              {selectedJob.error && (
                <div>
                  <h3 className="text-sm font-medium text-red-400 mb-3">Erreur</h3>
                  <div className="bg-red-900/20 border border-red-900 p-4 rounded text-xs text-red-300 overflow-auto max-h-48">
                    {selectedJob.error}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6 pt-6 border-t border-[#2a2a4a]">
              {selectedJob.status === "failed" && (
                <button
                  onClick={() => {
                    handleRetryJob(selectedJob.id);
                    setShowJobModal(false);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition"
                >
                  Réessayer
                </button>
              )}
              <button
                onClick={() => {
                  handleDeleteJob(selectedJob.id);
                  setShowJobModal(false);
                }}
                className="flex-1 px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded font-medium transition"
              >
                Supprimer
              </button>
              <button
                onClick={() => setShowJobModal(false)}
                className="flex-1 px-4 py-2 bg-[#2a2a4a] hover:bg-[#3a3a4a] text-white rounded font-medium transition"
              >
                Fermer
              </button>
            </div>
          </Card>
        </div>
      )}
    </PageWrapper>
  );
}
