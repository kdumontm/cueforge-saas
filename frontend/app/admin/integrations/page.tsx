"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

const INTEGRATIONS = [
  { key: "stripe", label: "Stripe", desc: "Paiements et abonnements", icon: "💳", fields: ["secret_key", "publishable_key", "webhook_secret"] },
  { key: "google_analytics", label: "Google Analytics", desc: "Suivi du trafic", icon: "📊", fields: ["tracking_id", "enabled"] },
  { key: "intercom", label: "Intercom", desc: "Support client et chat", icon: "💬", fields: ["app_id", "secret_key", "enabled"] },
  { key: "crisp", label: "Crisp", desc: "Chat en direct", icon: "🗨️", fields: ["website_id", "enabled"] },
  { key: "mixpanel", label: "Mixpanel", desc: "Analytics produit", icon: "📈", fields: ["token", "api_secret", "enabled"] },
  { key: "sentry", label: "Sentry", desc: "Monitoring d'erreurs", icon: "🐛", fields: ["dsn", "environment", "enabled"] },
  { key: "cloudflare", label: "Cloudflare", desc: "CDN et protection DDoS", icon: "☁️", fields: ["zone_id", "api_token", "enabled"] },
  { key: "s3", label: "Amazon S3", desc: "Stockage de fichiers", icon: "📦", fields: ["bucket", "region", "access_key", "secret_key", "enabled"] },
];

export default function IntegrationsAdmin() {
  const [configs, setConfigs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const data = await adminApi.getIntegrationsConfig();
      setConfigs(data || {});
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function saveIntegration(key: string) {
    setSaving(key);
    try {
      await adminApi.updateIntegrationsConfig({ ...configs });
    } catch (e) { console.error(e); }
    setSaving(null);
  }

  function updateField(integKey: string, field: string, value: any) {
    setConfigs({
      ...configs,
      [integKey]: { ...(configs[integKey] || {}), [field]: value },
    });
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Intégrations</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {INTEGRATIONS.map(integ => {
          const cfg = configs[integ.key] || {};
          const isEnabled = cfg.enabled !== false;
          const isExpanded = expanded === integ.key;

          return (
            <div key={integ.key} className="bg-[#1a1a2e] rounded-xl overflow-hidden">
              <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => setExpanded(isExpanded ? null : integ.key)}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{integ.icon}</span>
                  <div>
                    <div className="text-white font-medium flex items-center gap-2">
                      {integ.label}
                      <span className={`w-2 h-2 rounded-full ${isEnabled && Object.keys(cfg).length > 1 ? "bg-green-500" : "bg-gray-600"}`} />
                    </div>
                    <div className="text-sm text-gray-400">{integ.desc}</div>
                  </div>
                </div>
                <svg className={`w-5 h-5 text-gray-400 transition ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {isExpanded && (
                <div className="p-4 pt-0 space-y-3 border-t border-gray-800">
                  {integ.fields.map(field => (
                    <div key={field}>
                      {field === "enabled" ? (
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={cfg.enabled !== false}
                            onChange={e => updateField(integ.key, "enabled", e.target.checked)} />
                          <span className="text-sm text-gray-300">Activé</span>
                        </label>
                      ) : (
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">{field.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}</label>
                          <input
                            type={field.includes("secret") || field.includes("key") || field.includes("token") || field.includes("dsn") ? "password" : "text"}
                            className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                            value={cfg[field] || ""} onChange={e => updateField(integ.key, field, e.target.value)}
                            placeholder={`Entrez ${field.replace(/_/g, " ")}`} />
                        </div>
                      )}
                    </div>
                  ))}
                  <button onClick={() => saveIntegration(integ.key)} disabled={saving === integ.key}
                    className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50">
                    {saving === integ.key ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
