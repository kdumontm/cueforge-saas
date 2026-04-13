"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

interface SMSTemplate { id: number; name: string; body: string; variables: string[]; category: string; is_active: boolean; sent_count: number; created_at: string; }

export default function SMSTemplatesAdmin() {
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<SMSTemplate | null>(null);
  const [form, setForm] = useState({ name: "", body: "", variables: "", category: "general" });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { const d = await adminApi.getSMSTemplates(); setTemplates(d.items || []); } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function save() {
    const data = { ...form, variables: form.variables.split(",").map(v => v.trim()).filter(Boolean) };
    if (editItem) await adminApi.updateSMSTemplate(editItem.id, data);
    else await adminApi.createSMSTemplate(data);
    setShowModal(false); setEditItem(null);
    setForm({ name: "", body: "", variables: "", category: "general" });
    load();
  }

  async function del(id: number) { if (!confirm("Supprimer ?")) return; await adminApi.deleteSMSTemplate(id); load(); }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Templates SMS</h1>
        <button onClick={() => { setEditItem(null); setForm({ name: "", body: "", variables: "", category: "general" }); setShowModal(true); }}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">+ Nouveau template</button>
      </div>
      <div className="space-y-2">
        {templates.map(t => (
          <div key={t.id} className="bg-[#1a1a2e] rounded-lg p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-medium">{t.name}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${t.is_active ? "bg-green-900/50 text-green-400" : "bg-gray-700 text-gray-400"}`}>{t.is_active ? "Actif" : "Inactif"}</span>
                <span className="px-2 py-0.5 rounded text-xs bg-[#0a0a1a] text-gray-400">{t.category}</span>
              </div>
              <div className="text-sm text-gray-400 mt-1 font-mono">{t.body?.substring(0, 100)}{t.body?.length > 100 ? "..." : ""}</div>
              {t.variables?.length > 0 && <div className="text-xs text-gray-500 mt-1">Variables: {t.variables.join(", ")}</div>}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">{t.sent_count} envois</span>
              <button onClick={() => { setEditItem(t); setForm({ name: t.name, body: t.body, variables: (t.variables || []).join(", "), category: t.category }); setShowModal(true); }} className="text-blue-400 hover:text-blue-300">Modifier</button>
              <button onClick={() => del(t.id)} className="text-red-400 hover:text-red-300">Supprimer</button>
            </div>
          </div>
        ))}
        {templates.length === 0 && <div className="text-center text-gray-500 py-8">Aucun template SMS</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold text-white">{editItem ? "Modifier" : "Nouveau"} template SMS</h2>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" placeholder="Nom" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <textarea className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono" rows={4} placeholder="Bonjour {{name}}, votre code est {{code}}" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
            <div className="text-xs text-gray-500">{form.body.length}/160 caractères</div>
            <input className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" placeholder="Variables (séparées par virgules): name, code" value={form.variables} onChange={e => setForm({ ...form, variables: e.target.value })} />
            <select className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              <option value="general">Général</option><option value="auth">Authentification</option><option value="marketing">Marketing</option><option value="transactional">Transactionnel</option>
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm">Annuler</button>
              <button onClick={save} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
