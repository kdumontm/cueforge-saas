"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function GamificationPage() {
  const [tab, setTab] = useState<"badges"|"points"|"streaks"|"leaderboard">("badges");
  const [badges, setBadges] = useState<any[]>([]);
  const [pointsCfg, setPointsCfg] = useState<any>({});
  const [streakCfg, setStreakCfg] = useState<any>({});
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", icon_url: "", criteria_type: "tracks_uploaded", criteria_value: 1, xp_reward: 10 });
  const [toast, setToast] = useState("");

  const load = async () => {
    const [b, p, s, l] = await Promise.all([
      adminApi.listBadges(), adminApi.getPointsConfig(),
      adminApi.getStreakConfig(), adminApi.getLeaderboard(),
    ]);
    setBadges(b.items); setPointsCfg(p); setStreakCfg(s); setLeaderboard(l.items);
  };
  useEffect(() => { load(); }, []);

  const saveBadge = async () => {
    await adminApi.createBadge(form);
    setShowCreate(false); load(); setToast("✅ Badge créé");
  };

  const criteriaTypes = ["tracks_uploaded", "cuepoints_created", "playlists_shared", "streak_days", "custom"];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">🏆 Gamification</h1>
      <div className="flex gap-2">
        {(["badges", "points", "streaks", "leaderboard"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm ${tab === t ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}>
            {t === "badges" ? "🎖 Badges" : t === "points" ? "⭐ Points" : t === "streaks" ? "🔥 Streaks" : "🏅 Classement"}
          </button>
        ))}
      </div>

      {tab === "badges" && (
        <>
          <button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg">+ Nouveau badge</button>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {badges.map(b => (
              <div key={b.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{b.icon_url || "🎖"}</div>
                  <div>
                    <h3 className="text-white font-bold">{b.name}</h3>
                    <p className="text-sm text-slate-400">{b.description}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-4 text-xs text-slate-400">
                  <span>Critère: {b.criteria_type} ≥ {b.criteria_value}</span>
                  <span>+{b.xp_reward} XP</span>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={async () => { if (confirm("Supprimer ?")) { await adminApi.deleteBadge(b.id); load(); }}} className="text-red-400 text-xs">Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "points" && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h2 className="text-lg font-bold text-white mb-4">Configuration des points</h2>
          <div className="space-y-3">
            {Object.entries(pointsCfg).map(([action, pts]) => (
              <div key={action} className="flex items-center gap-3">
                <label className="text-slate-300 w-48">{action.replace(/_/g, " ")}</label>
                <input type="number" value={pts as number} onChange={e => setPointsCfg({...pointsCfg, [action]: Number(e.target.value)})} className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-white w-24" />
                <span className="text-slate-500 text-sm">pts</span>
              </div>
            ))}
          </div>
          <button onClick={async () => { await adminApi.updatePointsConfig(pointsCfg); setToast("✅ Points mis à jour"); }} className="bg-indigo-600 text-white px-4 py-2 rounded mt-4">Sauvegarder</button>
        </div>
      )}

      {tab === "streaks" && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h2 className="text-lg font-bold text-white mb-4">Configuration des streaks</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3"><label className="text-slate-300 w-48">Action requise</label><input value={streakCfg.required_action || ""} onChange={e => setStreakCfg({...streakCfg, required_action: e.target.value})} className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-white" /></div>
            <div className="flex items-center gap-3"><label className="text-slate-300 w-48">Reset après (heures)</label><input type="number" value={streakCfg.reset_hours || 48} onChange={e => setStreakCfg({...streakCfg, reset_hours: Number(e.target.value)})} className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-white w-24" /></div>
            <div className="flex items-center gap-3"><label className="text-slate-300 w-48">Milestones (jours)</label><input value={(streakCfg.milestones || []).join(", ")} onChange={e => setStreakCfg({...streakCfg, milestones: e.target.value.split(",").map(Number)})} className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-white flex-1" /></div>
          </div>
          <button onClick={async () => { await adminApi.updateStreakConfig(streakCfg); setToast("✅ Streaks mis à jour"); }} className="bg-indigo-600 text-white px-4 py-2 rounded mt-4">Sauvegarder</button>
        </div>
      )}

      {tab === "leaderboard" && (
        <div className="bg-slate-800 rounded-xl p-5">
          <h2 className="text-lg font-bold text-white mb-4">Top utilisateurs</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-slate-400 border-b border-slate-700"><th className="text-left p-2">#</th><th className="text-left p-2">DJ</th><th className="text-left p-2">Email</th><th className="text-right p-2">Badges</th></tr></thead>
            <tbody>{leaderboard.map((u, i) => (
              <tr key={u.user_id} className="border-b border-slate-700/50">
                <td className="p-2 text-white font-bold">{i + 1}</td>
                <td className="p-2 text-white">{u.dj_name || "—"}</td>
                <td className="p-2 text-slate-300">{u.email}</td>
                <td className="p-2 text-right text-yellow-400 font-bold">{u.badge_count}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 max-w-lg w-full">
            <h3 className="text-lg font-bold text-white mb-4">Nouveau badge</h3>
            <div className="space-y-3">
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Nom" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
              <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
              <input value={form.icon_url} onChange={e => setForm({...form, icon_url: e.target.value})} placeholder="Emoji ou URL icône" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
              <select value={form.criteria_type} onChange={e => setForm({...form, criteria_type: e.target.value})} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white">
                {criteriaTypes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex gap-2">
                <input type="number" value={form.criteria_value} onChange={e => setForm({...form, criteria_value: Number(e.target.value)})} placeholder="Valeur critère" className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
                <input type="number" value={form.xp_reward} onChange={e => setForm({...form, xp_reward: Number(e.target.value)})} placeholder="XP reward" className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={saveBadge} className="bg-indigo-600 text-white px-4 py-2 rounded">Créer</button>
              <button onClick={() => setShowCreate(false)} className="bg-slate-700 text-white px-4 py-2 rounded">Annuler</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg" onClick={() => setToast("")}>{toast}</div>}
    </div>
  );
}
