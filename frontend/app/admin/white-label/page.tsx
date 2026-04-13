"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function WhiteLabelAdmin() {
  const [config, setConfig] = useState<any>({
    enabled: false,
    company_name: "",
    logo_url: "",
    favicon_url: "",
    primary_color: "#7c3aed",
    secondary_color: "#4f46e5",
    custom_domain: "",
    email_from_name: "",
    email_from_address: "",
    footer_text: "",
    hide_powered_by: false,
    custom_css: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await adminApi.getWhiteLabelConfig();
      if (data && Object.keys(data).length > 0) setConfig({ ...config, ...data });
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    try {
      await adminApi.updateWhiteLabelConfig(config);
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  const Field = ({ label, field, type = "text", placeholder = "" }: { label: string; field: string; type?: string; placeholder?: string }) => (
    <div>
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      {type === "textarea" ? (
        <textarea className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" rows={4}
          value={config[field] || ""} onChange={e => setConfig({ ...config, [field]: e.target.value })} placeholder={placeholder} />
      ) : type === "checkbox" ? (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={config[field] || false} onChange={e => setConfig({ ...config, [field]: e.target.checked })} />
          <span className="text-sm text-gray-300">{placeholder || "Activé"}</span>
        </label>
      ) : type === "color" ? (
        <div className="flex items-center gap-2">
          <input type="color" value={config[field] || "#7c3aed"} onChange={e => setConfig({ ...config, [field]: e.target.value })} className="w-10 h-10 rounded cursor-pointer" />
          <input className="bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm flex-1"
            value={config[field] || ""} onChange={e => setConfig({ ...config, [field]: e.target.value })} />
        </div>
      ) : (
        <input type={type} className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          value={config[field] || ""} onChange={e => setConfig({ ...config, [field]: e.target.value })} placeholder={placeholder} />
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">White Label</h1>
        <button onClick={save} disabled={saving} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50">
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Identité</h2>
          <Field label="White Label activé" field="enabled" type="checkbox" placeholder="Activer le mode white label" />
          <Field label="Nom de l'entreprise" field="company_name" placeholder="Mon Entreprise" />
          <Field label="URL du logo" field="logo_url" placeholder="https://..." />
          <Field label="URL du favicon" field="favicon_url" placeholder="https://..." />
          <Field label="Domaine personnalisé" field="custom_domain" placeholder="app.mondomaine.com" />
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Couleurs</h2>
          <Field label="Couleur principale" field="primary_color" type="color" />
          <Field label="Couleur secondaire" field="secondary_color" type="color" />
          <div className="mt-4">
            <div className="text-sm text-gray-400 mb-2">Aperçu</div>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-lg text-white text-sm" style={{ backgroundColor: config.primary_color }}>Bouton primaire</button>
              <button className="px-4 py-2 rounded-lg text-white text-sm" style={{ backgroundColor: config.secondary_color }}>Bouton secondaire</button>
            </div>
          </div>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Emails</h2>
          <Field label="Nom d'expéditeur" field="email_from_name" placeholder="Support MonApp" />
          <Field label="Adresse d'expédition" field="email_from_address" placeholder="support@monapp.com" />
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Personnalisation</h2>
          <Field label="Texte du footer" field="footer_text" placeholder="© 2026 MonApp" />
          <Field label="Masquer 'Powered by CueForge'" field="hide_powered_by" type="checkbox" />
          <Field label="CSS personnalisé" field="custom_css" type="textarea" placeholder=".header { ... }" />
        </div>
      </div>
    </div>
  );
}
