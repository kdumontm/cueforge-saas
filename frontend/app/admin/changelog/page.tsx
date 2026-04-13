"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";
export default function ChangelogPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", version: "", category: "feature" });
  const [toast, setToast] = useState("");
  const load = async () => { const r = await adminApi.listChangelog(); setEntries(r.items); };
  useEffect(() => { load(); }, []);
  const save = async () => { await adminApi.createChangelog(form); setShowCreate(false); load(); setToast("✅ Entrée créée"); };
  const cats: Record<string,string> = { feature: "🆕 Feature", improvement: "⬆️ Amélioration", bugfix: "🐛 Bugfix", breaking: "⚠️ Breaking" };
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold text-white">📝 Changelog</h1>
        <button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg">+ Nouvelle entrée</button></div>
      <div className="space-y-3">{entries.map(e => (
        <div key={e.id} className="bg-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm">{cats[e.category] || e.category}</span>
              <span className="text-white font-bold">{e.title}</span>
              {e.version && <span className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded text-xs">v{e.version}</span>}
            </div>
            <div className="flex gap-2 items-center">
              {e.is_published ? <span className="text-green-400 text-xs">Publié</span> : <button onClick={async () => { await adminApi.publishChangelog(e.id); load(); }} className="text-indigo-400 text-xs">Publier</button>}
              <button onClick={async () => { if(confirm("Supprimer ?")){ await adminApi.deleteChangelog(e.id); load(); }}} className="text-red-400 text-xs">×</button>
            </div>
          </div>
          <p className="text-sm text-slate-400 mt-2">{e.content}</p>
          <div className="text-xs text-slate-500 mt-2">{e.created_at && new Date(e.created_at).toLocaleDateString()}</div>
        </div>))}</div>
      {showCreate && <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"><div className="bg-slate-800 rounded-xl p-6 max-w-lg w-full">
        <h3 className="text-lg font-bold text-white mb-4">Nouvelle entrée changelog</h3>
        <div className="space-y-3">
          <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Titre" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
          <div className="flex gap-2">
            <input value={form.version} onChange={e => setForm({...form, version: e.target.value})} placeholder="Version (ex: 2.1.0)" className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
            <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white">
              {Object.entries(cats).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
          <textarea value={form.content} onChange={e => setForm({...form, content: e.target.value})} placeholder="Contenu..." rows={5} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
        </div>
        <div className="flex gap-3 mt-4"><button onClick={save} className="bg-indigo-600 text-white px-4 py-2 rounded">Créer</button><button onClick={() => setShowCreate(false)} className="bg-slate-700 text-white px-4 py-2 rounded">Annuler</button></div>
      </div></div>}
      {toast && <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg" onClick={() => setToast("")}>{toast}</div>}
    </div>);
}
