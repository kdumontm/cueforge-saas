"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

interface CleanupJob {
  id: number;
  job_type: string;
  status: string;
  records_affected: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export default function DataCleanupAdmin() {
  const [jobs, setJobs] = useState<CleanupJob[]>([]);
  const [availableTypes, setAvailableTypes] = useState<any[]>([]);
  const [storageStats, setStorageStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [j, t, s] = await Promise.all([
        adminApi.getDataCleanupJobs().catch(() => []),
        adminApi.getAvailableCleanupTypes().catch(() => []),
        adminApi.getStorageStats().catch(() => null),
      ]);
      setJobs(Array.isArray(j) ? j : j?.items || []);
      setAvailableTypes(Array.isArray(t) ? t : []);
      if (s) setStorageStats(s);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function runJob(jobType: string) {
    setRunning(jobType);
    try {
      await adminApi.runDataCleanup(jobType);
      await loadAll();
    } catch (e) { console.error(e); }
    setRunning(null);
  }

  const statusColors: Record<string, string> = {
    completed: "bg-green-900/50 text-green-400",
    running: "bg-blue-900/50 text-blue-400",
    failed: "bg-red-900/50 text-red-400",
    pending: "bg-yellow-900/50 text-yellow-400",
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Nettoyage des données</h1>

      {storageStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#1a1a2e] rounded-lg p-4">
            <div className="text-sm text-gray-400">Stockage total</div>
            <div className="text-2xl font-bold text-white">{formatBytes(storageStats.total_bytes || 0)}</div>
          </div>
          <div className="bg-[#1a1a2e] rounded-lg p-4">
            <div className="text-sm text-gray-400">Base de données</div>
            <div className="text-2xl font-bold text-blue-400">{formatBytes(storageStats.db_bytes || 0)}</div>
          </div>
          <div className="bg-[#1a1a2e] rounded-lg p-4">
            <div className="text-sm text-gray-400">Fichiers</div>
            <div className="text-2xl font-bold text-purple-400">{formatBytes(storageStats.files_bytes || 0)}</div>
          </div>
          <div className="bg-[#1a1a2e] rounded-lg p-4">
            <div className="text-sm text-gray-400">Récupérable</div>
            <div className="text-2xl font-bold text-green-400">{formatBytes(storageStats.reclaimable_bytes || 0)}</div>
          </div>
        </div>
      )}

      <div className="bg-[#1a1a2e] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Actions de nettoyage</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableTypes.length > 0 ? availableTypes.map((t: any) => (
            <div key={t.type || t.name} className="bg-[#0a0a1a] rounded-lg p-4">
              <div className="text-white font-medium">{t.label || t.name || t.type}</div>
              <div className="text-sm text-gray-400 mt-1">{t.description || "Nettoyage des données"}</div>
              {t.estimated_records && <div className="text-xs text-gray-500 mt-1">{t.estimated_records} enregistrements estimés</div>}
              <button onClick={() => runJob(t.type || t.name)} disabled={running === (t.type || t.name)}
                className="mt-3 px-3 py-1.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 text-sm disabled:opacity-50 w-full">
                {running === (t.type || t.name) ? "Exécution..." : "Exécuter"}
              </button>
            </div>
          )) : (
            <div className="col-span-full text-center text-gray-500">
              <div className="space-y-3">
                {["orphan_files", "expired_sessions", "old_logs", "temp_data", "soft_deleted"].map(type => (
                  <div key={type} className="bg-[#0a0a1a] rounded-lg p-4 text-left">
                    <div className="text-white font-medium">{type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</div>
                    <button onClick={() => runJob(type)} disabled={running === type}
                      className="mt-2 px-3 py-1.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 text-sm disabled:opacity-50">
                      {running === type ? "Exécution..." : "Exécuter"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-[#1a1a2e] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Historique des nettoyages</h2>
        {jobs.length === 0 ? (
          <div className="text-center text-gray-500 py-4">Aucun nettoyage exécuté</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left py-2 px-3">Type</th>
                  <th className="text-left py-2 px-3">Statut</th>
                  <th className="text-left py-2 px-3">Enregistrements</th>
                  <th className="text-left py-2 px-3">Début</th>
                  <th className="text-left py-2 px-3">Fin</th>
                  <th className="text-left py-2 px-3">Erreur</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => (
                  <tr key={j.id} className="border-b border-gray-800">
                    <td className="py-2 px-3 text-white font-mono text-xs">{j.job_type}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[j.status] || "bg-gray-700 text-gray-300"}`}>{j.status}</span>
                    </td>
                    <td className="py-2 px-3 text-gray-300">{j.records_affected}</td>
                    <td className="py-2 px-3 text-gray-400">{j.started_at ? new Date(j.started_at).toLocaleString("fr-FR") : "-"}</td>
                    <td className="py-2 px-3 text-gray-400">{j.completed_at ? new Date(j.completed_at).toLocaleString("fr-FR") : "-"}</td>
                    <td className="py-2 px-3 text-red-400 text-xs">{j.error_message || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
