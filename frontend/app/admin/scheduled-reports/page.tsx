"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

interface Report { id: number; name: string; description: string; report_type: string; format: string; schedule: string; recipients: string[]; is_active: boolean; last_generated: string | null; created_at: string; }
interface Generation { id: number; report_type: string; format: string; status: string; file_url: string; created_at: string; }

export default function ScheduledReportsAdmin() {
  const [tab, setTab] = useState<"reports" | "history">("reports");
  const [reports, setReports] = useState<Report[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [reportTypes, setReportTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", report_type: "revenue", format: "pdf", schedule: "weekly", recipients: "" });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [r, g, t] = await Promise.all([
        adminApi.getScheduledReports(), adminApi.getReportGenerations().catch(() => ({ items: [] })), adminApi.getReportTypes().catch(() => []),
      ]);
      setReports(r.items || []);
      setGenerations(g.items || []);
      setReportTypes(Array.isArray(t) ? t : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function create() {
    await adminApi.createScheduledReport({ ...form, recipients: form.recipients.split(",").map(r => r.trim()).filter(Boolean) });
    setShowModal(false);
    setForm({ name: "", description: "", report_type: "revenue", format: "pdf", schedule: "weekly", recipients: "" });
    loadAll();
  }

  async function generate(id: number) { await adminApi.generateReport(id); loadAll(); }
  async function del(id: number) { if (!confirm("Supprimer ?")) return; await adminApi.deleteScheduledReport(id); loadAll(); }

  const scheduleLabels: Record<string, string> = { daily: "Quotidien", weekly: "Hebdomadaire", monthly: "Mensuel", quarterly: "Trimestriel" };
  const statusColors: Record<string, string> = { generating: "bg-blue-900/50 text-blue-400", completed: "bg-green-900/50 text-green-400", failed: "bg-red-900/50 text-red-400" };

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Rapports planifiés</h1>
        <div className="flex gap-2">
          {(["reports", "history"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? "bg-purple-600 text-white" : "bg-[#1a1a2e] text-gray-400"}`}>
              {t === "reports" ? "Rapports" : "Historique"}
            </button>
          ))}
        </div>
      </div>

      {tab === "reports" && (
        <>
          <div className="flex justify-end">
            <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">+ Nouveau rapport</button>
          </div>
          <div className="space-y-2">
            {reports.map(r => (
              <div key={r.id} className="bg-[#1a1a2e] rounded-lg p-4 flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">{r.name}</div>
                  <div className="text-sm text-gray-400 mt-0.5">{r.description}</div>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs bg-[#0a0a1a] text-gray-400 px-2 py-0.5 rounded">{r.report_type}</span>
                    <span className="text-xs bg-[#0a0a1a] text-gray-400 px-2 py-0.5 rounded uppercase">{r.format}</span>
                    <span className="text-xs bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded">{scheduleLabels[r.schedule] || r.schedule}</span>
                  </div>
                  {r.last_generated && <div className="text-xs text-gray-500 mt-1">Dernier: {new Date(r.last_generated).toLocaleString("fr-FR")}</div>}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <button onClick={() => generate(r.id)} className="text-green-400 hover:text-green-300">Générer</button>
                  <button onClick={() => del(r.id)} className="text-red-400 hover:text-red-300">Supprimer</button>
                </div>
              </div>
            ))}
            {reports.length === 0 && <div className="text-center text-gray-500 py-8">Aucun rapport planifié</div>}
          </div>
        </>
      )}

      {tab === "history" && (
        <div className="space-y-2">
          {generations.map(g => (
            <div key={g.id} className="bg-[#1a1a2e] rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="text-white font-medium">{g.report_type} <span className="text-xs text-gray-400 uppercase">.{g.format}</span></div>
                <div className="text-xs text-gray-500">{g.created_at ? new Date(g.created_at).toLocaleString("fr-FR") : ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[g.status] || "bg-gray-700 text-gray-300"}`}>{g.status}</span>
                {g.file_url && <a href={g.file_url} className="text-blue-400 hover:text-blue-300 text-sm">Télécharger</a>}
              </div>
            </div>
          ))}
          {generations.length === 0 && <div className="text-center text-gray-500 py-8">Aucun rapport généré</div>}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold text-white">Nouveau rapport planifié</h2>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" placeholder="Nom" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <textarea className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" rows={2} placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <div className="grid grid-cols-3 gap-3">
              <select className="bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" value={form.report_type} onChange={e => setForm({ ...form, report_type: e.target.value })}>
                {reportTypes.length > 0 ? reportTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>) : <>
                  <option value="revenue">Revenue</option><option value="users">Utilisateurs</option><option value="tracks">Pistes</option><option value="churn">Churn</option><option value="activity">Activité</option>
                </>}
              </select>
              <select className="bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" value={form.format} onChange={e => setForm({ ...form, format: e.target.value })}>
                <option value="pdf">PDF</option><option value="csv">CSV</option><option value="xlsx">Excel</option>
              </select>
              <select className="bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" value={form.schedule} onChange={e => setForm({ ...form, schedule: e.target.value })}>
                <option value="daily">Quotidien</option><option value="weekly">Hebdomadaire</option><option value="monthly">Mensuel</option><option value="quarterly">Trimestriel</option>
              </select>
            </div>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" placeholder="Destinataires (emails séparés par virgules)" value={form.recipients} onChange={e => setForm({ ...form, recipients: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm">Annuler</button>
              <button onClick={create} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">Créer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
