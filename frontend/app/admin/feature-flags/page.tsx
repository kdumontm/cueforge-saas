"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

interface FeatureFlag {
  key: string;
  enabled: boolean;
  description?: string;
  rollout_percentage?: number;
  conditions?: any;
}

export default function FeatureFlagsAdmin() {
  const [flags, setFlags] = useState<Record<string, FeatureFlag>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await adminApi.getFeatureFlags();
      const mapped: Record<string, FeatureFlag> = {};
      if (data && typeof data === "object") {
        Object.entries(data).forEach(([key, val]: [string, any]) => {
          mapped[key] = typeof val === "boolean"
            ? { key, enabled: val }
            : { key, ...val };
        });
      }
      setFlags(mapped);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function toggleFlag(key: string) {
    const flag = flags[key];
    if (!flag) return;
    try {
      await adminApi.toggleFeatureFlag(key);
      setFlags({ ...flags, [key]: { ...flag, enabled: !flag.enabled } });
    } catch (e) { console.error(e); }
  }

  async function saveAll() {
    setSaving(true);
    try {
      const data: Record<string, boolean> = {};
      Object.entries(flags).forEach(([k, v]) => { data[k] = v.enabled; });
      await adminApi.updateFeatureFlags(data);
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  const flagList = Object.values(flags).filter(f =>
    !search || f.key.toLowerCase().includes(search.toLowerCase()) || (f.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const categories = new Map<string, FeatureFlag[]>();
  flagList.forEach(f => {
    const cat = f.key.split("_")[0] || "general";
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(f);
  });

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Feature Flags</h1>
        <button onClick={saveAll} disabled={saving} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50">
          {saving ? "Enregistrement..." : "Enregistrer tout"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#1a1a2e] rounded-lg p-4">
          <div className="text-sm text-gray-400">Total</div>
          <div className="text-2xl font-bold text-white">{Object.keys(flags).length}</div>
        </div>
        <div className="bg-[#1a1a2e] rounded-lg p-4">
          <div className="text-sm text-gray-400">Activés</div>
          <div className="text-2xl font-bold text-green-400">{Object.values(flags).filter(f => f.enabled).length}</div>
        </div>
        <div className="bg-[#1a1a2e] rounded-lg p-4">
          <div className="text-sm text-gray-400">Désactivés</div>
          <div className="text-2xl font-bold text-red-400">{Object.values(flags).filter(f => !f.enabled).length}</div>
        </div>
      </div>

      <input className="w-full bg-[#1a1a2e] border border-gray-700 rounded-lg px-4 py-2 text-white text-sm"
        placeholder="Rechercher un flag..." value={search} onChange={e => setSearch(e.target.value)} />

      {flagList.length === 0 ? (
        <div className="text-center text-gray-500 py-8">Aucun feature flag configuré</div>
      ) : (
        <div className="space-y-2">
          {flagList.map(flag => (
            <div key={flag.key} className="bg-[#1a1a2e] rounded-lg p-4 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <code className="text-white text-sm font-mono bg-[#0a0a1a] px-2 py-0.5 rounded">{flag.key}</code>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${flag.enabled ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"}`}>
                    {flag.enabled ? "ON" : "OFF"}
                  </span>
                </div>
                {flag.description && <div className="text-xs text-gray-500 mt-1">{flag.description}</div>}
              </div>
              <button onClick={() => toggleFlag(flag.key)}
                className={`w-11 h-6 rounded-full transition ${flag.enabled ? "bg-purple-600" : "bg-gray-600"} relative`}>
                <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition ${flag.enabled ? "left-5.5" : "left-0.5"}`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
