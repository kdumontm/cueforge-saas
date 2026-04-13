"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";
export default function FormsPage() {
  const [forms, setForms] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", form_type: "survey", fields: "[]", settings: "{}" });
  const [selected, setSelected] = useState<any>(null);
  const [responses, setResponses] = useState<any[]>([]);
  const [toast, setToast] = useState("");
  const load = async () => { const r = await adminApi.listForms(); setForms(r.items); };
  useEffect(() => { load(); }, []);
  const save = async () => { try { await adminApi.createForm({ ...form, fields: JSON.parse(form.fields), settings: JSON.parse(form.settings) }); setShowCreate(false); load(); setToast("✅ Formulaire créé"); } catch { setToast("❌ JSON invalide"); } };
  const viewResponses = async (f: any) => { setSelected(f); const r = await adminApi.formResponses(f.id); setResponses(r.items); };
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold text-white">📋 Formulaires & Surveys</h1>
        <button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg">+ Nouveau formulaire</button></div>
      <div className="bg-slate-800 rounded-lg overflow-hidden"><table className="w-full text-sm">
        <thead><tr className="border-b border-slate-700 text-slate-400"><th className="text-left p-3">Nom</th><th className="text-left p-3">Type</th><th className="text-left p-3">Réponses</th><th className="text-left p-3">Statut</th><th className="p-3">Actions</th></tr></thead>
        <tbody>{forms.map(f => (<tr key={f.id} className="border-b border-slate-700/50">
          <td className="p-3 text-white font-medium">{f.name}</td>
          <td className="p-3"><span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded text-xs">{f.form_type}</span></td>
          <td className="p-3 text-slate-300">{f.responses_count}</td>
          <td className="p-3">{f.is_active ? <span className="text-green-400">Actif</span> : <span className="text-red-400">Inactif</span>}</td>
          <td className="p-3 flex gap-2 justify-end">
            <button onClick={() => viewResponses(f)} className="text-cyan-400 text-xs">Réponses</button>
            <button onClick={async () => { await adminApi.duplicateForm(f.id); load(); }} className="text-slate-400 text-xs">Dupliquer</button>
            <button onClick={async () => { if(confirm("Supprimer ?")){ await adminApi.deleteForm(f.id); load(); }}} className="text-red-400 text-xs">Supprimer</button>
          </td></tr>))}</tbody></table></div>
      {selected && <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setSelected(null)}>
        <div className="bg-slate-800 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
          <h3 className="text-lg font-bold text-white mb-4">Réponses: {selected.name}</h3>
          {responses.map(r => <div key={r.id} className="bg-slate-700/50 rounded p-3 mb-2"><pre className="text-xs text-slate-300">{JSON.stringify(r.data, null, 2)}</pre><div className="text-xs text-slate-500 mt-1">{r.submitted_at}</div></div>)}
          {responses.length === 0 && <p className="text-slate-500">Aucune réponse</p>}
        </div></div>}
      {showCreate && <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"><div className="bg-slate-800 rounded-xl p-6 max-w-lg w-full">
        <h3 className="text-lg font-bold text-white mb-4">Nouveau formulaire</h3>
        <div className="space-y-3">
          <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Nom" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
          <select value={form.form_type} onChange={e => setForm({...form, form_type: e.target.value})} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white">
            {["survey","nps","churn","feedback","contact"].map(t => <option key={t} value={t}>{t}</option>)}</select>
          <textarea value={form.fields} onChange={e => setForm({...form, fields: e.target.value})} placeholder='[{"type":"text","label":"Nom","name":"name","required":true}]' rows={4} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white font-mono text-sm" />
        </div>
        <div className="flex gap-3 mt-4"><button onClick={save} className="bg-indigo-600 text-white px-4 py-2 rounded">Créer</button><button onClick={() => setShowCreate(false)} className="bg-slate-700 text-white px-4 py-2 rounded">Annuler</button></div>
      </div></div>}
      {toast && <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg" onClick={() => setToast("")}>{toast}</div>}
    </div>);
}
