"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function ImportDJPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [source, setSource] = useState("rekordbox");
  const [toast, setToast] = useState("");

  const load = async () => {
    try { const h = await adminApi.listImportHistory(); setHistory(h.items || []); } catch {}
  };
  useEffect(() => { load(); }, []);

  const sources = [
    { id: "rekordbox", label: "Rekordbox", icon: "🔴", ext: ".xml" },
    { id: "serato", label: "Serato", icon: "🟢", ext: ".crate" },
    { id: "traktor", label: "Traktor", icon: "⚪", ext: ".nml" },
    { id: "virtualdj", label: "VirtualDJ", icon: "🔵", ext: ".xml" },
  ];

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      await adminApi.importDJ(source, fd);
      setToast("✅ Import lancé"); load();
    } catch (err: any) { setToast("❌ " + err.message); }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">🎵 Import logiciels DJ</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {sources.map(s => (
          <button key={s.id} onClick={() => setSource(s.id)} className={`p-4 rounded-xl border text-center ${source === s.id ? "border-indigo-500 bg-indigo-500/10" : "border-slate-700 bg-slate-800 hover:border-slate-600"}`}>
            <div className="text-3xl mb-2">{s.icon}</div>
            <div className="text-white font-medium">{s.label}</div>
            <div className="text-xs text-slate-400">{s.ext}</div>
          </button>
        ))}
      </div>
      <div className="bg-slate-800 rounded-xl p-5">
        <h2 className="text-lg font-bold text-white mb-3">Importer depuis {sources.find(s => s.id === source)?.label}</h2>
        <input type="file" onChange={handleImport} className="text-white" accept={sources.find(s => s.id === source)?.ext} />
      </div>

      <div className="bg-slate-800 rounded-xl p-5">
        <h2 className="text-lg font-bold text-white mb-3">Historique des imports</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-slate-400 border-b border-slate-700"><th className="text-left p-2">Source</th><th className="text-left p-2">Tracks</th><th className="text-left p-2">Importés</th><th className="text-left p-2">Échoués</th><th className="text-left p-2">Statut</th><th className="text-left p-2">Date</th></tr></thead>
          <tbody>{history.map((h: any) => (
            <tr key={h.id} className="border-b border-slate-700/50">
              <td className="p-2 text-white">{h.source}</td>
              <td className="p-2 text-slate-300">{h.total_tracks}</td>
              <td className="p-2 text-green-400">{h.imported}</td>
              <td className="p-2 text-red-400">{h.failed}</td>
              <td className="p-2"><span className={h.status === "completed" ? "text-green-400" : "text-orange-400"}>{h.status}</span></td>
              <td className="p-2 text-slate-400 text-xs">{h.created_at}</td>
            </tr>
          ))}</tbody>
        </table>
        {history.length === 0 && <p className="text-center text-slate-500 py-4">Aucun import</p>}
      </div>
      {toast && <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg" onClick={() => setToast("")}>{toast}</div>}
    </div>
  );
}
