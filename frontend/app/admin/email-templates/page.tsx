"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [form, setForm] = useState({ name: "", subject: "", html_body: "", text_body: "", category: "transactional", variables: "" });
  const [stats, setStats] = useState<any>(null);
  const [toast, setToast] = useState("");

  const load = async () => {
    const r = await adminApi.listEmailTemplates({ search, category: category || undefined });
    setTemplates(r.items); setTotal(r.total);
    const s = await adminApi.emailStats();
    setStats(s);
  };
  useEffect(() => { load(); }, [search, category]);

  const save = async () => {
    const data = { ...form, variables: form.variables.split(",").map((v: string) => v.trim()).filter(Boolean) };
    if (editing) { await adminApi.updateEmailTemplate(editing.id, data); }
    else { await adminApi.createEmailTemplate(data); }
    setShowCreate(false); setEditing(null); setForm({ name: "", subject: "", html_body: "", text_body: "", category: "transactional", variables: "" });
    load(); setToast("✅ Sauvegardé");
  };

  const edit = (t: any) => {
    setEditing(t);
    setForm({ name: t.name, subject: t.subject, html_body: t.html_body, text_body: t.text_body || "", category: t.category, variables: (t.variables || []).join(", ") });
    setShowCreate(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">📧 Templates Email</h1>
        <button onClick={() => { setEditing(null); setForm({ name: "", subject: "", html_body: "", text_body: "", category: "transactional", variables: "" }); setShowCreate(true); }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg">+ Nouveau template</button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[["Envoyés", stats.total], ["Ouverts", stats.opened], ["Cliqués", stats.clicked], ["Taux ouverture", stats.open_rate + "%"]].map(([l, v]) => (
            <div key={String(l)} className="bg-slate-800 rounded-lg p-4"><div className="text-sm text-slate-400">{l}</div><div className="text-xl font-bold text-white">{v}</div></div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white flex-1" />
        <select value={category} onChange={e => setCategory(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white">
          <option value="">Toutes catégories</option>
          {["transactional", "marketing", "onboarding", "notification"].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-700 text-slate-400">
            <th className="text-left p-3">Nom</th><th className="text-left p-3">Sujet</th><th className="text-left p-3">Catégorie</th><th className="text-left p-3">Statut</th><th className="p-3">Actions</th>
          </tr></thead>
          <tbody>{templates.map(t => (
            <tr key={t.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
              <td className="p-3 text-white font-medium">{t.name}</td>
              <td className="p-3 text-slate-300">{t.subject}</td>
              <td className="p-3"><span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded text-xs">{t.category}</span></td>
              <td className="p-3">{t.is_active ? <span className="text-green-400">Actif</span> : <span className="text-red-400">Inactif</span>}</td>
              <td className="p-3 flex gap-2 justify-end">
                <button onClick={() => edit(t)} className="text-indigo-400 hover:text-indigo-300 text-xs">Modifier</button>
                <button onClick={async () => { setPreview(await adminApi.previewEmailTemplate(t.id)); }} className="text-cyan-400 hover:text-cyan-300 text-xs">Aperçu</button>
                <button onClick={async () => { await adminApi.duplicateEmailTemplate(t.id); load(); }} className="text-slate-400 hover:text-slate-300 text-xs">Dupliquer</button>
                <button onClick={async () => { if (confirm("Supprimer ?")) { await adminApi.deleteEmailTemplate(t.id); load(); }}} className="text-red-400 hover:text-red-300 text-xs">Supprimer</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {preview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setPreview(null)}>
          <div className="bg-slate-800 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2">Aperçu : {preview.subject}</h3>
            <div className="bg-white rounded-lg p-4 text-black" dangerouslySetInnerHTML={{ __html: preview.html }} />
            <button onClick={() => setPreview(null)} className="mt-4 bg-slate-700 text-white px-4 py-2 rounded">Fermer</button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-bold text-white mb-4">{editing ? "Modifier" : "Nouveau"} template</h3>
            <div className="space-y-3">
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Nom" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
              <input value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} placeholder="Sujet" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white">
                {["transactional", "marketing", "onboarding", "notification"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <textarea value={form.html_body} onChange={e => setForm({...form, html_body: e.target.value})} placeholder="Corps HTML" rows={8} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white font-mono text-sm" />
              <input value={form.variables} onChange={e => setForm({...form, variables: e.target.value})} placeholder="Variables (ex: name, email)" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={save} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded">Sauvegarder</button>
              <button onClick={() => { setShowCreate(false); setEditing(null); }} className="bg-slate-700 text-white px-4 py-2 rounded">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg" onClick={() => setToast("")}>{toast}</div>}
    </div>
  );
}
