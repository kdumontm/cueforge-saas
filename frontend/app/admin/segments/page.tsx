"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";
export default function SegmentsPage() {
  const [segments, setSegments] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", color: "#6366f1", rules: "[]" });
  const [toast, setToast] = useState("");
  const load = async () => { const r = await adminApi.listSegments(); setSegments(r.items); };
  useEffect(() => { load(); }, []);
  const save = async () => { try { await adminApi.createSegment({ ...form, rules: JSON.parse(form.rules) }); setShowCreate(false); load(); setToast("✅ Segment créé"); } catch { setToast("❌ JSON invalide"); } };
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold text-white">🎯 Segments Utilisateurs</h1>
        <button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg">+ Nouveau segment</button></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{segments.map(s => (
        <div key={s.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{backgroundColor: s.color}} /><h3 className="text-white font-bold">{s.name}</h3></div>
          <p className="text-sm text-slate-400 mt-1">{s.description || "—"}</p>
          <div className="text-sm text-slate-300 mt-2">{s.user_count} utilisateurs • {(s.rules||[]).length} règle(s)</div>
          <div className="flex gap-2 mt-3">
            <button onClick={async () => { const r = await adminApi.refreshSegment(s.id); setToast(`✅ ${r.user_count} utilisateurs`); load(); }} className="text-cyan-400 text-xs">Rafraîchir</button>
            <button onClick={async () => { if(confirm("Supprimer ?")){ await adminApi.deleteSegment(s.id); load(); }}} className="text-red-400 text-xs">Supprimer</button>
          </div>
        </div>))}</div>
      {showCreate && <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"><div className="bg-slate-800 rounded-xl p-6 max-w-lg w-full">
        <h3 className="text-lg font-bold text-white mb-4">Nouveau segment</h3>
        <div className="space-y-3">
          <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Nom" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
          <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
          <div className="flex gap-2"><label className="text-slate-400">Couleur</label><input type="color" value={form.color} onChange={e => setForm({...form, color: e.target.value})} /></div>
          <textarea value={form.rules} onChange={e => setForm({...form, rules: e.target.value})} placeholder='[{"field":"plan","operator":"eq","value":"pro"}]' rows={3} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white font-mono text-sm" />
        </div>
        <div className="flex gap-3 mt-4"><button onClick={save} className="bg-indigo-600 text-white px-4 py-2 rounded">Créer</button><button onClick={() => setShowCreate(false)} className="bg-slate-700 text-white px-4 py-2 rounded">Annuler</button></div>
      </div></div>}
      {toast && <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg" onClick={() => setToast("")}>{toast}</div>}
    </div>);
}
