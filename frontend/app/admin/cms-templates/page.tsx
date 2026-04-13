"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function CMSTemplatesPage() {
  const [tab, setTab] = useState<"templates"|"pages"|"blocks"|"visibility">("templates");
  const [templates, setTemplates] = useState<any[]>([]);
  const [pages, setPages] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", components: "[]" });
  const [toast, setToast] = useState("");

  const load = async () => {
    const [t, p, b, r] = await Promise.all([
      adminApi.listPageTemplates(), adminApi.listLandingPages(),
      adminApi.listContentBlocks(), adminApi.listVisibilityRules(),
    ]);
    setTemplates(t.items); setPages(p.items); setBlocks(b.items); setRules(r.items);
  };
  useEffect(() => { load(); }, []);

  const saveTemplate = async () => {
    try {
      await adminApi.createPageTemplate({ ...form, components: JSON.parse(form.components) });
      setShowCreate(false); load(); setToast("✅ Template créé");
    } catch { setToast("❌ JSON invalide"); }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">📄 CMS Avancé</h1>
      <div className="flex gap-2">
        {[
          { id: "templates", label: "Templates" }, { id: "pages", label: "Landing Pages" },
          { id: "blocks", label: "Blocs globaux" }, { id: "visibility", label: "Visibilité" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} className={`px-4 py-2 rounded-lg text-sm ${tab === t.id ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}>{t.label}</button>
        ))}
      </div>

      {tab === "templates" && (
        <>
          <button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg">+ Nouveau template</button>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {templates.map(t => (
              <div key={t.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <h3 className="text-white font-bold">{t.name}</h3>
                <p className="text-sm text-slate-400 mt-1">{t.description || "Pas de description"}</p>
                <p className="text-xs text-slate-500 mt-2">{(t.components || []).length} composant(s)</p>
                <div className="flex gap-2 mt-3">
                  <button onClick={async () => { await adminApi.duplicatePageTemplate(t.id); load(); }} className="text-indigo-400 text-xs">Dupliquer</button>
                  <button onClick={async () => { if (confirm("Supprimer ?")) { await adminApi.deletePageTemplate(t.id); load(); }}} className="text-red-400 text-xs">Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "pages" && (
        <div className="bg-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-700 text-slate-400">
              <th className="text-left p-3">Page</th><th className="text-left p-3">Slug</th><th className="text-left p-3">Sections</th><th className="text-left p-3">Statut</th><th className="p-3">Actions</th>
            </tr></thead>
            <tbody>{pages.map(p => (
              <tr key={p.id} className="border-b border-slate-700/50">
                <td className="p-3 text-white font-medium">{p.name}</td>
                <td className="p-3 text-slate-300 font-mono text-xs">/{p.slug}</td>
                <td className="p-3 text-slate-300">{p.sections_count}</td>
                <td className="p-3">{p.is_published ? <span className="text-green-400">Publié</span> : <span className="text-orange-400">Brouillon</span>}</td>
                <td className="p-3 flex gap-2 justify-end">
                  <button onClick={async () => { await adminApi.createPageVersion(p.id, "Sauvegarde manuelle"); setToast("📸 Version créée"); }} className="text-cyan-400 text-xs">Snapshot</button>
                  <button onClick={async () => { await adminApi.duplicateLandingPage(p.id); load(); }} className="text-indigo-400 text-xs">Dupliquer</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === "blocks" && (
        <div className="space-y-3">
          {blocks.map(b => (
            <div key={b.id} className="bg-slate-800 rounded-lg p-4 flex items-center justify-between">
              <div>
                <span className="text-white font-medium">{b.name}</span>
                <span className="ml-2 bg-slate-700 text-slate-400 px-2 py-0.5 rounded text-xs">{b.block_type}</span>
                <span className={`ml-2 text-xs ${b.is_active ? "text-green-400" : "text-red-400"}`}>{b.is_active ? "Actif" : "Inactif"}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "visibility" && (
        <div className="bg-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-700 text-slate-400">
              <th className="text-left p-3">Cible</th><th className="text-left p-3">Type</th><th className="text-left p-3">Condition</th><th className="text-left p-3">Valeur</th><th className="p-3"></th>
            </tr></thead>
            <tbody>{rules.map(r => (
              <tr key={r.id} className="border-b border-slate-700/50">
                <td className="p-3 text-white">{r.target_type} #{r.target_id}</td>
                <td className="p-3 text-slate-300">{r.condition_type}</td>
                <td className="p-3 text-slate-300">{r.condition_value}</td>
                <td className="p-3">{r.is_active ? <span className="text-green-400">Actif</span> : <span className="text-slate-400">Inactif</span>}</td>
                <td className="p-3 text-right"><button onClick={async () => { await adminApi.deleteVisibilityRule(r.id); load(); }} className="text-red-400 text-xs">Supprimer</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 max-w-lg w-full">
            <h3 className="text-lg font-bold text-white mb-4">Nouveau template de page</h3>
            <div className="space-y-3">
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Nom" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
              <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
              <textarea value={form.components} onChange={e => setForm({...form, components: e.target.value})} placeholder='[{"type": "hero", "props": {}}]' rows={4} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white font-mono text-sm" />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={saveTemplate} className="bg-indigo-600 text-white px-4 py-2 rounded">Créer</button>
              <button onClick={() => setShowCreate(false)} className="bg-slate-700 text-white px-4 py-2 rounded">Annuler</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg" onClick={() => setToast("")}>{toast}</div>}
    </div>
  );
}
