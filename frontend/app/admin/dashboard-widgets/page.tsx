"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

interface Widget {
  id: number;
  widget_type: string;
  title: string;
  config: any;
  position: { x: number; y: number; w: number; h: number };
  is_visible: boolean;
  refresh_interval: number;
}

export default function DashboardWidgetsAdmin() {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [widgetTypes, setWidgetTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ widget_type: "stats_card", title: "", config: {}, refresh_interval: 300 });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [w, t] = await Promise.all([adminApi.getDashboardWidgets(), adminApi.getWidgetTypes()]);
      setWidgets(w.items || []);
      setWidgetTypes(Array.isArray(t) ? t : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function addWidget() {
    try {
      await adminApi.createDashboardWidget(form);
      setShowModal(false);
      setForm({ widget_type: "stats_card", title: "", config: {}, refresh_interval: 300 });
      loadAll();
    } catch (e) { console.error(e); }
  }

  async function removeWidget(id: number) {
    if (!confirm("Supprimer ce widget ?")) return;
    await adminApi.deleteDashboardWidget(id);
    loadAll();
  }

  async function toggleVisibility(w: Widget) {
    await adminApi.updateDashboardWidget(w.id, { is_visible: !w.is_visible });
    loadAll();
  }

  async function resetLayout() {
    if (!confirm("Réinitialiser le layout par défaut ?")) return;
    await adminApi.resetDashboardLayout();
    loadAll();
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Widgets du Dashboard</h1>
        <div className="flex gap-2">
          <button onClick={resetLayout} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 text-sm">Réinitialiser</button>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">+ Ajouter</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {widgets.map(w => (
          <div key={w.id} className={`bg-[#1a1a2e] rounded-xl p-4 border ${w.is_visible ? "border-purple-600/30" : "border-gray-700 opacity-60"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-white font-medium">{w.title || w.widget_type}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleVisibility(w)} className={`text-xs px-2 py-0.5 rounded ${w.is_visible ? "bg-green-900/50 text-green-400" : "bg-gray-700 text-gray-400"}`}>
                  {w.is_visible ? "Visible" : "Masqué"}
                </button>
                <button onClick={() => removeWidget(w.id)} className="text-red-400 hover:text-red-300 text-xs">Supprimer</button>
              </div>
            </div>
            <div className="text-sm text-gray-400">Type: <span className="text-gray-300">{w.widget_type}</span></div>
            <div className="text-xs text-gray-500 mt-1">Position: {w.position?.x},{w.position?.y} — Taille: {w.position?.w}x{w.position?.h}</div>
            <div className="text-xs text-gray-500">Rafraîchissement: {w.refresh_interval}s</div>
          </div>
        ))}
        {widgets.length === 0 && <div className="col-span-full text-center text-gray-500 py-8">Aucun widget. Cliquez Réinitialiser pour charger le layout par défaut.</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold text-white">Ajouter un widget</h2>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Type</label>
              <select className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                value={form.widget_type} onChange={e => setForm({ ...form, widget_type: e.target.value })}>
                {widgetTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                {widgetTypes.length === 0 && <>
                  <option value="stats_card">Carte statistique</option>
                  <option value="chart">Graphique</option>
                  <option value="table">Tableau</option>
                  <option value="activity_feed">Flux d&apos;activité</option>
                </>}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Titre</label>
              <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Mon widget" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Intervalle de rafraîchissement (s)</label>
              <input type="number" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                value={form.refresh_interval} onChange={e => setForm({ ...form, refresh_interval: parseInt(e.target.value) || 60 })} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm">Annuler</button>
              <button onClick={addWidget} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">Ajouter</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
