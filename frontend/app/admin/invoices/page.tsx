"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [toast, setToast] = useState("");

  const load = async () => {
    const [i, s] = await Promise.all([
      adminApi.listInvoices({ status: statusFilter || undefined }),
      adminApi.invoiceStats(),
    ]);
    setInvoices(i.items); setTotal(i.total); setStats(s);
  };
  useEffect(() => { load(); }, [statusFilter]);

  const fmt = (c: number) => (c / 100).toFixed(2) + "€";

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">🧾 Factures</h1>
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[["Revenue total", fmt(stats.total_revenue_cents)], ["Remboursé", fmt(stats.total_refunded_cents)], ["Net", fmt(stats.net_revenue_cents)], ["Factures", stats.total_invoices]].map(([l, v]) => (
            <div key={String(l)} className="bg-slate-800 rounded-lg p-4"><div className="text-sm text-slate-400">{l}</div><div className="text-xl font-bold text-white">{v}</div></div>
          ))}
        </div>
      )}
      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white">
        <option value="">Tous statuts</option>
        {["draft", "open", "paid", "void", "uncollectible"].map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-700 text-slate-400">
            <th className="text-left p-3">ID</th><th className="text-left p-3">Utilisateur</th><th className="text-left p-3">Montant</th><th className="text-left p-3">Statut</th><th className="text-left p-3">Date</th><th className="p-3">Actions</th>
          </tr></thead>
          <tbody>{invoices.map(i => (
            <tr key={i.id} className="border-b border-slate-700/50">
              <td className="p-3 text-white">#{i.id}</td>
              <td className="p-3 text-slate-300">{i.user_id}</td>
              <td className="p-3 text-white font-medium">{fmt(i.amount)}</td>
              <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${i.status === "paid" ? "bg-green-500/20 text-green-400" : "bg-slate-700 text-slate-400"}`}>{i.status}</span></td>
              <td className="p-3 text-slate-400 text-xs">{i.created_at && new Date(i.created_at).toLocaleDateString()}</td>
              <td className="p-3 text-right">
                {i.status === "paid" && <button onClick={async () => { if (confirm("Rembourser ?")) { await adminApi.refundInvoice(i.id); load(); setToast("✅ Remboursé"); }}} className="text-orange-400 text-xs">Rembourser</button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {toast && <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg" onClick={() => setToast("")}>{toast}</div>}
    </div>
  );
}
