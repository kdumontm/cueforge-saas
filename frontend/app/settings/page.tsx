// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User, Lock, CreditCard, Disc3, Keyboard, ArrowLeft, Save, ChevronRight, Music2, Download, Zap, Palette, Bell } from "lucide-react";
import { getMyProfile, updateMyProfile, updateUserSettings, UserProfile } from "@/lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [activeTab, setActiveTab] = useState("profile");

  // Form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // DJ Preferences (stored locally)
  const [djPrefs, setDjPrefs] = useState({
    defaultExport: 'rekordbox',
    autoAnalyze: true,
    analysisQuality: 'high',
    defaultCueTemplate: 'auto',
    showCamelotKeys: true,
    showEnergyBars: true,
    waveformStyle: 'gradient',
    theme: 'dark',
  });

  useEffect(() => {
    const token = localStorage.getItem("cueforge_token");
    if (!token) {
      router.push("/login");
      return;
    }
    loadProfile();
    // Load DJ prefs from localStorage
    const savedPrefs = localStorage.getItem("cueforge_dj_prefs");
    if (savedPrefs) {
      try { setDjPrefs(JSON.parse(savedPrefs)); } catch {}
    }
  }, []);

  function saveDjPrefs(newPrefs: typeof djPrefs) {
    setDjPrefs(newPrefs);
    localStorage.setItem("cueforge_dj_prefs", JSON.stringify(newPrefs));
    showMessage("success", "Préférences sauvegardées !");
  }

  function showMessage(type: string, text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 3000);
  }

  async function loadProfile() {
    try {
      const data = await getMyProfile();
      setProfile(data);
      setName(data.name || "");
      setEmail(data.email);
    } catch {
      showMessage("error", "Impossible de charger le profil");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updateData: any = {};
      if (name !== (profile?.name || "")) updateData.name = name;
      if (email !== profile?.email) updateData.email = email;
      if (Object.keys(updateData).length === 0) {
        showMessage("info", "Aucune modification");
        setSaving(false);
        return;
      }
      const updated = await updateMyProfile(updateData);
      setProfile(updated);
      showMessage("success", "Profil mis à jour !");
    } catch (err: any) {
      showMessage("error", err.message || "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    if (newPassword !== confirmPassword) {
      showMessage("error", "Les mots de passe ne correspondent pas");
      setSaving(false);
      return;
    }
    if (newPassword.length < 6) {
      showMessage("error", "Minimum 6 caractères");
      setSaving(false);
      return;
    }
    try {
      await updateMyProfile({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      showMessage("success", "Mot de passe modifié !");
    } catch (err: any) {
      showMessage("error", err.message || "Erreur");
    } finally {
      setSaving(false);
    }
  }

  const planConfig: Record<string, { label: string; color: string; badge: string }> = {
    free: { label: "Free", color: "text-slate-400", badge: "bg-slate-700 text-slate-300" },
    pro: { label: "Pro", color: "text-blue-400", badge: "bg-blue-600/20 text-blue-400 border border-blue-500/30" },
    unlimited: { label: "Unlimited", color: "text-purple-400", badge: "bg-purple-600/20 text-purple-400 border border-purple-500/30" },
  };
  const currentPlan = planConfig[profile?.subscription_plan || "free"] || planConfig.free;

  const TABS = [
    { id: "profile", icon: User, label: "Profil" },
    { id: "security", icon: Lock, label: "Sécurité" },
    { id: "subscription", icon: CreditCard, label: "Abonnement" },
    { id: "dj", icon: Disc3, label: "Préférences DJ" },
    { id: "shortcuts", icon: Keyboard, label: "Raccourcis" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm bg-transparent border-none cursor-pointer transition-colors"
          >
            <ArrowLeft size={16} /> Dashboard
          </button>
          <h1 className="text-xl font-bold">Paramètres</h1>
        </div>
      </div>

      {/* Toast */}
      {message.text && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-in" style={{
          background: message.type === "success" ? "rgba(16, 185, 129, 0.15)" : message.type === "error" ? "rgba(239, 68, 68, 0.15)" : "rgba(59, 130, 246, 0.15)",
          border: `1px solid ${message.type === "success" ? "rgba(16, 185, 129, 0.3)" : message.type === "error" ? "rgba(239, 68, 68, 0.3)" : "rgba(59, 130, 246, 0.3)"}`,
          color: message.type === "success" ? "#34d399" : message.type === "error" ? "#f87171" : "#60a5fa",
        }}>
          {message.text}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-8 flex gap-6">
        {/* Tab Navigation */}
        <div className="w-48 flex-shrink-0">
          <nav className="space-y-1">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all bg-transparent border-none cursor-pointer ${
                    activeTab === tab.id
                      ? "bg-blue-600/10 text-blue-400"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-6">
          {/* Profile */}
          {activeTab === "profile" && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-6">
                <h2 className="text-lg font-bold mb-4">Informations personnelles</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Nom</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)}
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] focus:border-blue-500 focus:outline-none transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] focus:border-blue-500 focus:outline-none transition-colors" />
                  </div>
                </div>
                <button type="submit" disabled={saving}
                  className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer border-none transition-colors">
                  <Save size={14} /> {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          )}

          {/* Security */}
          {activeTab === "security" && (
            <form onSubmit={handleChangePassword} className="space-y-6">
              <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-6">
                <h2 className="text-lg font-bold mb-4">Changer le mot de passe</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Mot de passe actuel</label>
                    <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] focus:border-blue-500 focus:outline-none transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Nouveau mot de passe</label>
                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6}
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] focus:border-blue-500 focus:outline-none transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Confirmer</label>
                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6}
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] focus:border-blue-500 focus:outline-none transition-colors" />
                  </div>
                </div>
                <button type="submit" disabled={saving}
                  className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer border-none transition-colors">
                  <Lock size={14} /> {saving ? "Modification..." : "Changer le mot de passe"}
                </button>
              </div>
            </form>
          )}

          {/* Subscription */}
          {activeTab === "subscription" && (
            <div className="space-y-6">
              <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-6">
                <h2 className="text-lg font-bold mb-4">Abonnement actuel</h2>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600/20 to-pink-600/10 flex items-center justify-center">
                      <CreditCard size={22} className={currentPlan.color} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-[var(--text-primary)]">Plan {currentPlan.label}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${currentPlan.badge}`}>{currentPlan.label}</span>
                      </div>
                      <p className="text-sm text-[var(--text-muted)] mt-0.5">
                        {profile?.subscription_plan === 'free' ? '5 analyses/jour' :
                         profile?.subscription_plan === 'pro' ? '20 analyses/jour' : 'Analyses illimitées'}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => router.push("/pricing")}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg text-sm font-semibold cursor-pointer border-none hover:opacity-90 transition-opacity">
                    Changer de plan <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* DJ Preferences */}
          {activeTab === "dj" && (
            <div className="space-y-6">
              <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-6">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Disc3 size={20} className="text-purple-400" /> Préférences DJ
                </h2>
                <div className="space-y-5">
                  {/* Default Export */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                      <Download size={10} className="inline mr-1" />Format d'export par défaut
                    </label>
                    <select value={djPrefs.defaultExport}
                      onChange={e => saveDjPrefs({ ...djPrefs, defaultExport: e.target.value })}
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-4 py-2.5 text-[var(--text-primary)] focus:border-blue-500 focus:outline-none transition-colors">
                      <option value="rekordbox">Rekordbox XML</option>
                      <option value="serato">Serato</option>
                      <option value="traktor">Traktor NML</option>
                      <option value="m3u">M3U Playlist</option>
                      <option value="json">JSON</option>
                    </select>
                  </div>

                  {/* Auto Analyze */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">
                        <Zap size={12} className="inline mr-1 text-yellow-400" />Analyse automatique après upload
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">Lancer l'analyse BPM/Key dès qu'un track est uploadé</p>
                    </div>
                    <button onClick={() => saveDjPrefs({ ...djPrefs, autoAnalyze: !djPrefs.autoAnalyze })}
                      className={`w-11 h-6 rounded-full transition-colors cursor-pointer border-none ${djPrefs.autoAnalyze ? 'bg-blue-600' : 'bg-[var(--bg-elevated)]'}`}>
                      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${djPrefs.autoAnalyze ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* Analysis Quality */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Qualité d'analyse</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'fast', label: 'Rapide', desc: '~10s/track' },
                        { value: 'high', label: 'Haute', desc: '~30s/track' },
                        { value: 'ultra', label: 'Ultra', desc: '~60s/track' },
                      ].map(opt => (
                        <button key={opt.value}
                          onClick={() => saveDjPrefs({ ...djPrefs, analysisQuality: opt.value })}
                          className={`p-3 rounded-lg border text-center transition-all cursor-pointer ${
                            djPrefs.analysisQuality === opt.value
                              ? 'border-blue-500/50 bg-blue-600/10 text-blue-400'
                              : 'border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-default)]'
                          }`}>
                          <div className="text-sm font-semibold">{opt.label}</div>
                          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Camelot Keys Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">
                        <Music2 size={12} className="inline mr-1 text-blue-400" />Afficher les clés en Camelot
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">Convertir automatiquement Am → 8A, C → 8B, etc.</p>
                    </div>
                    <button onClick={() => saveDjPrefs({ ...djPrefs, showCamelotKeys: !djPrefs.showCamelotKeys })}
                      className={`w-11 h-6 rounded-full transition-colors cursor-pointer border-none ${djPrefs.showCamelotKeys ? 'bg-blue-600' : 'bg-[var(--bg-elevated)]'}`}>
                      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${djPrefs.showCamelotKeys ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* Energy bars toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">
                        <Zap size={12} className="inline mr-1 text-emerald-400" />Barres d'énergie dans la liste
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">Afficher les barres d'énergie pour chaque track</p>
                    </div>
                    <button onClick={() => saveDjPrefs({ ...djPrefs, showEnergyBars: !djPrefs.showEnergyBars })}
                      className={`w-11 h-6 rounded-full transition-colors cursor-pointer border-none ${djPrefs.showEnergyBars ? 'bg-blue-600' : 'bg-[var(--bg-elevated)]'}`}>
                      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${djPrefs.showEnergyBars ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* Stem Separation (Demucs) — server-side setting */}
                  <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-gradient-to-r from-purple-600/5 to-pink-600/5 border border-purple-500/20">
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                        <Zap size={12} className="text-purple-400" />
                        Séparation de stems (Demucs IA)
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-600/20 text-purple-400 border border-purple-500/30 uppercase">Pro</span>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Sépare drums/bass/voix/mélodie pour des cue points ultra-précis.
                        <br/>
                        <span className="text-purple-400/70">+30-60s d'analyse par track — résultats 10x plus précis</span>
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          const newVal = !profile?.use_stem_separation;
                          const updated = await updateUserSettings({ use_stem_separation: newVal });
                          setProfile(updated);
                          showMessage("success", newVal
                            ? "Séparation de stems activée — les prochaines analyses utiliseront Demucs"
                            : "Séparation de stems désactivée — analyse standard");
                        } catch (err: any) {
                          showMessage("error", err.message || "Erreur");
                        }
                      }}
                      className={`w-11 h-6 rounded-full transition-colors cursor-pointer border-none flex-shrink-0 ${
                        profile?.use_stem_separation ? 'bg-purple-600' : 'bg-[var(--bg-elevated)]'
                      }`}>
                      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        profile?.use_stem_separation ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>

                  {/* Waveform Style */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                      <Palette size={10} className="inline mr-1" />Style de waveform
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'gradient', label: 'Gradient' },
                        { value: 'solid', label: 'Solide' },
                        { value: 'spectrum', label: 'Spectre' },
                      ].map(opt => (
                        <button key={opt.value}
                          onClick={() => saveDjPrefs({ ...djPrefs, waveformStyle: opt.value })}
                          className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer text-sm ${
                            djPrefs.waveformStyle === opt.value
                              ? 'border-blue-500/50 bg-blue-600/10 text-blue-400 font-semibold'
                              : 'border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-default)]'
                          }`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Keyboard Shortcuts */}
          {activeTab === "shortcuts" && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-6">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Keyboard size={20} className="text-cyan-400" /> Raccourcis clavier
              </h2>
              <div className="space-y-4">
                {[
                  { group: 'Lecture', items: [
                    { keys: 'Space', desc: 'Play / Pause' },
                    { keys: '← / →', desc: 'Reculer / Avancer 5s' },
                  ]},
                  { group: 'Navigation', items: [
                    { keys: '↑ / ↓', desc: 'Track précédent / suivant' },
                    { keys: 'Esc', desc: 'Désélectionner' },
                    { keys: 'Ctrl+F', desc: 'Rechercher' },
                  ]},
                  { group: 'Actions', items: [
                    { keys: '1-5', desc: 'Noter de 1 à 5 étoiles' },
                    { keys: 'Del', desc: 'Supprimer le track sélectionné' },
                    { keys: 'Ctrl+A', desc: 'Tout sélectionner' },
                    { keys: 'Ctrl/Cmd + Click', desc: 'Multi-sélection' },
                    { keys: '?', desc: 'Afficher les raccourcis' },
                  ]},
                ].map(group => (
                  <div key={group.group}>
                    <h3 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">{group.group}</h3>
                    <div className="space-y-1">
                      {group.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--bg-hover)] transition-colors">
                          <span className="text-sm text-[var(--text-secondary)]">{item.desc}</span>
                          <kbd className="px-2 py-1 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] font-mono font-medium text-[var(--text-primary)]">
                            {item.keys}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
