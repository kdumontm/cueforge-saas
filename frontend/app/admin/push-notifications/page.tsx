"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

interface PushNotif {
  id: number; title: string; body: string; icon_url: string; action_url: string;
  target_type: string; channel: string; status: string;
  scheduled_at: string | null; sent_at: string | null;
  total_sent: number; total_delivered: number; total_clicked: number;
  created_at: string;
}

export default function PushNotificationsAdmin() {
  const [tab, setTab] = useState<"list" | "config">("list");
  const [notifs, setNotifs] = useState<PushNotif[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [config, setConfig] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", icon_url: "", action_url: "", target_type: "all", channel: "push" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [n, s, c] = await Promise.all([
        adminApi.getPushNotifications(), adminApi.getPushStats().catch(() => null), adminApi.getPushConfig().catch(() => ({})),
      ]);
      setNotifs(n.items || []);
      if (s) setStats(s);
      setConfig(c || {});
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function createNotif() {
    await adminApi.createPushNotification(form);
    setShowModal(false);
    setForm({ title: "", body: "", icon_url: "", action_url: "", target_type: "all", channel: "push" });
    loadAll();
  }

  async function sendNotif(id: number) {
    if (!confirm("Envoyer cette notification ?")) return;
    await adminApi.sendPushNotification(id);
    loadAll();
  }

  async function deleteNotif(id: number) {
    if (!confirm("Supprimer ?")) return;
    await adminApi.deletePushNotification(id);
    loadAll();
  }

  async function saveConfig() {
    setSaving(true);
    try { await adminApi.updatePushConfig(config); } catch (e) { console.error(e); }
    setSaving(false);
  }

  const statusColors: Record<string, string> = { draft: "bg-gray-700 text-gray-300", scheduled: "bg-blue-900/50 text-blue-400", sent: "bg-green-900/50 text-green-400", cancelled: "bg-red-900/50 text-red-400" };

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Notifications Push</h1>
        <div className="flex gap-2">
          {(["list", "config"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? "bg-purple-600 text-white" : "bg-[#1a1a2e] text-gray-400"}`}>
              {t === "list" ? "Notifications" : "Configuration"}
            </button>
          ))}
        </div>
      </div>

      {tab === "list" && (
        <>
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-[#1a1a2e] rounded-lg p-4"><div className="text-sm text-gray-400">Total</div><div className="text-2xl font-bold text-white">{stats.total}</div></div>
              <div className="bg-[#1a1a2e] rounded-lg p-4"><div className="text-sm text-gray-400">Envoyées</div><div className="text-2xl font-bold text-green-400">{stats.sent}</div></div>
              <div className="bg-[#1a1a2e] rounded-lg p-4"><div className="text-sm text-gray-400">Délivrées</div><div className="text-2xl font-bold text-blue-400">{stats.total_delivered}</div></div>
              <div className="bg-[#1a1a2e] rounded-lg p-4"><div className="text-sm text-gray-400">CTR</div><div className="text-2xl font-bold text-purple-400">{stats.ctr}%</div></div>
            </div>
          )}
          <div className="flex justify-end">
            <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">+ Nouvelle notification</button>
          </div>
          <div className="space-y-2">
            {notifs.map(n => (
              <div key={n.id} className="bg-[#1a1a2e] rounded-lg p-4 flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">{n.title}</div>
                  <div className="text-sm text-gray-400 mt-0.5">{n.body?.substring(0, 80)}{n.body?.length > 80 ? "..." : ""}</div>
                  <div className="text-xs text-gray-500 mt-1">Canal: {n.channel} — Cible: {n.target_type}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[n.status] || "bg-gray-700 text-gray-300"}`}>{n.status}</span>
                  {n.status === "draft" && <button onClick={() => sendNotif(n.id)} className="text-green-400 hover:text-green-300 text-sm">Envoyer</button>}
                  <button onClick={() => deleteNotif(n.id)} className="text-red-400 hover:text-red-300 text-sm">Supprimer</button>
                </div>
              </div>
            ))}
            {notifs.length === 0 && <div className="text-center text-gray-500 py-8">Aucune notification</div>}
          </div>
        </>
      )}

      {tab === "config" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Firebase (Push)</h2>
            <label className="flex items-center gap-2"><input type="checkbox" checked={config.firebase_enabled || false} onChange={e => setConfig({ ...config, firebase_enabled: e.target.checked })} /><span className="text-sm text-gray-300">Firebase activé</span></label>
            <div><label className="block text-sm text-gray-400 mb-1">Server Key</label><input type="password" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" value={config.firebase_server_key || ""} onChange={e => setConfig({ ...config, firebase_server_key: e.target.value })} /></div>
            <div><label className="block text-sm text-gray-400 mb-1">Project ID</label><input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" value={config.firebase_project_id || ""} onChange={e => setConfig({ ...config, firebase_project_id: e.target.value })} /></div>
          </div>
          <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">SMS (Twilio)</h2>
            <label className="flex items-center gap-2"><input type="checkbox" checked={config.sms_enabled || false} onChange={e => setConfig({ ...config, sms_enabled: e.target.checked })} /><span className="text-sm text-gray-300">SMS activé</span></label>
            <div><label className="block text-sm text-gray-400 mb-1">Twilio SID</label><input type="password" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" value={config.twilio_sid || ""} onChange={e => setConfig({ ...config, twilio_sid: e.target.value })} /></div>
            <div><label className="block text-sm text-gray-400 mb-1">Auth Token</label><input type="password" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" value={config.twilio_auth_token || ""} onChange={e => setConfig({ ...config, twilio_auth_token: e.target.value })} /></div>
            <div><label className="block text-sm text-gray-400 mb-1">Numéro expéditeur</label><input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" value={config.twilio_from_number || ""} onChange={e => setConfig({ ...config, twilio_from_number: e.target.value })} placeholder="+33..." /></div>
          </div>
          <div className="col-span-full flex justify-end">
            <button onClick={saveConfig} disabled={saving} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50">{saving ? "Enregistrement..." : "Enregistrer"}</button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold text-white">Nouvelle notification</h2>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" placeholder="Titre" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <textarea className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" rows={3} placeholder="Message" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" placeholder="URL d'action" value={form.action_url} onChange={e => setForm({ ...form, action_url: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <select className="bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" value={form.target_type} onChange={e => setForm({ ...form, target_type: e.target.value })}>
                <option value="all">Tous</option><option value="segment">Segment</option><option value="user">Utilisateur</option>
              </select>
              <select className="bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}>
                <option value="push">Push</option><option value="sms">SMS</option><option value="both">Les deux</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm">Annuler</button>
              <button onClick={createNotif} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">Créer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
