"use client";

import { useEffect, useState } from "react";
import {
  Plus, Trash2, Edit2, Play, Pause, Eye, X, AlertCircle, Clock,
  CheckCircle, XCircle, Loader
} from "lucide-react";
import { Card, Badge, PageWrapper, LoadingScreen } from "../_components/shared";
import { adminApi } from "../_components/api";

interface CronJob {
  id: number;
  name: string;
  schedule: string;
  command: string;
  timeout: number;
  max_retries: number;
  is_active: boolean;
  last_run?: string;
  last_status?: "success" | "failed" | "running";
  created_at: string;
  updated_at: string;
}

interface CronStats {
  total: number;
  active: number;
  failed: number;
  last_run_at?: string;
}

interface CronLog {
  id: number;
  job_id: number;
  status: string;
  output?: string;
  error?: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
}

export default function CronJobsPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [stats, setStats] = useState<CronStats | null>(null);
  const [logs, setLogs] = useState<Record<number, CronLog[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);

  // Form
  const [formData, setFormData] = useState({
    name: "",
    schedule: "",
    command: "",
    timeout: 300,
    max_retries: 3,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [jobsData, statsData] = await Promise.all([
        adminApi.getCronJobs(),
        adminApi.getCronStats(),
      ]);
      setJobs(jobsData);
      setStats(statsData);
    } catch (err) {
      console.error("Erreur chargement cron jobs:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadLogsForJob = async (jobId: number) => {
    try {
      const logsData = await adminApi.getCronJobLogs(jobId);
      setLogs((prev) => ({ ...prev, [jobId]: logsData }));
    } catch (err) {
      console.error("Erreur chargement logs:", err);
    }
  };

  const handleCreateJob = async () => {
    if (!formData.name || !formData.schedule || !formData.command) return;
    try {
      await adminApi.createCronJob(formData);
      setFormData({ name: "", schedule: "", command: "", timeout: 300, max_retries: 3 });
      setShowCreateModal(false);
      loadData();
    } catch (err) {
      console.error("Erreur création job:", err);
    }
  };

  const handleToggleJob = async (id: number) => {
    try {
      const job = jobs.find((j) => j.id === id);
      if (job) {
        await adminApi.toggleCronJob(id);
        loadData();
      }
    } catch (err) {
      console.error("Erreur:", err);
    }
  };

  const handleRunNow = async (id: number) => {
    try {
      await adminApi.runCronJob(id);
      loadData();
    } catch (err) {
      console.error("Erreur exécution:", err);
    }
  };

  const handleDeleteJob = async (id: number) => {
    if (window.confirm("Confirmer la suppression de ce cron job ?")) {
      try {
        await adminApi.deleteCronJob(id);
        loadData();
      } catch (err) {
        console.error("Erreur:", err);
      }
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-green-900 text-green-100 flex items-center gap-1"><CheckCircle size={14} /> Succès</Badge>;
      case "failed":
        return <Badge className="bg-red-900 text-red-100 flex items-center gap-1"><XCircle size={14} /> Erreur</Badge>;
      case "running":
        return <Badge className="bg-blue-900 text-blue-100 flex items-center gap-1"><Loader size={14} className="animate-spin" /> En cours</Badge>;
      default:
        return <Badge className="bg-gray-900 text-gray-100">Aucune</Badge>;
    }
  };

  if (loading && jobs.length === 0) return <LoadingScreen />;

  return (
    <PageWrapper title="Gestionnaire de cron jobs">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a]">
          <div className="text-text-muted text-sm mb-2">Total</div>
          <div className="text-3xl font-bold text-white">{stats?.total ?? 0}</div>
        </Card>
        <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a]">
          <div className="text-text-muted text-sm mb-2">Actifs</div>
          <div className="text-3xl font-bold text-green-400">{stats?.active ?? 0}</div>
        </Card>
        <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a]">
          <div className="text-text-muted text-sm mb-2">Échoués</div>
          <div className="text-3xl font-bold text-red-400">{stats?.failed ?? 0}</div>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium transition flex items-center gap-2"
        >
          <Plus size={18} /> Nouveau job
        </button>
      </div>

      {/* Jobs Table */}
      <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a2a4a]">
              <th className="text-left py-3 px-4 text-text-muted font-medium">Nom</th>
              <th className="text-left py-3 px-4 text-text-muted font-medium">Schedule</th>
              <th className="text-left py-3 px-4 text-text-muted font-medium">Timeout</th>
              <th className="text-left py-3 px-4 text-text-muted font-medium">Dernier statut</th>
              <th className="text-left py-3 px-4 text-text-muted font-medium">Actif</th>
              <th className="text-left py-3 px-4 text-text-muted font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-text-muted">
                  Aucun cron job trouvé
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr key={job.id} className="border-b border-[#1a1a2e] hover:bg-[#1a1a2e]/50 transition">
                  <td className="py-3 px-4 text-white font-medium">{job.name}</td>
                  <td className="py-3 px-4 text-text-muted font-mono text-xs">{job.schedule}</td>
                  <td className="py-3 px-4 text-text-muted">{job.timeout}s</td>
                  <td className="py-3 px-4">{getStatusBadge(job.last_status)}</td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleToggleJob(job.id)}
                      className={`p-2 rounded transition ${
                        job.is_active
                          ? "bg-green-900/30 text-green-400 hover:bg-green-900/50"
                          : "bg-gray-900/30 text-gray-400 hover:bg-gray-900/50"
                      }`}
                      title={job.is_active ? "Actif" : "Inactif"}
                    >
                      {job.is_active ? <CheckCircle size={18} /> : <XCircle size={18} />}
                    </button>
                  </td>
                  <td className="py-3 px-4 flex gap-2">
                    <button
                      onClick={() => handleRunNow(job.id)}
                      className="text-blue-400 hover:text-blue-300 transition"
                      title="Exécuter maintenant"
                    >
                      <Play size={16} />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedJobId(job.id);
                        loadLogsForJob(job.id);
                        setShowLogsModal(true);
                      }}
                      className="text-purple-400 hover:text-purple-300 transition"
                      title="Voir les logs"
                    >
                      <Eye size={16} />
                    </button>
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

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#0a0a1a] border-[#2a2a4a] max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Nouveau cron job</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-text-muted hover:text-white transition"
              >
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-2">Nom</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600"
                  placeholder="Nettoyage cache"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-2">
                  Schedule (cron expression)
                </label>
                <input
                  type="text"
                  value={formData.schedule}
                  onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
                  className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600"
                  placeholder="0 2 * * * (2h du matin)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-2">Commande</label>
                <textarea
                  value={formData.command}
                  onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                  className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600 resize-none"
                  rows={3}
                  placeholder="python manage.py cleanup_cache"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">Timeout (s)</label>
                  <input
                    type="number"
                    value={formData.timeout}
                    onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">Max retries</label>
                  <input
                    type="number"
                    value={formData.max_retries}
                    onChange={(e) => setFormData({ ...formData, max_retries: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6 pt-6 border-t border-[#2a2a4a]">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 bg-[#2a2a4a] hover:bg-[#3a3a4a] text-white rounded font-medium transition"
              >
                Annuler
              </button>
              <button
                onClick={handleCreateJob}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium transition"
              >
                Créer
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Logs Modal */}
      {showLogsModal && selectedJobId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#0a0a1a] border-[#2a2a4a] max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-[#0a0a1a] pb-4">
              <h2 className="text-xl font-bold text-white">Logs du job</h2>
              <button
                onClick={() => setShowLogsModal(false)}
                className="text-text-muted hover:text-white transition"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              {logs[selectedJobId] && logs[selectedJobId].length > 0 ? (
                logs[selectedJobId].map((log) => (
                  <div key={log.id} className="bg-[#1a1a2e] border border-[#2a2a4a] rounded p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          {log.status === "success" && (
                            <CheckCircle size={18} className="text-green-400" />
                          )}
                          {log.status === "failed" && (
                            <XCircle size={18} className="text-red-400" />
                          )}
                          <span className="text-sm font-medium text-white">{log.status}</span>
                        </div>
                        <p className="text-xs text-text-muted mt-1">
                          {new Date(log.started_at).toLocaleString("fr-FR")}
                        </p>
                      </div>
                      {log.duration_ms && (
                        <span className="text-xs text-text-muted">{log.duration_ms}ms</span>
                      )}
                    </div>
                    {log.output && (
                      <pre className="bg-[#0a0a1a] p-3 rounded text-xs text-white overflow-auto max-h-32 mb-3">
                        {log.output}
                      </pre>
                    )}
                    {log.error && (
                      <div className="bg-red-900/20 border border-red-900 p-3 rounded text-xs text-red-300 overflow-auto max-h-32">
                        {log.error}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-center text-text-muted py-8">Aucun log disponible</p>
              )}
            </div>

            <div className="flex gap-3 mt-6 pt-6 border-t border-[#2a2a4a]">
              <button
                onClick={() => setShowLogsModal(false)}
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
