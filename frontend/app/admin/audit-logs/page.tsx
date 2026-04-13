"use client";

import { useEffect, useState } from "react";
import {
  Search, Filter, Download, ChevronDown, AlertCircle, Info, AlertTriangle,
  Calendar, User, FileText, Eye, X, Loader
} from "lucide-react";
import { Card, Badge, PageWrapper, LoadingScreen } from "../_components/shared";
import { adminApi } from "../_components/api";

interface AuditLog {
  id: number;
  action: string;
  resource_type: string;
  resource_id?: string;
  user_id: number;
  severity: "info" | "warning" | "critical";
  changes?: Record<string, any>;
  created_at: string;
}

interface AuditStats {
  total: number;
  today: number;
  critical: number;
  by_severity: Record<string, number>;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Filters
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [userId, setUserId] = useState("");
  const [severity, setSeverity] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const [actions, setActions] = useState<string[]>([]);
  const [resourceTypes, setResourceTypes] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [logsData, statsData, actionsData, resourceTypesData] = await Promise.all([
        adminApi.getAuditLogs({
          action: action || undefined,
          resource_type: resourceType || undefined,
          user_id: userId || undefined,
          severity: severity || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          search: search || undefined,
        }),
        adminApi.getAuditStats(),
        adminApi.getAuditActions(),
        adminApi.getAuditResourceTypes(),
      ]);
      setLogs(logsData);
      setStats(statsData);
      setActions(actionsData);
      setResourceTypes(resourceTypesData);
    } catch (err) {
      console.error("Erreur chargement audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (log: AuditLog) => {
    setSelectedLog(log);
    setShowModal(true);
  };

  const handleExport = async () => {
    try {
      const data = await adminApi.exportAuditLogs({
        action: action || undefined,
        resource_type: resourceType || undefined,
        severity: severity || undefined,
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Erreur export:", err);
    }
  };

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case "critical": return "bg-red-900 text-red-100";
      case "warning": return "bg-yellow-900 text-yellow-100";
      default: return "bg-blue-900 text-blue-100";
    }
  };

  const getSeverityIcon = (sev: string) => {
    switch (sev) {
      case "critical": return <AlertTriangle size={16} />;
      case "warning": return <AlertCircle size={16} />;
      default: return <Info size={16} />;
    }
  };

  if (loading && logs.length === 0) return <LoadingScreen />;

  return (
    <PageWrapper title="Journaux d'audit">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a]">
          <div className="text-text-muted text-sm mb-2">Total</div>
          <div className="text-3xl font-bold text-white">{stats?.total ?? 0}</div>
        </Card>
        <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a]">
          <div className="text-text-muted text-sm mb-2">Aujourd'hui</div>
          <div className="text-3xl font-bold text-white">{stats?.today ?? 0}</div>
        </Card>
        <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a]">
          <div className="text-text-muted text-sm mb-2">Critique</div>
          <div className="text-3xl font-bold text-red-400">{stats?.critical ?? 0}</div>
        </Card>
        <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a]">
          <div className="text-text-muted text-sm mb-2">Par sévérité</div>
          <div className="flex gap-2 mt-3">
            {stats?.by_severity && Object.entries(stats.by_severity).map(([key, val]) => (
              <div key={key} className="text-xs">
                <span className="font-bold text-white">{val}</span>
                <span className="text-text-muted"> {key}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a] mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Recherche</label>
            <div className="relative">
              <Search size={18} className="absolute left-3 top-3 text-text-muted" />
              <input
                type="text"
                placeholder="ID, ressource..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded placeholder-text-muted focus:outline-none focus:border-purple-600"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Action</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600"
            >
              <option value="">Toutes</option>
              {actions.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Type ressource</label>
            <select
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
              className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600"
            >
              <option value="">Tous</option>
              {resourceTypes.map(rt => (
                <option key={rt} value={rt}>{rt}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Sévérité</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600"
            >
              <option value="">Toutes</option>
              <option value="info">Info</option>
              <option value="warning">Avertissement</option>
              <option value="critical">Critique</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">De</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">À</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={loadData}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium transition"
          >
            Filtrer
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-[#2a2a4a] hover:bg-[#3a3a4a] text-white rounded font-medium transition flex items-center gap-2"
          >
            <Download size={16} /> Exporter
          </button>
        </div>
      </Card>

      {/* Logs Table */}
      <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a2a4a]">
              <th className="text-left py-3 px-4 text-text-muted font-medium">Action</th>
              <th className="text-left py-3 px-4 text-text-muted font-medium">Ressource</th>
              <th className="text-left py-3 px-4 text-text-muted font-medium">Utilisateur</th>
              <th className="text-left py-3 px-4 text-text-muted font-medium">Sévérité</th>
              <th className="text-left py-3 px-4 text-text-muted font-medium">Date</th>
              <th className="text-left py-3 px-4 text-text-muted font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-text-muted">
                  Aucun journal d'audit trouvé
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-[#1a1a2e] hover:bg-[#1a1a2e]/50 transition">
                  <td className="py-3 px-4 font-medium text-white">{log.action}</td>
                  <td className="py-3 px-4 text-text-muted">
                    {log.resource_type} {log.resource_id && `#${log.resource_id}`}
                  </td>
                  <td className="py-3 px-4 text-text-muted">
                    <User size={16} className="inline mr-2" />
                    {log.user_id}
                  </td>
                  <td className="py-3 px-4">
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded text-xs font-medium ${getSeverityColor(log.severity)}`}>
                      {getSeverityIcon(log.severity)}
                      {log.severity}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-text-muted">
                    {new Date(log.created_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleViewDetails(log)}
                      className="text-purple-400 hover:text-purple-300 transition flex items-center gap-1"
                    >
                      <Eye size={16} /> Voir
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {/* Detail Modal */}
      {showModal && selectedLog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#0a0a1a] border-[#2a2a4a] max-w-2xl w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Détails d'audit</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-text-muted hover:text-white transition"
              >
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-text-muted mb-1">Action</div>
                  <div className="text-white font-medium">{selectedLog.action}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Sévérité</div>
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded text-xs font-medium ${getSeverityColor(selectedLog.severity)}`}>
                    {getSeverityIcon(selectedLog.severity)}
                    {selectedLog.severity}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Ressource</div>
                  <div className="text-white font-medium">{selectedLog.resource_type} #{selectedLog.resource_id}</div>
                </div>
                <div>
                  <div className="text-sm text-text-muted mb-1">Utilisateur</div>
                  <div className="text-white font-medium">{selectedLog.user_id}</div>
                </div>
              </div>
              {selectedLog.changes && (
                <div>
                  <div className="text-sm text-text-muted mb-2">Changements JSON</div>
                  <pre className="bg-[#1a1a2e] border border-[#2a2a4a] p-4 rounded text-xs text-white overflow-auto max-h-96">
                    {JSON.stringify(selectedLog.changes, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6 pt-6 border-t border-[#2a2a4a]">
              <button
                onClick={() => setShowModal(false)}
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
