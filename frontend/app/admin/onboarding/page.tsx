"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function OnboardingPage() {
  const [steps, setSteps] = useState<any[]>([]);
  const [funnel, setFunnel] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", component: "", is_required: true, target_plan: "" });
  const [toast, setToast] = useState("");

  const load = async () => {
    try {
      const [s, f] = await Promise.all([adminApi.listOnboardingSteps(), adminApi.onboardingFunnelStats()]);
      setSteps(s.items || []); setFunnel(f);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    await adminApi.createOnboardingStep(form);
    setShowCreate(false); load(); setToast("✅ Étape créée");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">🚀 Configuration Onboarding</h1>
        <button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg">+ Nouvelle étape</button>
      </div>

      {funnel && funnel.steps && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h2 className="text-lg font-bold text-white mb-3">Funnel de complétion</h2>
          <div className="space-y-2">
            {funnel.steps.map((s: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-slate-400 text-sm w-32 truncate">{s.title}</span>
                <div className="flex-1 bg-slate-700 rounded-full h-4 overflow-hidden">
                  <div className="bg-green-500 h-full rounded-full" style={{ width: s.completion_rate + "%" }} />
                </div>
                <span className="text-white text-sm w-12 text-right">{s.completion_rate}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {steps.map((s, i) => (
          <div key={s.id} className="bg-slate-800 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="bg-indigo-500/20 text-indigo-400 w-8 h-8 rounded-full flex items-center justify-center font-bold">{i + 1}</span>
              <div>
                <div className="text-white font-medium">{s.title}</div>
                <div className="text-xs text-slate-400">{s.description} {s.is_required && <span className="text-orange-400">• Requis</span>}</div>
              </div>
            </div>
            <button onClick={async () => { if (confirm("Supprimer ?")) { await adminApi.deleteOnboardingStep(s.id); load(); }}} className="text-red-400 text-sm">Supprimer</button>
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 max-w-lg w-full">
            <h3 className="text-lg font-bold text-white mb-4">Nouvelle étape</h3>
            <div className="space-y-3">
              <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Titre" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
              <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
              <input value={form.component} onChange={e => setForm({...form, component: e.target.value})} placeholder="Composant (ex: upload-track)" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
              <input value={form.target_plan} onChange={e => setForm({...form, target_plan: e.target.value})} placeholder="Plan cible (vide = tous)" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
              <label className="flex items-center gap-2 text-white"><input type="checkbox" checked={form.is_required} onChange={e => setForm({...form, is_required: e.target.checked})} /> Obligatoire</label>
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
