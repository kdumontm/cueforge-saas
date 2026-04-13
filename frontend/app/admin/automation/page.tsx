"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function AutomationPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [triggers, setTriggers] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [tab, setTab] = useState<"rules"|"logs">("rules");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", trigger_type: "", conditions: "[]", actions: "[]", is_active: true });
  const [toast, setToast] = useState("");

  const load = async () => {
    const [r, t, a, l] = await Promise.all([
      adminApi.listAutomationRules(), adminApi.listAutomationTriggers(),
      adminApi.listAutomationActions(), adminApi.listAutomationLogs(),
    ]);
    setRules(r.items); setTriggers(t.triggers); setActions(a.actions); setLogs(l.items);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const data = { ...form, conditions: JSON.parse(form.conditions), actions: JSON.parse(form.actions) };
      await adminApi.createAutomationRule(data);
      setShowCreate(false); load(); setToast("✅ Règle créée");
    } catch { setToast("❌ JSON invalide"); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">🤖 Automatisation</h1>
        <button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg">+ Nouvelle règle</button>
      </div>

      <div className="flex gap-2">
        {(["rules", "logs"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm ${tab === t ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}>
            {t === "rules" ? "Règles" : "Historique"}
          </button>
        ))}
      </div>

      {tab === "rules" && (
        <div className="space-y-3">
          {rules.map(r => (
            <div key={r.id} className="bg-slate-800 rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${r.is_active ? "bg-green-400" : "bg-slate-500"}`} />
                  <span className="text-white font-medium">{r.name}</span>
                </div>
                <div className="text-sm text-slate-400 mt-1">
                  Trigger: <span className="text-cyan-400">{r.trigger_type}</span> • {r.actions?.length || 0} action(s) • Exécuté {r.run_count}x
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={async () => { await adminApi.toggleAutomationRule(r.id); load(); }} className="text-sm px-3 py-1 rounded bg-slate-700 text-slate-300 hover:text-white">{r.is_active ? "Désactiver" : "Activer"}</button>
                <button onClick={async () => { const res = await adminApi.testAutomationRule(r.id); setToast(`🧪 ${res.message}`); }} className="text-cyan-400 text-sm">Tester</button>
                <button onClick={async () => { await adminApi.duplicateAutomationRule(r.id); load(); }} className="text-slate-400 text-sm">Dupliquer</button>
                <button onClick={async () => { if (confirm("Supprimer ?")) { await adminApi.deleteAutomationRule(r.id); load(); }}} className="text-red-400 text-sm">×</button>
              </div>
            </div>
          ))}
          {rules.length === 0 && <p className="text-slate-500 text-center py-8">Aucune règle d'automatisation</p>}
        </div>
      )}

      {tab === "logs" && (
        <div className="bg-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-700 text-slate-400">
              <th className="text-left p-3">Règle</th><th className="text-left p-3">Trigger</th><th className="text-left p-3">Résultat</th><th className="text-left p-3">Date</th>
            </tr></thead>
            <tbody>{logs.map(l => (
              <tr key={l.id} className="border-b border-slate-700/50">
                <td className="p-3 text-white">#{l.rule_id}</td>
                <td className="p-3 text-slate-300">{l.trigger_event}</td>
                <td className="p-3"><span className={l.result === "success" ? "text-green-400" : "text-red-400"}>{l.result}</span></td>
                <td className="p-3 text-slate-400 text-xs">{l.executed_at}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 max-w-lg w-full">
            <h3 className="text-lg font-bold text-white mb-4">Nouvelle règle</h3>
            <div className="space-y-3">
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Nom" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
              <select value={form.trigger_type} onChange={e => setForm({...form, trigger_type: e.target.value})} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white">
                <option value="">Sélectionner un trigger</option>
                {triggers.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <div><label className="text-sm text-slate-400">Actions disponibles:</label>
                <div className="flex flex-wrap gap-1 mt-1">{actions.map(a => <span key={a.id} className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded text-xs">{a.label}</span>)}</div>
              </div>
              <textarea value={form.actions} onChange={e => setForm({...form, actions: e.target.value})} placeholder='Actions JSON: [{"id": "send_email", "template_id": 1}]' rows={3} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white font-mono text-sm" />
              <textarea value={form.conditions} onChange={e => setForm({...form, conditions: e.target.value})} placeholder="Conditions JSON (optionnel)" rows={2} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white font-mono text-sm" />
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
