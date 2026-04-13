"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function SecurityPage() {
  const [tab, setTab] = useState<"auth"|"oauth"|"rate"|"cors"|"ip"|"sessions"|"captcha"|"2fa">("auth");
  const [authConfig, setAuthConfig] = useState<any>(null);
  const [oauthConfig, setOauthConfig] = useState<any>(null);
  const [rateConfig, setRateConfig] = useState<any>(null);
  const [corsConfig, setCorsConfig] = useState<any>(null);
  const [ipRules, setIpRules] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any>({ items: [] });
  const [captcha, setCaptcha] = useState<any>(null);
  const [twofa, setTwofa] = useState<any>(null);
  const [toast, setToast] = useState("");
  const [newIp, setNewIp] = useState({ ip: "", type: "whitelist", reason: "" });

  const load = async () => {
    try {
      const [a, o, r, c, ip, s, cap, tf] = await Promise.all([
        adminApi.getAuthConfig(), adminApi.getOAuthProviders(),
        adminApi.getRateLimitConfig(), adminApi.getCorsConfig(),
        adminApi.listIpRules(), adminApi.listActiveSessions(),
        adminApi.getCaptchaConfig(), adminApi.get2FAConfig(),
      ]);
      setAuthConfig(a); setOauthConfig(o); setRateConfig(r); setCorsConfig(c);
      setIpRules(ip.items || []); setSessions(s); setCaptcha(cap); setTwofa(tf);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const tabs = [
    { id: "auth", label: "🔐 Auth" }, { id: "oauth", label: "🔑 OAuth" },
    { id: "rate", label: "⏱ Rate Limits" }, { id: "cors", label: "🌐 CORS" },
    { id: "ip", label: "🛡 IP Rules" }, { id: "sessions", label: "📱 Sessions" },
    { id: "captcha", label: "🤖 CAPTCHA" }, { id: "2fa", label: "📲 2FA" },
  ];

  const ConfigEditor = ({ data, onSave, label }: { data: any; onSave: (d: any) => void; label: string }) => {
    const [local, setLocal] = useState(data);
    useEffect(() => { setLocal(data); }, [data]);
    if (!local) return null;
    return (
      <div className="space-y-3">
        {Object.entries(local).map(([k, v]) => (
          <div key={k} className="flex items-center gap-3">
            <label className="text-slate-400 text-sm w-48">{k.replace(/_/g, " ")}</label>
            {typeof v === "boolean" ? (
              <button onClick={() => setLocal({ ...local, [k]: !v })} className={`px-3 py-1 rounded text-sm ${v ? "bg-green-600 text-white" : "bg-slate-700 text-slate-400"}`}>{v ? "Activé" : "Désactivé"}</button>
            ) : typeof v === "number" ? (
              <input type="number" value={v} onChange={e => setLocal({ ...local, [k]: Number(e.target.value) })} className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-white w-32" />
            ) : Array.isArray(v) ? (
              <input value={(v as string[]).join(", ")} onChange={e => setLocal({ ...local, [k]: e.target.value.split(",").map(s => s.trim()) })} className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-white flex-1" />
            ) : (
              <input value={String(v)} onChange={e => setLocal({ ...local, [k]: e.target.value })} className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-white flex-1" />
            )}
          </div>
        ))}
        <button onClick={() => { onSave(local); setToast("✅ " + label + " mis à jour"); }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded mt-3">Sauvegarder</button>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">🔒 Sécurité & Configuration</h1>
      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} className={`px-3 py-1.5 rounded-lg text-sm ${tab === t.id ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>{t.label}</button>
        ))}
      </div>

      <div className="bg-slate-800 rounded-xl p-5">
        {tab === "auth" && authConfig && <ConfigEditor data={authConfig} onSave={d => adminApi.updateAuthConfig(d)} label="Auth config" />}
        {tab === "oauth" && oauthConfig && <ConfigEditor data={oauthConfig} onSave={d => adminApi.updateOAuthProviders(d)} label="OAuth" />}
        {tab === "rate" && rateConfig && <ConfigEditor data={rateConfig} onSave={d => adminApi.updateRateLimitConfig(d)} label="Rate limits" />}
        {tab === "cors" && corsConfig && <ConfigEditor data={corsConfig} onSave={d => adminApi.updateCorsConfig(d)} label="CORS" />}
        {tab === "captcha" && captcha && <ConfigEditor data={captcha} onSave={d => adminApi.updateCaptchaConfig(d)} label="CAPTCHA" />}
        {tab === "2fa" && twofa && <ConfigEditor data={twofa} onSave={d => adminApi.update2FAConfig(d)} label="2FA" />}

        {tab === "ip" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input value={newIp.ip} onChange={e => setNewIp({...newIp, ip: e.target.value})} placeholder="IP ou CIDR" className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white flex-1" />
              <select value={newIp.type} onChange={e => setNewIp({...newIp, type: e.target.value})} className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white">
                <option value="whitelist">Whitelist</option><option value="blacklist">Blacklist</option>
              </select>
              <input value={newIp.reason} onChange={e => setNewIp({...newIp, reason: e.target.value})} placeholder="Raison" className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white flex-1" />
              <button onClick={async () => { await adminApi.createIpRule(newIp); load(); setNewIp({ ip: "", type: "whitelist", reason: "" }); }} className="bg-indigo-600 text-white px-4 py-2 rounded">Ajouter</button>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-slate-400 border-b border-slate-700"><th className="text-left p-2">IP</th><th className="text-left p-2">Type</th><th className="text-left p-2">Raison</th><th className="p-2"></th></tr></thead>
              <tbody>{ipRules.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-700/50">
                  <td className="p-2 text-white font-mono">{r.ip}</td>
                  <td className="p-2"><span className={`px-2 py-0.5 rounded text-xs ${r.type === "whitelist" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>{r.type}</span></td>
                  <td className="p-2 text-slate-400">{r.reason}</td>
                  <td className="p-2 text-right"><button onClick={async () => { await adminApi.deleteIpRule(r.id); load(); }} className="text-red-400 text-xs">Supprimer</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {tab === "sessions" && (
          <div>
            <table className="w-full text-sm">
              <thead><tr className="text-slate-400 border-b border-slate-700"><th className="text-left p-2">Utilisateur</th><th className="text-left p-2">IP</th><th className="text-left p-2">User Agent</th><th className="text-left p-2">Dernière activité</th><th className="p-2"></th></tr></thead>
              <tbody>{(sessions.items || []).map((s: any) => (
                <tr key={s.id} className="border-b border-slate-700/50">
                  <td className="p-2 text-white">{s.user_email || s.user_id}</td>
                  <td className="p-2 text-slate-300 font-mono text-xs">{s.ip}</td>
                  <td className="p-2 text-slate-400 text-xs truncate max-w-[200px]">{s.user_agent}</td>
                  <td className="p-2 text-slate-400 text-xs">{s.last_active}</td>
                  <td className="p-2 text-right"><button onClick={async () => { await adminApi.forceLogoutSession(s.id); load(); setToast("Session terminée"); }} className="text-red-400 text-xs">Déconnecter</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      {toast && <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg" onClick={() => setToast("")}>{toast}</div>}
    </div>
  );
}
