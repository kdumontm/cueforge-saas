"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function APIUsageAdmin() {
  const [tab, setTab] = useState<"overview" | "logs" | "limits">("overview");
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [limits, setLimits] = useState<any>({ global_rpm: 1000, per_key_rpm: 100, burst_limit: 50, rate_limit_by: "api_key", throttle_response_code: 429 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ endpoint: "", method: "" });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, l, r] = await Promise.all([
        adminApi.getAPIUsageStats().catch(() => null),
        adminApi.getAPIUsage({ limit: 50 }).catch(() => ({ items: [] })),
        adminApi.getAPIRateLimits().catch(() => null),
      ]);
      if (s) setStats(s);
      setLogs(l.items || []);
      if (r) setLimits({ ...limits, ...r });
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function saveLimits() {
    setSaving(true);
    try { await adminApi.updateAPIRateLimits(limits); } catch (e) { console.error(e); }
    setSaving(false);
  }

  async function filterLogs() {
    try {
      const params: any = { limit: 50 };
      if (filters.endpoint) params.endpoint = filters.endpoint;
      if (filters.method) params.method = filters.method;
      const l = await adminApi.getAPIUsage(params);
      setLogs(l.items || []);
    } catch (e) { console.error(e); }
  }

  const statusColor = (code: number) => code < 300 ? "text-green-400" : code < 400 ? "text-yellow-400" : code < 500 ? "text-orange-400" : "text-red-400";

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Utilisation API</h1>
        <div className="flex gap-2">
          {(["overview", "logs", "limits"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? "bg-purple-600 text-white" : "bg-[#1a1a2e] text-gray-400"}`}>
              {t === "overview" ? "Vue d'ensemble" : t === "logs" ? "Logs" : "Rate Limits"}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[#1a1a2e] rounded-lg p-4"><div className="text-sm text-gray-400">Requêtes totales</div><div className="text-2xl font-bold text-white">{stats.total_requests?.toLocaleString()}</div></div>
            <div className="bg-[#1a1a2e] rounded-lg p-4"><div className="text-sm text-gray-400">Temps moyen</div><div className="text-2xl font-bold text-blue-400">{stats.avg_response_time_ms}ms</div></div>
            <div className="bg-[#1a1a2e] rounded-lg p-4"><div className="text-sm text-gray-400">Erreurs</div><div className="text-2xl font-bold text-red-400">{stats.error_count}</div></div>
            <div className="bg-[#1a1a2e] rounded-lg p-4"><div className="text-sm text-gray-400">Taux d&apos;erreur</div><div className="text-2xl font-bold text-orange-400">{stats.error_rate}%</div></div>
          </div>
          {stats.top_endpoints?.length > 0 && (
            <div className="bg-[#1a1a2e] rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Top endpoints</h2>
              <div className="space-y-2">
                {stats.top_endpoints.map((ep: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                    <code className="text-sm text-gray-300 font-mono">{ep.endpoint}</code>
                    <span className="text-sm text-purple-400 font-medium">{ep.count?.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "logs" && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <input className="flex-1 bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" placeholder="Filtrer par endpoint..." value={filters.endpoint} onChange={e => setFilters({ ...filters, endpoint: e.target.value })} />
            <select className="bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" value={filters.method} onChange={e => setFilters({ ...filters, method: e.target.value })}>
              <option value="">Toutes méthodes</option><option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option><option value="DELETE">DELETE</option>
            </select>
            <button onClick={filterLogs} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">Filtrer</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2 px-3">Méthode</th><th className="text-left py-2 px-3">Endpoint</th><th className="text-left py-2 px-3">Status</th><th className="text-left py-2 px-3">Temps</th><th className="text-left py-2 px-3">Date</th>
              </tr></thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id} className="border-b border-gray-800">
                    <td className="py-2 px-3"><span className="px-2 py-0.5 rounded text-xs font-mono bg-[#0a0a1a] text-gray-300">{l.method}</span></td>
                    <td className="py-2 px-3 text-gray-300 font-mono text-xs">{l.endpoint}</td>
                    <td className={`py-2 px-3 font-medium ${statusColor(l.status_code)}`}>{l.status_code}</td>
                    <td className="py-2 px-3 text-gray-400">{l.response_time_ms}ms</td>
                    <td className="py-2 px-3 text-gray-500 text-xs">{l.created_at ? new Date(l.created_at).toLocaleString("fr-FR") : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {logs.length === 0 && <div className="text-center text-gray-500 py-8">Aucun log API</div>}
        </div>
      )}

      {tab === "limits" && (
        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4 max-w-lg">
          <h2 className="text-lg font-semibold text-white">Configuration des Rate Limits</h2>
          <div><label className="block text-sm text-gray-400 mb-1">RPM global</label><input type="number" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" value={limits.global_rpm} onChange={e => setLimits({ ...limits, global_rpm: parseInt(e.target.value) })} /></div>
          <div><label className="block text-sm text-gray-400 mb-1">RPM par clé API</label><input type="number" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" value={limits.per_key_rpm} onChange={e => setLimits({ ...limits, per_key_rpm: parseInt(e.target.value) })} /></div>
          <div><label className="block text-sm text-gray-400 mb-1">Burst limit</label><input type="number" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" value={limits.burst_limit} onChange={e => setLimits({ ...limits, burst_limit: parseInt(e.target.value) })} /></div>
          <div><label className="block text-sm text-gray-400 mb-1">Limiter par</label>
            <select className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" value={limits.rate_limit_by} onChange={e => setLimits({ ...limits, rate_limit_by: e.target.value })}>
              <option value="api_key">Clé API</option><option value="ip">Adresse IP</option><option value="user">Utilisateur</option>
            </select>
          </div>
          <button onClick={saveLimits} disabled={saving} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50">{saving ? "Enregistrement..." : "Enregistrer"}</button>
        </div>
      )}
    </div>
  );
}
