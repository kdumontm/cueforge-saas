"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function BackupsPage() {
  const [backups, setBackups] = useState<any[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [toast, setToast] = useState("");

  const load = async () => {
    const [b, c] = await Promise.all([adminApi.listBackups(), adminApi.getBackupConfig()]);
    setBackups(b.items || []); setConfig(c);
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">💾 Sauvegardes</h1>
        <button onClick={async () => { await adminApi.createBackup(); load(); setToast("✅ Backup lancé"); }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg">+ Backup manuel</button>
      </div>

      {config && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h2 className="text-lg font-bold text-white mb-3">Configuration</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3"><label className="text-slate-400 w-40">Auto-backup</label>
              <button onClick={() => setConfig({...config, auto_enabled: !config.auto_enabled})} className={`px-3 py-1 rounded text-sm ${config.auto_enabled ? "bg-green-600 text-white" : "bg-slate-700 text-slate-400"}`}>{config.auto_enabled ? "Activé" : "Désactivé"}</button>
            </div>
            <div className="flex items-center gap-3"><label className="text-slate-400 w-40">Fréquence</label><input value={config.frequency || "daily"} onChange={e => setConfig({...config, frequency: e.target.value})} className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-white" /></div>
            <div className="flex items-center gap-3"><label className="text-slate-400 w-40">Rétention (jours)</label><input type="number" value={config.retention_days || 30} onChange={e => setConfig({...config, retention_days: Number(e.target.value)})} className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-white w-24" /></div>
            <button onClick={async () => { await adminApi.updateBackupConfig(config); setToast("✅ Config sauvegardée"); }} className="bg-indigo-600 text-white px-4 py-2 rounded">Sauvegarder</button>
          </div>
        </div>
      )}

      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-700 text-slate-400">
            <th className="text-left p-3">ID</th><th className="text-left p-3">Type</th><th className="text-left p-3">Taille</th><th className="text-left p-3">Statut</th><th className="text-left p-3">Date</th>
          </tr></thead>
          <tbody>{backups.map(b => (
            <tr key={b.id} className="border-b border-slate-700/50">
              <td className="p-3 text-white">#{b.id}</td>
              <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${b.type === "auto" ? "bg-cyan-500/20 text-cyan-400" : "bg-indigo-500/20 text-indigo-400"}`}>{b.type}</span></td>
              <td className="p-3 text-slate-300">{b.size ? (b.size / 1024 / 1024).toFixed(1) + " MB" : "—"}</td>
              <td className="p-3"><span className={b.status === "completed" ? "text-green-400" : "text-orange-400"}>{b.status}</span></td>
              <td className="p-3 text-slate-400 text-xs">{b.created_at}</td>
            </tr>
          ))}</tbody>
        </table>
        {backups.length === 0 && <p className="text-center text-slate-500 py-8">Aucune sauvegarde</p>}
      </div>
      {toast && <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg" onClick={() => setToast("")}>{toast}</div>}
    </div>
  );
}
