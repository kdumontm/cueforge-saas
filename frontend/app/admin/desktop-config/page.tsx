"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function DesktopConfigAdmin() {
  const [config, setConfig] = useState<any>({
    enabled: true,
    auto_update: true,
    update_channel: "stable",
    min_version: "1.0.0",
    window_width: 1200,
    window_height: 800,
    resizable: true,
    fullscreen_allowed: true,
    tray_icon: true,
    minimize_to_tray: true,
    start_on_boot: false,
    deep_links: true,
    file_associations: [".cue", ".trackcue"],
    crash_reporting: true,
    analytics: true,
    local_storage_limit_mb: 500,
    offline_mode: true,
    hardware_acceleration: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await adminApi.getDesktopConfig();
      if (data && Object.keys(data).length > 0) setConfig({ ...config, ...data });
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    try { await adminApi.updateDesktopConfig(config); } catch (e) { console.error(e); }
    setSaving(false);
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  const Toggle = ({ label, field, desc }: { label: string; field: string; desc?: string }) => (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm text-white">{label}</div>
        {desc && <div className="text-xs text-gray-500">{desc}</div>}
      </div>
      <button onClick={() => setConfig({ ...config, [field]: !config[field] })}
        className={`w-11 h-6 rounded-full transition ${config[field] ? "bg-purple-600" : "bg-gray-600"} relative`}>
        <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition ${config[field] ? "left-5.5" : "left-0.5"}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Application Desktop</h1>
        <button onClick={save} disabled={saving} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50">
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-1">
          <h2 className="text-lg font-semibold text-white mb-2">Général</h2>
          <Toggle label="Application desktop activée" field="enabled" />
          <Toggle label="Deep links" field="deep_links" description="Ouvrir les liens trackcue:// dans l'app" />
          <div className="py-2">
            <label className="block text-sm text-gray-400 mb-1">Associations de fichiers</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={(config.file_associations || []).join(", ")}
              onChange={e => setConfig({ ...config, file_associations: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })}
              placeholder=".cue, .trackcue" />
          </div>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-1">
          <h2 className="text-lg font-semibold text-white mb-2">Mises à jour</h2>
          <Toggle label="Mise à jour automatique" field="auto_update" />
          <div className="py-2">
            <label className="block text-sm text-gray-400 mb-1">Canal de mise à jour</label>
            <select className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.update_channel} onChange={e => setConfig({ ...config, update_channel: e.target.value })}>
              <option value="stable">Stable</option>
              <option value="beta">Bêta</option>
              <option value="alpha">Alpha</option>
            </select>
          </div>
          <div className="py-2">
            <label className="block text-sm text-gray-400 mb-1">Version minimum requise</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.min_version} onChange={e => setConfig({ ...config, min_version: e.target.value })} />
          </div>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-1">
          <h2 className="text-lg font-semibold text-white mb-2">Fenêtre</h2>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Largeur (px)</label>
              <input type="number" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                value={config.window_width} onChange={e => setConfig({ ...config, window_width: parseInt(e.target.value) || 800 })} />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Hauteur (px)</label>
              <input type="number" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                value={config.window_height} onChange={e => setConfig({ ...config, window_height: parseInt(e.target.value) || 600 })} />
            </div>
          </div>
          <Toggle label="Redimensionnable" field="resizable" />
          <Toggle label="Plein écran autorisé" field="fullscreen_allowed" />
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-1">
          <h2 className="text-lg font-semibold text-white mb-2">Système</h2>
          <Toggle label="Icône dans le tray" field="tray_icon" />
          <Toggle label="Minimiser dans le tray" field="minimize_to_tray" />
          <Toggle label="Démarrer au boot" field="start_on_boot" />
          <Toggle label="Accélération matérielle" field="hardware_acceleration" />
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-1">
          <h2 className="text-lg font-semibold text-white mb-2">Données</h2>
          <Toggle label="Mode offline" field="offline_mode" description="Permettre l'utilisation hors ligne" />
          <div className="py-2">
            <label className="block text-sm text-gray-400 mb-1">Limite stockage local (Mo)</label>
            <input type="number" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.local_storage_limit_mb} onChange={e => setConfig({ ...config, local_storage_limit_mb: parseInt(e.target.value) || 100 })} />
          </div>
          <Toggle label="Rapports de crash" field="crash_reporting" />
          <Toggle label="Analytics" field="analytics" />
        </div>
      </div>
    </div>
  );
}
