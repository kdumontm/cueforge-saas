"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

interface StatusService {
  id: number;
  name: string;
  description: string;
  status: string;
  url: string;
  position: number;
  is_visible: boolean;
  created_at: string;
}

interface StatusIncident {
  id: number;
  title: string;
  description: string;
  severity: string;
  status: string;
  affected_services: any;
  messages: any[];
  created_at: string;
  resolved_at: string | null;
}

export default function StatusPageAdmin() {
  const [tab, setTab] = useState<"services" | "incidents">("services");
  const [services, setServices] = useState<StatusService[]>([]);
  const [incidents, setIncidents] = useState<StatusIncident[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "", status: "operational", url: "", is_visible: true });
  const [incidentForm, setIncidentForm] = useState({ title: "", description: "", severity: "minor", status: "investigating", affected_services: [] as number[] });

  const statusColors: Record<string, string> = {
    operational: "bg-green-100 text-green-800",
    degraded: "bg-yellow-100 text-yellow-800",
    partial_outage: "bg-orange-100 text-orange-800",
    major_outage: "bg-red-100 text-red-800",
    maintenance: "bg-blue-100 text-blue-800",
  };

  const severityColors: Record<string, string> = {
    minor: "bg-yellow-100 text-yellow-800",
    major: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800",
  };

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [svc, inc, ov] = await Promise.all([
        adminApi.listStatusServices(),
        adminApi.listIncidents(),
        adminApi.statusOverview(),
      ]);
      setServices(svc.items || svc);
      setIncidents(inc.items || inc);
      setOverview(ov);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function saveService() {
    try {
      if (editItem) await adminApi.updateStatusService(editItem.id, form);
      else await adminApi.createStatusService(form);
      setShowModal(false);
      setEditItem(null);
      setForm({ name: "", description: "", status: "operational", url: "", is_visible: true });
      loadAll();
    } catch (e) { console.error(e); }
  }

  async function deleteService(id: number) {
    if (!confirm("Supprimer ce service ?")) return;
    await adminApi.deleteStatusService(id);
    loadAll();
  }

  async function saveIncident() {
    try {
      if (editItem) await adminApi.updateIncident(editItem.id, incidentForm);
      else await adminApi.createIncident(incidentForm);
      setShowIncidentModal(false);
      setEditItem(null);
      setIncidentForm({ title: "", description: "", severity: "minor", status: "investigating", affected_services: [] });
      loadAll();
    } catch (e) { console.error(e); }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Page de statut</h1>
      </div>

      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#1a1a2e] rounded-lg p-4">
            <div className="text-sm text-gray-400">Statut global</div>
            <div className={`mt-1 inline-block px-2 py-1 rounded text-sm font-medium ${statusColors[overview.overall_status] || "bg-gray-700 text-gray-300"}`}>
              {overview.overall_status}
            </div>
          </div>
          <div className="bg-[#1a1a2e] rounded-lg p-4">
            <div className="text-sm text-gray-400">Services</div>
            <div className="text-2xl font-bold text-white">{overview.total_services}</div>
          </div>
          <div className="bg-[#1a1a2e] rounded-lg p-4">
            <div className="text-sm text-gray-400">Opérationnels</div>
            <div className="text-2xl font-bold text-green-400">{overview.services_up}</div>
          </div>
          <div className="bg-[#1a1a2e] rounded-lg p-4">
            <div className="text-sm text-gray-400">Incidents actifs</div>
            <div className="text-2xl font-bold text-red-400">{overview.active_incidents}</div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {(["services", "incidents"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? "bg-purple-600 text-white" : "bg-[#1a1a2e] text-gray-400 hover:text-white"}`}>
            {t === "services" ? "Services" : "Incidents"}
          </button>
        ))}
      </div>

      {tab === "services" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditItem(null); setForm({ name: "", description: "", status: "operational", url: "", is_visible: true }); setShowModal(true); }}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">+ Ajouter un service</button>
          </div>
          <div className="space-y-2">
            {services.map(s => (
              <div key={s.id} className="bg-[#1a1a2e] rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${s.status === "operational" ? "bg-green-500" : s.status === "degraded" ? "bg-yellow-500" : "bg-red-500"}`} />
                  <div>
                    <div className="text-white font-medium">{s.name}</div>
                    <div className="text-sm text-gray-400">{s.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[s.status] || "bg-gray-700 text-gray-300"}`}>{s.status}</span>
                  <button onClick={() => { setEditItem(s); setForm({ name: s.name, description: s.description, status: s.status, url: s.url, is_visible: s.is_visible }); setShowModal(true); }}
                    className="text-blue-400 hover:text-blue-300 text-sm">Modifier</button>
                  <button onClick={() => deleteService(s.id)} className="text-red-400 hover:text-red-300 text-sm">Supprimer</button>
                </div>
              </div>
            ))}
            {services.length === 0 && <div className="text-center text-gray-500 py-8">Aucun service configuré</div>}
          </div>
        </div>
      )}

      {tab === "incidents" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditItem(null); setIncidentForm({ title: "", description: "", severity: "minor", status: "investigating", affected_services: [] }); setShowIncidentModal(true); }}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">+ Nouvel incident</button>
          </div>
          <div className="space-y-2">
            {incidents.map(inc => (
              <div key={inc.id} className="bg-[#1a1a2e] rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">{inc.title}</div>
                    <div className="text-sm text-gray-400 mt-1">{inc.description}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${severityColors[inc.severity] || "bg-gray-700 text-gray-300"}`}>{inc.severity}</span>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-[#2a2a3e] text-gray-300">{inc.status}</span>
                    <button onClick={() => { setEditItem(inc); setIncidentForm({ title: inc.title, description: inc.description, severity: inc.severity, status: inc.status, affected_services: inc.affected_services || [] }); setShowIncidentModal(true); }}
                      className="text-blue-400 hover:text-blue-300 text-sm">Modifier</button>
                  </div>
                </div>
                {inc.messages && inc.messages.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-gray-700 pt-2">
                    {inc.messages.map((m: any, i: number) => (
                      <div key={i} className="text-xs text-gray-400">
                        <span className="font-medium text-gray-300">{m.status}</span> — {m.message} <span className="text-gray-600">{m.created_at}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {incidents.length === 0 && <div className="text-center text-gray-500 py-8">Aucun incident</div>}
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold text-white">{editItem ? "Modifier le service" : "Nouveau service"}</h2>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white" placeholder="Nom" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white" placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <select className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="operational">Opérationnel</option>
              <option value="degraded">Dégradé</option>
              <option value="partial_outage">Panne partielle</option>
              <option value="major_outage">Panne majeure</option>
              <option value="maintenance">Maintenance</option>
            </select>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white" placeholder="URL" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} />
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={form.is_visible} onChange={e => setForm({ ...form, is_visible: e.target.checked })} /> Visible
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 text-sm">Annuler</button>
              <button onClick={saveService} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {showIncidentModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold text-white">{editItem ? "Modifier l'incident" : "Nouvel incident"}</h2>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white" placeholder="Titre" value={incidentForm.title} onChange={e => setIncidentForm({ ...incidentForm, title: e.target.value })} />
            <textarea className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white" rows={3} placeholder="Description" value={incidentForm.description} onChange={e => setIncidentForm({ ...incidentForm, description: e.target.value })} />
            <select className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white" value={incidentForm.severity} onChange={e => setIncidentForm({ ...incidentForm, severity: e.target.value })}>
              <option value="minor">Mineur</option>
              <option value="major">Majeur</option>
              <option value="critical">Critique</option>
            </select>
            <select className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white" value={incidentForm.status} onChange={e => setIncidentForm({ ...incidentForm, status: e.target.value })}>
              <option value="investigating">En investigation</option>
              <option value="identified">Identifié</option>
              <option value="monitoring">Surveillance</option>
              <option value="resolved">Résolu</option>
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowIncidentModal(false)} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 text-sm">Annuler</button>
              <button onClick={saveIncident} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
