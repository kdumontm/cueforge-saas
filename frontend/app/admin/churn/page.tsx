"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

interface ChurnUser {
  user_id: number;
  email: string;
  username: string;
  risk_score: number;
  risk_factors: string[];
  last_active: string;
  subscription_status: string;
}

export default function ChurnAdmin() {
  const [tab, setTab] = useState<"dashboard" | "users" | "config">("dashboard");
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<ChurnUser[]>([]);
  const [config, setConfig] = useState<any>({
    enabled: true,
    risk_threshold_high: 80,
    risk_threshold_medium: 50,
    check_interval_hours: 24,
    auto_email_high_risk: false,
    inactivity_days_weight: 0.3,
    subscription_age_weight: 0.2,
    usage_frequency_weight: 0.3,
    support_tickets_weight: 0.2,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, u, c] = await Promise.all([
        adminApi.churnStats().catch(() => null),
        adminApi.listAtRiskUsers().catch(() => []),
        adminApi.getChurnConfig().catch(() => null),
      ]);
      if (s) setStats(s);
      setUsers(Array.isArray(u) ? u : u?.items || []);
      if (c && Object.keys(c).length > 0) setConfig({ ...config, ...c });
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function saveConfig() {
    setSaving(true);
    try { await adminApi.updateChurnConfig(config); } catch (e) { console.error(e); }
    setSaving(false);
  }

  const riskColor = (score: number) =>
    score >= 80 ? "text-red-400" : score >= 50 ? "text-yellow-400" : "text-green-400";
  const riskBg = (score: number) =>
    score >= 80 ? "bg-red-900/30" : score >= 50 ? "bg-yellow-900/30" : "bg-green-900/30";

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Prévention du Churn</h1>

      <div className="flex gap-2">
        {(["dashboard", "users", "config"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? "bg-purple-600 text-white" : "bg-[#1a1a2e] text-gray-400 hover:text-white"}`}>
            {t === "dashboard" ? "Tableau de bord" : t === "users" ? "Utilisateurs à risque" : "Configuration"}
          </button>
        ))}
      </div>

      {tab === "dashboard" && stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#1a1a2e] rounded-lg p-4">
            <div className="text-sm text-gray-400">Taux de churn</div>
            <div className="text-2xl font-bold text-white">{(stats.churn_rate || 0).toFixed(1)}%</div>
          </div>
          <div className="bg-[#1a1a2e] rounded-lg p-4">
            <div className="text-sm text-gray-400">Risque élevé</div>
            <div className="text-2xl font-bold text-red-400">{stats.high_risk || 0}</div>
          </div>
          <div className="bg-[#1a1a2e] rounded-lg p-4">
            <div className="text-sm text-gray-400">Risque moyen</div>
            <div className="text-2xl font-bold text-yellow-400">{stats.medium_risk || 0}</div>
          </div>
          <div className="bg-[#1a1a2e] rounded-lg p-4">
            <div className="text-sm text-gray-400">Risque faible</div>
            <div className="text-2xl font-bold text-green-400">{stats.low_risk || 0}</div>
          </div>
        </div>
      )}

      {tab === "dashboard" && !stats && (
        <div className="bg-[#1a1a2e] rounded-lg p-8 text-center text-gray-500">Aucune donnée de churn disponible</div>
      )}

      {tab === "users" && (
        <div className="space-y-2">
          {users.length === 0 ? (
            <div className="bg-[#1a1a2e] rounded-lg p-8 text-center text-gray-500">Aucun utilisateur à risque détecté</div>
          ) : users.map(u => (
            <div key={u.user_id} className={`rounded-lg p-4 ${riskBg(u.risk_score)}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">{u.username || u.email}</div>
                  <div className="text-sm text-gray-400">{u.email}</div>
                  {u.risk_factors && u.risk_factors.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {u.risk_factors.map((f, i) => (
                        <span key={i} className="text-xs bg-[#0a0a1a] text-gray-400 px-2 py-0.5 rounded">{f}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold ${riskColor(u.risk_score)}`}>{u.risk_score}%</div>
                  <div className="text-xs text-gray-500">Dernier actif: {u.last_active ? new Date(u.last_active).toLocaleDateString("fr-FR") : "N/A"}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "config" && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button onClick={saveConfig} disabled={saving} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50">
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-white">Seuils de risque</h2>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Seuil risque élevé (%)</label>
                <input type="number" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                  value={config.risk_threshold_high} onChange={e => setConfig({ ...config, risk_threshold_high: parseInt(e.target.value) })} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Seuil risque moyen (%)</label>
                <input type="number" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                  value={config.risk_threshold_medium} onChange={e => setConfig({ ...config, risk_threshold_medium: parseInt(e.target.value) })} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Intervalle de vérification (heures)</label>
                <input type="number" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                  value={config.check_interval_hours} onChange={e => setConfig({ ...config, check_interval_hours: parseInt(e.target.value) })} />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={config.auto_email_high_risk} onChange={e => setConfig({ ...config, auto_email_high_risk: e.target.checked })} />
                <span className="text-sm text-gray-300">Email auto pour risque élevé</span>
              </label>
            </div>
            <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-white">Poids des facteurs</h2>
              {[
                { label: "Jours d'inactivité", field: "inactivity_days_weight" },
                { label: "Âge de l'abonnement", field: "subscription_age_weight" },
                { label: "Fréquence d'utilisation", field: "usage_frequency_weight" },
                { label: "Tickets support", field: "support_tickets_weight" },
              ].map(({ label, field }) => (
                <div key={field}>
                  <label className="block text-sm text-gray-400 mb-1">{label} ({((config[field] || 0) * 100).toFixed(0)}%)</label>
                  <input type="range" min="0" max="1" step="0.05" className="w-full"
                    value={config[field] || 0} onChange={e => setConfig({ ...config, [field]: parseFloat(e.target.value) })} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
