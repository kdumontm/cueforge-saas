"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function PricingPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [tab, setTab] = useState<"plans"|"coupons">("plans");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [planForm, setPlanForm] = useState({ name: "", amount: 0, currency: "eur", interval: "month", features: "", trial_days: 0, stripe_price_id: "", highlight: false });
  const [couponForm, setCouponForm] = useState({ code: "", percent_off: 0, amount_off: 0, duration: "once", max_redemptions: 0, expires_at: "" });
  const [toast, setToast] = useState("");

  const load = async () => {
    const p = await adminApi.listPricingPlans(); setPlans(p.items);
    const c = await adminApi.listCoupons(); setCoupons(c.items);
  };
  useEffect(() => { load(); }, []);

  const savePlan = async () => {
    const data = { ...planForm, features: planForm.features.split("\n").filter(Boolean) };
    if (editing) { await adminApi.updatePricingPlan(editing.id, data); }
    else { await adminApi.createPricingPlan(data); }
    setShowForm(false); setEditing(null); load(); setToast("✅ Plan sauvegardé");
  };

  const saveCoupon = async () => {
    const data = { ...couponForm, expires_at: couponForm.expires_at || undefined, percent_off: couponForm.percent_off || undefined, amount_off: couponForm.amount_off || undefined };
    if (editing) { await adminApi.updateCoupon(editing.id, data); }
    else { await adminApi.createCoupon(data); }
    setShowForm(false); setEditing(null); load(); setToast("✅ Coupon sauvegardé");
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">💳 Tarification & Coupons</h1>

      <div className="flex gap-2">
        {(["plans", "coupons"] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setShowForm(false); }} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>
            {t === "plans" ? "Plans tarifaires" : "Coupons"}
          </button>
        ))}
      </div>

      {tab === "plans" && (
        <>
          <button onClick={() => { setEditing(null); setPlanForm({ name: "", amount: 0, currency: "eur", interval: "month", features: "", trial_days: 0, stripe_price_id: "", highlight: false }); setShowForm(true); }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg">+ Nouveau plan</button>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map(p => (
              <div key={p.id} className={`bg-slate-800 rounded-xl p-5 border ${p.highlight ? "border-indigo-500" : "border-slate-700"}`}>
                {p.highlight && <div className="text-xs text-indigo-400 font-medium mb-1">⭐ Recommandé</div>}
                <h3 className="text-lg font-bold text-white">{p.name}</h3>
                <div className="text-3xl font-bold text-white mt-2">{(p.amount / 100).toFixed(2)}€<span className="text-sm text-slate-400">/{p.interval === "year" ? "an" : "mois"}</span></div>
                {p.trial_days > 0 && <div className="text-sm text-cyan-400 mt-1">{p.trial_days} jours d'essai</div>}
                <ul className="mt-3 space-y-1">{(p.features || []).map((f: string, i: number) => <li key={i} className="text-sm text-slate-300">✓ {f}</li>)}</ul>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => { setEditing(p); setPlanForm({ name: p.name, amount: p.amount, currency: p.currency, interval: p.interval, features: (p.features || []).join("\n"), trial_days: p.trial_days, stripe_price_id: p.stripe_price_id || "", highlight: p.highlight }); setShowForm(true); }} className="text-indigo-400 text-xs">Modifier</button>
                  <button onClick={async () => { if (confirm("Supprimer ?")) { await adminApi.deletePricingPlan(p.id); load(); }}} className="text-red-400 text-xs">Supprimer</button>
                </div>
                <div className="mt-2 text-xs text-slate-500">{p.is_active ? "Actif" : "Inactif"} • Stripe: {p.stripe_price_id || "Non lié"}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "coupons" && (
        <>
          <button onClick={() => { setEditing(null); setCouponForm({ code: "", percent_off: 0, amount_off: 0, duration: "once", max_redemptions: 0, expires_at: "" }); setShowForm(true); }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg">+ Nouveau coupon</button>
          <div className="bg-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700 text-slate-400">
                <th className="text-left p-3">Code</th><th className="text-left p-3">Réduction</th><th className="text-left p-3">Durée</th><th className="text-left p-3">Utilisations</th><th className="text-left p-3">Expire</th><th className="p-3">Actions</th>
              </tr></thead>
              <tbody>{coupons.map(c => (
                <tr key={c.id} className="border-b border-slate-700/50">
                  <td className="p-3 text-white font-mono font-bold">{c.code}</td>
                  <td className="p-3 text-green-400">{c.percent_off ? `${c.percent_off}%` : `${(c.amount_off/100).toFixed(2)}€`}</td>
                  <td className="p-3 text-slate-300">{c.duration}</td>
                  <td className="p-3 text-slate-300">{c.times_redeemed}{c.max_redemptions ? `/${c.max_redemptions}` : ""}</td>
                  <td className="p-3 text-slate-400">{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "—"}</td>
                  <td className="p-3 text-right">
                    <button onClick={async () => { if (confirm("Supprimer ?")) { await adminApi.deleteCoupon(c.id); load(); }}} className="text-red-400 text-xs">Supprimer</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 max-w-lg w-full">
            <h3 className="text-lg font-bold text-white mb-4">{tab === "plans" ? (editing ? "Modifier plan" : "Nouveau plan") : (editing ? "Modifier coupon" : "Nouveau coupon")}</h3>
            {tab === "plans" ? (
              <div className="space-y-3">
                <input value={planForm.name} onChange={e => setPlanForm({...planForm, name: e.target.value})} placeholder="Nom du plan" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
                <div className="flex gap-2">
                  <input type="number" value={planForm.amount} onChange={e => setPlanForm({...planForm, amount: Number(e.target.value)})} placeholder="Montant (cents)" className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
                  <select value={planForm.interval} onChange={e => setPlanForm({...planForm, interval: e.target.value})} className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white">
                    <option value="month">Mensuel</option><option value="year">Annuel</option><option value="one_time">Unique</option>
                  </select>
                </div>
                <input value={planForm.stripe_price_id} onChange={e => setPlanForm({...planForm, stripe_price_id: e.target.value})} placeholder="Stripe Price ID (optionnel)" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
                <input type="number" value={planForm.trial_days} onChange={e => setPlanForm({...planForm, trial_days: Number(e.target.value)})} placeholder="Jours d'essai" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
                <textarea value={planForm.features} onChange={e => setPlanForm({...planForm, features: e.target.value})} placeholder="Features (une par ligne)" rows={4} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
                <label className="flex items-center gap-2 text-white"><input type="checkbox" checked={planForm.highlight} onChange={e => setPlanForm({...planForm, highlight: e.target.checked})} /> Mettre en avant</label>
              </div>
            ) : (
              <div className="space-y-3">
                <input value={couponForm.code} onChange={e => setCouponForm({...couponForm, code: e.target.value})} placeholder="Code (ex: SUMMER20)" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white font-mono" />
                <div className="flex gap-2">
                  <input type="number" value={couponForm.percent_off} onChange={e => setCouponForm({...couponForm, percent_off: Number(e.target.value)})} placeholder="% de réduction" className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
                  <input type="number" value={couponForm.amount_off} onChange={e => setCouponForm({...couponForm, amount_off: Number(e.target.value)})} placeholder="Montant fixe (cents)" className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
                </div>
                <select value={couponForm.duration} onChange={e => setCouponForm({...couponForm, duration: e.target.value})} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white">
                  <option value="once">Une fois</option><option value="repeating">Récurrent</option><option value="forever">Permanent</option>
                </select>
                <input type="number" value={couponForm.max_redemptions} onChange={e => setCouponForm({...couponForm, max_redemptions: Number(e.target.value)})} placeholder="Max utilisations (0 = illimité)" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
                <input type="date" value={couponForm.expires_at} onChange={e => setCouponForm({...couponForm, expires_at: e.target.value})} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
              </div>
            )}
            <div className="flex gap-3 mt-4">
              <button onClick={tab === "plans" ? savePlan : saveCoupon} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded">Sauvegarder</button>
              <button onClick={() => setShowForm(false)} className="bg-slate-700 text-white px-4 py-2 rounded">Annuler</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg" onClick={() => setToast("")}>{toast}</div>}
    </div>
  );
}
