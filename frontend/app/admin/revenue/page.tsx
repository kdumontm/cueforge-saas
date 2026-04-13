"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function RevenuePage() {
  const [overview, setOverview] = useState<any>(null);
  const [mrrData, setMrrData] = useState<any[]>([]);
  const [trial, setTrial] = useState<any>(null);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [invoiceStats, setInvoiceStats] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const [o, m, t, b, i] = await Promise.all([
        adminApi.revenueOverview(), adminApi.mrrHistory(12),
        adminApi.trialConversion(), adminApi.revenueBreakdown(),
        adminApi.invoiceStats(),
      ]);
      setOverview(o); setMrrData(m.data); setTrial(t); setBreakdown(b); setInvoiceStats(i);
    })();
  }, []);

  const fmt = (cents: number) => (cents / 100).toFixed(2) + "€";

  if (!overview) return <div className="p-6 text-slate-400">Chargement...</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">📊 Revenue Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          ["MRR", fmt(overview.mrr_cents), "text-green-400"],
          ["ARR", fmt(overview.arr_cents), "text-green-400"],
          ["Abonnés actifs", overview.active_subscriptions, "text-cyan-400"],
          ["Churn rate", overview.churn_rate + "%", overview.churn_rate > 5 ? "text-red-400" : "text-green-400"],
          ["ARPU", fmt(overview.arpu_cents), "text-indigo-400"],
          ["LTV", fmt(overview.ltv_cents), "text-indigo-400"],
          ["Annulés ce mois", overview.canceled_this_month, "text-orange-400"],
          ["Revenue net", invoiceStats ? fmt(invoiceStats.net_revenue_cents) : "—", "text-green-400"],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="bg-slate-800 rounded-lg p-4">
            <div className="text-sm text-slate-400">{label}</div>
            <div className={`text-xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* MRR History Chart (text-based) */}
      <div className="bg-slate-800 rounded-xl p-5">
        <h2 className="text-lg font-bold text-white mb-3">📈 Historique MRR</h2>
        <div className="space-y-2">
          {mrrData.map(d => {
            const maxMrr = Math.max(...mrrData.map(x => x.mrr_cents), 1);
            const pct = (d.mrr_cents / maxMrr) * 100;
            return (
              <div key={d.month} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-16">{d.month}</span>
                <div className="flex-1 bg-slate-700 rounded-full h-5 overflow-hidden">
                  <div className="bg-indigo-500 h-full rounded-full transition-all" style={{ width: pct + "%" }} />
                </div>
                <span className="text-xs text-white w-20 text-right">{fmt(d.mrr_cents)}</span>
                <span className="text-xs text-slate-500 w-12 text-right">{d.subscribers} abo</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Revenue by plan */}
        <div className="bg-slate-800 rounded-xl p-5">
          <h2 className="text-lg font-bold text-white mb-3">Revenue par plan</h2>
          {Object.entries(overview.by_plan || {}).map(([plan, data]: [string, any]) => (
            <div key={plan} className="flex justify-between items-center py-2 border-b border-slate-700/50">
              <span className="text-white font-medium">{plan}</span>
              <span className="text-slate-300">{data.count} abonnés • {fmt(data.mrr)} MRR</span>
            </div>
          ))}
          {Object.keys(overview.by_plan || {}).length === 0 && <p className="text-slate-500">Aucune donnée</p>}
        </div>

        {/* Trial conversion */}
        {trial && (
          <div className="bg-slate-800 rounded-xl p-5">
            <h2 className="text-lg font-bold text-white mb-3">🔄 Conversion essais</h2>
            <div className="space-y-3">
              {[
                ["Total essais", trial.total_trials],
                ["Convertis", trial.converted],
                ["En cours", trial.still_trialing],
                ["Annulés pendant essai", trial.canceled_during_trial],
                ["Taux conversion", trial.conversion_rate + "%"],
              ].map(([l, v]) => (
                <div key={String(l)} className="flex justify-between"><span className="text-slate-400">{l}</span><span className="text-white font-medium">{v}</span></div>
              ))}
            </div>
          </div>
        )}

        {/* MRR Breakdown */}
        {breakdown && (
          <div className="bg-slate-800 rounded-xl p-5">
            <h2 className="text-lg font-bold text-white mb-3">💰 Décomposition MRR ce mois</h2>
            <div className="space-y-3">
              {[
                ["Nouveau MRR", fmt(breakdown.new_mrr_cents), "text-green-400"],
                ["Expansion", fmt(breakdown.expansion_mrr_cents), "text-cyan-400"],
                ["Contraction", fmt(breakdown.contraction_mrr_cents), "text-orange-400"],
                ["Churned", fmt(breakdown.churned_mrr_cents), "text-red-400"],
                ["Net New MRR", fmt(breakdown.net_new_mrr_cents), breakdown.net_new_mrr_cents >= 0 ? "text-green-400" : "text-red-400"],
              ].map(([l, v, c]) => (
                <div key={String(l)} className="flex justify-between"><span className="text-slate-400">{l}</span><span className={`font-medium ${c}`}>{v}</span></div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
