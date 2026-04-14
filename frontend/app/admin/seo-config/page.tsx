"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function SEOConfigAdmin() {
  const [config, setConfig] = useState<any>({
    site_title: "TrackCue",
    site_description: "",
    site_keywords: "",
    og_image: "",
    og_type: "website",
    twitter_card: "summary_large_image",
    twitter_handle: "",
    canonical_url: "",
    robots_txt: "User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/",
    sitemap_enabled: true,
    sitemap_frequency: "weekly",
    structured_data: true,
    google_verification: "",
    bing_verification: "",
    default_lang: "fr",
    hreflang_tags: false,
    noindex_admin: true,
    noindex_api: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await adminApi.getGlobalSeo();
      if (data && Object.keys(data).length > 0) setConfig({ ...config, ...data });
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    try { await adminApi.updateGlobalSeo(config); } catch (e) { console.error(e); }
    setSaving(false);
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">SEO Global</h1>
        <button onClick={save} disabled={saving} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50">
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Métadonnées</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Titre du site</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.site_title} onChange={e => setConfig({ ...config, site_title: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" rows={3}
              value={config.site_description} onChange={e => setConfig({ ...config, site_description: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Mots-clés (séparés par des virgules)</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.site_keywords} onChange={e => setConfig({ ...config, site_keywords: e.target.value })} placeholder="dj, cue points, audio, mix" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">URL canonique</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.canonical_url} onChange={e => setConfig({ ...config, canonical_url: e.target.value })} placeholder="https://trackcue.app" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Langue par défaut</label>
            <select className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.default_lang} onChange={e => setConfig({ ...config, default_lang: e.target.value })}>
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="de">Deutsch</option>
            </select>
          </div>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Open Graph & Social</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Image OG</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.og_image} onChange={e => setConfig({ ...config, og_image: e.target.value })} placeholder="https://..." />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Type OG</label>
            <select className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.og_type} onChange={e => setConfig({ ...config, og_type: e.target.value })}>
              <option value="website">Website</option>
              <option value="article">Article</option>
              <option value="product">Product</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Twitter Card</label>
            <select className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.twitter_card} onChange={e => setConfig({ ...config, twitter_card: e.target.value })}>
              <option value="summary">Summary</option>
              <option value="summary_large_image">Summary Large Image</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Twitter handle</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.twitter_handle} onChange={e => setConfig({ ...config, twitter_handle: e.target.value })} placeholder="@trackcue" />
          </div>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Vérification & Indexation</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Google verification</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.google_verification} onChange={e => setConfig({ ...config, google_verification: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Bing verification</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.bing_verification} onChange={e => setConfig({ ...config, bing_verification: e.target.value })} />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.structured_data} onChange={e => setConfig({ ...config, structured_data: e.target.checked })} />
            <span className="text-sm text-gray-300">Données structurées (JSON-LD)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.hreflang_tags} onChange={e => setConfig({ ...config, hreflang_tags: e.target.checked })} />
            <span className="text-sm text-gray-300">Tags hreflang</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.noindex_admin} onChange={e => setConfig({ ...config, noindex_admin: e.target.checked })} />
            <span className="text-sm text-gray-300">Noindex sur /admin</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.noindex_api} onChange={e => setConfig({ ...config, noindex_api: e.target.checked })} />
            <span className="text-sm text-gray-300">Noindex sur /api</span>
          </label>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Sitemap & Robots</h2>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.sitemap_enabled} onChange={e => setConfig({ ...config, sitemap_enabled: e.target.checked })} />
            <span className="text-sm text-gray-300">Sitemap activé</span>
          </label>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Fréquence sitemap</label>
            <select className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.sitemap_frequency} onChange={e => setConfig({ ...config, sitemap_frequency: e.target.value })}>
              <option value="always">Toujours</option>
              <option value="hourly">Horaire</option>
              <option value="daily">Quotidien</option>
              <option value="weekly">Hebdomadaire</option>
              <option value="monthly">Mensuel</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Robots.txt</label>
            <textarea className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono" rows={6}
              value={config.robots_txt} onChange={e => setConfig({ ...config, robots_txt: e.target.value })} />
          </div>
        </div>
      </div>
    </div>
  );
}
