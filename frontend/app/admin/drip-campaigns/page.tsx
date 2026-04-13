"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function DripCampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [triggers, setTriggers] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", trigger_event: "", steps: "[]" });
  const [toast, setToast] = useState("");

  const load = async () => {
    const [c, t] = await Promise.all([adminApi.listDripCampaigns(), adminApi.listDripTriggers()]);
    setCampaigns(c.items); setTriggers(t.triggers);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await adminApi.createDripCampaign({ ...form, steps: JSON.parse(form.steps) });
      setShowCreate(false); load(); setToast("✅ Campagne créée");
    } catch { setToast("❌ JSON invalide"); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">📬 Campagnes Drip</h1>
        <button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg">+ Nouvelle campagne</button>
      </div>
      <div className="space-y-3">
        {campaigns.map(c => (
          <div key={c.id} className="bg-slate-800 rounded-lg p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${c.is_active ? "bg-green-400" : "bg-slate-500"}`} />
                <span className="text-white font-medium">{c.name}</span>
              </div>
              <div className="text-sm text-slate-400 mt-1">Trigger: <span className="text-cyan-400">{c.trigger_event}</span> • {(c.steps || []).length} étape(s) • {c.total_enrolled} inscrits • {c.total_completed} terminés</div>
            </div>
            <div className="flex gap-2">
              <button onClick={async () => { await adminApi.duplicateDripCampaign(c.id); load(); }} className="text-slate-400 text-sm">Dupliquer</button>
              <button onClick={async () => { if (confirm("Supprimer ?")) { await adminApi.deleteDripCampaign(c.id); load(); }}} className="text-red-400 text-sm">Supprimer</button>
            </div>
          </div>
        ))}
        {campaigns.length === 0 && <p className="text-slate-500 text-center py-8">Aucune campagne drip</p>}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 max-w-lg w-full">
            <h3 className="text-lg font-bold text-white mb-4">Nouvelle campagne</h3>
            <div className="space-y-3">
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Nom" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
              <select value={form.trigger_event} onChange={e => setForm({...form, trigger_event: e.target.value})} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white">
                <option value="">Sélectionner un trigger</option>
                {triggers.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <textarea value={form.steps} onChange={e => setForm({...form, steps: e.target.value})} placeholder='[{"delay_hours": 24, "template_id": 1}]' rows={4} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white font-mono text-sm" />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={save} className="bg-indigo-600 text-white px-4 py-2 rounded">Créer</button>
              <button onClick={() => setShowCreate(false)} className="bg-slate-700 text-white px-4 py-2 rounded">Annuler</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg" onClick={() => setToast("")}>{toast}</div>}
    </div>
  );
}
