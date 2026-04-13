"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function ThemeEditorPage() {
  const [tab, setTab] = useState<"colors"|"buttons"|"cards"|"animations"|"dark"|"presets"|"css">("colors");
  const [theme, setTheme] = useState<any>(null);
  const [btnStyles, setBtnStyles] = useState<any>(null);
  const [cardStyles, setCardStyles] = useState<any>(null);
  const [animConfig, setAnimConfig] = useState<any>(null);
  const [darkMode, setDarkMode] = useState<any>(null);
  const [presets, setPresets] = useState<any[]>([]);
  const [cssOverrides, setCssOverrides] = useState("");
  const [toast, setToast] = useState("");

  const load = async () => {
    const [t, b, c, a, d, p, css] = await Promise.all([
      adminApi.getThemeConfig(), adminApi.getButtonStyles(), adminApi.getCardStyles(),
      adminApi.getAnimationConfig(), adminApi.getDarkMode(), adminApi.listThemePresets(),
      adminApi.getCssOverrides(),
    ]);
    setTheme(t); setBtnStyles(b); setCardStyles(c); setAnimConfig(a);
    setDarkMode(d); setPresets(p.items); setCssOverrides(css.css || "");
  };
  useEffect(() => { load(); }, []);

  const tabs = [
    { id: "colors", label: "🎨 Couleurs" }, { id: "buttons", label: "🔘 Boutons" },
    { id: "cards", label: "🃏 Cards" }, { id: "animations", label: "✨ Animations" },
    { id: "dark", label: "🌙 Dark Mode" }, { id: "presets", label: "📦 Presets" },
    { id: "css", label: "</> CSS" },
  ];

  const ColorInput = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded border border-slate-600" style={{ backgroundColor: value }} />
      <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-10 h-8 rounded cursor-pointer" />
      <input value={value} onChange={e => onChange(e.target.value)} className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white font-mono text-sm w-28" />
      <span className="text-slate-400 text-sm">{label}</span>
    </div>
  );

  if (!theme) return <div className="p-6 text-slate-400">Chargement...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">🎨 Éditeur de thème</h1>
        <div className="flex gap-2">
          <button onClick={async () => { const d = await adminApi.exportTheme(); navigator.clipboard.writeText(JSON.stringify(d, null, 2)); setToast("📋 Thème copié"); }} className="bg-slate-700 text-white px-3 py-1.5 rounded text-sm">Exporter</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id as any)} className={`px-3 py-1.5 rounded-lg text-sm ${tab === t.id ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}>{t.label}</button>)}
      </div>

      <div className="bg-slate-800 rounded-xl p-5">
        {tab === "colors" && theme.colors && (
          <div className="space-y-4">
            {Object.entries(theme.colors).map(([k, v]) => (
              <ColorInput key={k} label={k} value={String(v)} onChange={val => setTheme({...theme, colors: {...theme.colors, [k]: val}})} />
            ))}
            <div className="pt-2">
              <label className="text-slate-400 text-sm">Police</label>
              <input value={theme.typography?.font_family || "Inter"} onChange={e => setTheme({...theme, typography: {...theme.typography, font_family: e.target.value}})} className="ml-3 bg-slate-700 border border-slate-600 rounded px-3 py-1 text-white" />
            </div>
            <button onClick={async () => { await adminApi.updateThemeConfig(theme); setToast("✅ Thème mis à jour"); }} className="bg-indigo-600 text-white px-4 py-2 rounded">Sauvegarder</button>
          </div>
        )}

        {tab === "buttons" && btnStyles && (
          <div className="space-y-4">
            {Object.entries(btnStyles).map(([variant, styles]: [string, any]) => (
              <div key={variant} className="border border-slate-700 rounded-lg p-3">
                <h3 className="text-white font-medium mb-2">{variant}</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(styles).map(([prop, val]) => (
                    <div key={prop} className="flex items-center gap-1">
                      <label className="text-xs text-slate-500">{prop}:</label>
                      <input value={String(val)} onChange={e => setBtnStyles({...btnStyles, [variant]: {...styles, [prop]: e.target.value}})} className="bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-white text-xs w-24" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={async () => { await adminApi.updateButtonStyles(btnStyles); setToast("✅ Sauvegardé"); }} className="bg-indigo-600 text-white px-4 py-2 rounded">Sauvegarder</button>
          </div>
        )}

        {tab === "cards" && cardStyles && (
          <div className="space-y-3">
            {Object.entries(cardStyles).map(([k, v]) => (
              <div key={k} className="flex items-center gap-3">
                <label className="text-slate-400 w-32 text-sm">{k}</label>
                <input value={String(v)} onChange={e => setCardStyles({...cardStyles, [k]: e.target.value})} className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-white flex-1" />
              </div>
            ))}
            <button onClick={async () => { await adminApi.updateCardStyles(cardStyles); setToast("✅ Sauvegardé"); }} className="bg-indigo-600 text-white px-4 py-2 rounded">Sauvegarder</button>
          </div>
        )}

        {tab === "animations" && animConfig && (
          <div className="space-y-3">
            {Object.entries(animConfig).map(([k, v]) => (
              <div key={k} className="flex items-center gap-3">
                <label className="text-slate-400 w-48 text-sm">{k.replace(/_/g, " ")}</label>
                {typeof v === "boolean" ? (
                  <button onClick={() => setAnimConfig({...animConfig, [k]: !v})} className={`px-3 py-1 rounded text-sm ${v ? "bg-green-600 text-white" : "bg-slate-700 text-slate-400"}`}>{v ? "Activé" : "Désactivé"}</button>
                ) : (
                  <input value={String(v)} onChange={e => setAnimConfig({...animConfig, [k]: e.target.value})} className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-white" />
                )}
              </div>
            ))}
            <button onClick={async () => { await adminApi.updateAnimationConfig(animConfig); setToast("✅ Sauvegardé"); }} className="bg-indigo-600 text-white px-4 py-2 rounded">Sauvegarder</button>
          </div>
        )}

        {tab === "dark" && darkMode && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-slate-400 w-32">Activé</label>
              <button onClick={() => setDarkMode({...darkMode, enabled: !darkMode.enabled})} className={`px-3 py-1 rounded text-sm ${darkMode.enabled ? "bg-green-600 text-white" : "bg-slate-700 text-slate-400"}`}>{darkMode.enabled ? "Oui" : "Non"}</button>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-slate-400 w-32">Auto-détect</label>
              <button onClick={() => setDarkMode({...darkMode, auto_detect: !darkMode.auto_detect})} className={`px-3 py-1 rounded text-sm ${darkMode.auto_detect ? "bg-green-600 text-white" : "bg-slate-700 text-slate-400"}`}>{darkMode.auto_detect ? "Oui" : "Non"}</button>
            </div>
            <button onClick={async () => { await adminApi.updateDarkMode(darkMode); setToast("✅ Sauvegardé"); }} className="bg-indigo-600 text-white px-4 py-2 rounded">Sauvegarder</button>
          </div>
        )}

        {tab === "presets" && (
          <div className="space-y-3">
            {presets.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-slate-700/50 rounded-lg p-3">
                <div><span className="text-white font-medium">{p.name}</span>{p.description && <span className="text-slate-400 text-sm ml-2">— {p.description}</span>}</div>
                <div className="flex gap-2">
                  <button onClick={async () => { await adminApi.applyThemePreset(p.id); load(); setToast("✅ Preset appliqué"); }} className="bg-indigo-600 text-white px-3 py-1 rounded text-sm">Appliquer</button>
                  <button onClick={async () => { await adminApi.deleteThemePreset(p.id); load(); }} className="text-red-400 text-sm">×</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "css" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">CSS custom appliqué globalement sur le site. Utilisez des sélecteurs CSS standard.</p>
            <textarea value={cssOverrides} onChange={e => setCssOverrides(e.target.value)} rows={15} className="w-full bg-slate-900 border border-slate-600 rounded px-4 py-3 text-green-400 font-mono text-sm" placeholder="/* Custom CSS */" />
            <button onClick={async () => { await adminApi.updateCssOverrides(cssOverrides); setToast("✅ CSS sauvegardé"); }} className="bg-indigo-600 text-white px-4 py-2 rounded">Sauvegarder</button>
          </div>
        )}
      </div>
      {toast && <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg" onClick={() => setToast("")}>{toast}</div>}
    </div>
  );
}
