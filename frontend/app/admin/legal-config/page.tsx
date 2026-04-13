"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function LegalConfigAdmin() {
  const [tab, setTab] = useState<"cookies" | "gdpr" | "age" | "terms">("cookies");
  const [config, setConfig] = useState<any>({
    cookie_consent_enabled: true,
    cookie_banner_text: "Ce site utilise des cookies pour améliorer votre expérience.",
    cookie_banner_position: "bottom",
    cookie_categories: ["essential", "analytics", "marketing"],
    cookie_policy_url: "/legal/cookies",
    gdpr_enabled: true,
    data_export_enabled: true,
    data_deletion_enabled: true,
    data_retention_days: 365,
    dpo_email: "",
    privacy_policy_url: "/legal/privacy",
    consent_log_enabled: true,
    age_verification_enabled: false,
    minimum_age: 13,
    age_gate_type: "checkbox",
    terms_url: "/legal/terms",
    terms_version: "1.0",
    terms_last_updated: "",
    require_terms_acceptance: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await adminApi.getLegalConfig();
      if (data && Object.keys(data).length > 0) setConfig({ ...config, ...data });
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    try { await adminApi.updateLegalConfig(config); } catch (e) { console.error(e); }
    setSaving(false);
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Conformité légale</h1>
        <button onClick={save} disabled={saving} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50">
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>

      <div className="flex gap-2">
        {(["cookies", "gdpr", "age", "terms"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? "bg-purple-600 text-white" : "bg-[#1a1a2e] text-gray-400 hover:text-white"}`}>
            {t === "cookies" ? "Cookies" : t === "gdpr" ? "RGPD" : t === "age" ? "Âge" : "CGU"}
          </button>
        ))}
      </div>

      {tab === "cookies" && (
        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Consentement aux cookies</h2>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.cookie_consent_enabled} onChange={e => setConfig({ ...config, cookie_consent_enabled: e.target.checked })} />
            <span className="text-sm text-gray-300">Bannière de cookies activée</span>
          </label>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Texte de la bannière</label>
            <textarea className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" rows={3}
              value={config.cookie_banner_text} onChange={e => setConfig({ ...config, cookie_banner_text: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Position</label>
            <select className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.cookie_banner_position} onChange={e => setConfig({ ...config, cookie_banner_position: e.target.value })}>
              <option value="bottom">Bas de page</option>
              <option value="top">Haut de page</option>
              <option value="center">Centre (modal)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Catégories de cookies</label>
            <div className="space-y-2">
              {["essential", "analytics", "marketing", "functional", "performance"].map(cat => (
                <label key={cat} className="flex items-center gap-2">
                  <input type="checkbox" checked={(config.cookie_categories || []).includes(cat)}
                    disabled={cat === "essential"}
                    onChange={e => {
                      const cats = config.cookie_categories || [];
                      setConfig({
                        ...config,
                        cookie_categories: e.target.checked ? [...cats, cat] : cats.filter((c: string) => c !== cat),
                      });
                    }} />
                  <span className="text-sm text-gray-300 capitalize">{cat}{cat === "essential" ? " (obligatoire)" : ""}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">URL politique cookies</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.cookie_policy_url} onChange={e => setConfig({ ...config, cookie_policy_url: e.target.value })} />
          </div>
        </div>
      )}

      {tab === "gdpr" && (
        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">RGPD / Protection des données</h2>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.gdpr_enabled} onChange={e => setConfig({ ...config, gdpr_enabled: e.target.checked })} />
            <span className="text-sm text-gray-300">Conformité RGPD activée</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.data_export_enabled} onChange={e => setConfig({ ...config, data_export_enabled: e.target.checked })} />
            <span className="text-sm text-gray-300">Export des données (droit à la portabilité)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.data_deletion_enabled} onChange={e => setConfig({ ...config, data_deletion_enabled: e.target.checked })} />
            <span className="text-sm text-gray-300">Suppression des données (droit à l&apos;oubli)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.consent_log_enabled} onChange={e => setConfig({ ...config, consent_log_enabled: e.target.checked })} />
            <span className="text-sm text-gray-300">Journal des consentements</span>
          </label>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Durée de rétention des données (jours)</label>
            <input type="number" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.data_retention_days} onChange={e => setConfig({ ...config, data_retention_days: parseInt(e.target.value) || 30 })} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email du DPO</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.dpo_email} onChange={e => setConfig({ ...config, dpo_email: e.target.value })} placeholder="dpo@cueforge.app" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">URL politique de confidentialité</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.privacy_policy_url} onChange={e => setConfig({ ...config, privacy_policy_url: e.target.value })} />
          </div>
        </div>
      )}

      {tab === "age" && (
        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Vérification de l&apos;âge</h2>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.age_verification_enabled} onChange={e => setConfig({ ...config, age_verification_enabled: e.target.checked })} />
            <span className="text-sm text-gray-300">Vérification de l&apos;âge activée</span>
          </label>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Âge minimum</label>
            <input type="number" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.minimum_age} onChange={e => setConfig({ ...config, minimum_age: parseInt(e.target.value) || 13 })} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Type de vérification</label>
            <select className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.age_gate_type} onChange={e => setConfig({ ...config, age_gate_type: e.target.value })}>
              <option value="checkbox">Checkbox simple</option>
              <option value="date_input">Saisie de date de naissance</option>
              <option value="year_select">Sélection d&apos;année</option>
            </select>
          </div>
        </div>
      )}

      {tab === "terms" && (
        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Conditions d&apos;utilisation</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1">URL des CGU</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.terms_url} onChange={e => setConfig({ ...config, terms_url: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Version des CGU</label>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.terms_version} onChange={e => setConfig({ ...config, terms_version: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Dernière mise à jour</label>
            <input type="date" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.terms_last_updated} onChange={e => setConfig({ ...config, terms_last_updated: e.target.value })} />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.require_terms_acceptance} onChange={e => setConfig({ ...config, require_terms_acceptance: e.target.checked })} />
            <span className="text-sm text-gray-300">Acceptation obligatoire à l&apos;inscription</span>
          </label>
        </div>
      )}
    </div>
  );
}
