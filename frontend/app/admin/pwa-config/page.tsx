"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function PWAConfigAdmin() {
  const [config, setConfig] = useState<any>({
    enabled: false,
    app_name: "TrackCue",
    short_name: "TrackCue",
    description: "",
    theme_color: "#7c3aed",
    background_color: "#0a0a1a",
    display: "standalone",
    orientation: "any",
    start_url: "/",
    icon_192: "",
    icon_512: "",
    cache_strategy: "network-first",
    offline_page: "/offline",
    push_notifications: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await adminApi.getPWAConfig();
      if (data && Object.keys(data).length > 0) setConfig({ ...config, ...data });
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    try { await adminApi.updatePWAConfig(config); } catch (e) { console.error(e); }
    setSaving(false);
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Configuration PWA</h1>
        <button onClick={save} disabled={saving} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50">
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Général</h2>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} />
            <span className="text-sm text-gray-300">PWA activé</span>
          </label>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nom de l&apos;application</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.app_name} onChange={e => setConfig({ ...config, app_name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nom court</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.short_name} onChange={e => setConfig({ ...config, short_name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" rows={2}
              value={config.description} onChange={e => setConfig({ ...config, description: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">URL de démarrage</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.start_url} onChange={e => setConfig({ ...config, start_url: e.target.value })} />
          </div>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Apparence</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Couleur du thème</label>
            <div className="flex items-center gap-2">
              <input type="color" value={config.theme_color} onChange={e => setConfig({ ...config, theme_color: e.target.value })} className="w-10 h-10 rounded cursor-pointer" />
              <input className="bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm flex-1"
                value={config.theme_color} onChange={e => setConfig({ ...config, theme_color: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Couleur de fond</label>
            <div className="flex items-center gap-2">
              <input type="color" value={config.background_color} onChange={e => setConfig({ ...config, background_color: e.target.value })} className="w-10 h-10 rounded cursor-pointer" />
              <input className="bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm flex-1"
                value={config.background_color} onChange={e => setConfig({ ...config, background_color: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Mode d&apos;affichage</label>
            <select className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.display} onChange={e => setConfig({ ...config, display: e.target.value })}>
              <option value="standalone">Standalone</option>
              <option value="fullscreen">Plein écran</option>
              <option value="minimal-ui">UI minimale</option>
              <option value="browser">Navigateur</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Orientation</label>
            <select className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.orientation} onChange={e => setConfig({ ...config, orientation: e.target.value })}>
              <option value="any">Toute</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Paysage</option>
            </select>
          </div>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Icônes</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Icône 192x192</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" placeholder="https://..."
              value={config.icon_192} onChange={e => setConfig({ ...config, icon_192: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Icône 512x512</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" placeholder="https://..."
              value={config.icon_512} onChange={e => setConfig({ ...config, icon_512: e.target.value })} />
          </div>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Cache & Offline</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Stratégie de cache</label>
            <select className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.cache_strategy} onChange={e => setConfig({ ...config, cache_strategy: e.target.value })}>
              <option value="network-first">Network First</option>
              <option value="cache-first">Cache First</option>
              <option value="stale-while-revalidate">Stale While Revalidate</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Page offline</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.offline_page} onChange={e => setConfig({ ...config, offline_page: e.target.value })} />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.push_notifications} onChange={e => setConfig({ ...config, push_notifications: e.target.checked })} />
            <span className="text-sm text-gray-300">Notifications push</span>
          </label>
        </div>
      </div>
    </div>
  );
}
