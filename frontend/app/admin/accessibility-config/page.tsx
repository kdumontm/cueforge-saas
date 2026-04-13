"use client";
import { useState, useEffect } from "react";
import { adminApi } from "../_components/api";

export default function AccessibilityConfigAdmin() {
  const [config, setConfig] = useState<any>({
    enabled: true,
    skip_nav: true,
    aria_labels: true,
    focus_indicators: true,
    high_contrast_mode: false,
    font_size_adjustment: true,
    min_font_size: 14,
    reduced_motion: false,
    screen_reader_optimized: false,
    keyboard_navigation: true,
    alt_text_required: true,
    color_blind_friendly: false,
    text_spacing: false,
    dyslexia_font: false,
    wcag_level: "AA",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await adminApi.getAccessibilityConfig();
      if (data && Object.keys(data).length > 0) setConfig({ ...config, ...data });
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    try { await adminApi.updateAccessibilityConfig(config); } catch (e) { console.error(e); }
    setSaving(false);
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  const Toggle = ({ label, field, desc }: { label: string; field: string; desc?: string }) => (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm text-white">{label}</div>
        {desc && <div className="text-xs text-gray-500">{desc}</div>}
      </div>
      <button onClick={() => setConfig({ ...config, [field]: !config[field] })}
        className={`w-11 h-6 rounded-full transition ${config[field] ? "bg-purple-600" : "bg-gray-600"} relative`}>
        <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition ${config[field] ? "left-5.5" : "left-0.5"}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Accessibilité</h1>
        <button onClick={save} disabled={saving} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50">
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>

      <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-1">
        <h2 className="text-lg font-semibold text-white mb-3">Niveau WCAG</h2>
        <div className="flex gap-3">
          {["A", "AA", "AAA"].map(level => (
            <button key={level} onClick={() => setConfig({ ...config, wcag_level: level })}
              className={`px-6 py-3 rounded-lg text-sm font-medium transition ${config.wcag_level === level ? "bg-purple-600 text-white" : "bg-[#0a0a1a] text-gray-400 hover:text-white"}`}>
              WCAG {level}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-1">
          <h2 className="text-lg font-semibold text-white mb-2">Navigation</h2>
          <Toggle label="Skip navigation" field="skip_nav" desc="Lien pour sauter directement au contenu" />
          <Toggle label="Labels ARIA" field="aria_labels" desc="Attributs ARIA sur tous les éléments interactifs" />
          <Toggle label="Indicateurs de focus" field="focus_indicators" desc="Outline visible lors de la navigation au clavier" />
          <Toggle label="Navigation clavier" field="keyboard_navigation" desc="Support complet de la navigation au clavier" />
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-1">
          <h2 className="text-lg font-semibold text-white mb-2">Visuel</h2>
          <Toggle label="Mode haut contraste" field="high_contrast_mode" desc="Augmenter le contraste des couleurs" />
          <Toggle label="Mode daltonien" field="color_blind_friendly" desc="Palette adaptée aux daltoniens" />
          <Toggle label="Mouvement réduit" field="reduced_motion" desc="Désactiver les animations" />
          <Toggle label="Optimisé lecteur d'écran" field="screen_reader_optimized" />
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-1">
          <h2 className="text-lg font-semibold text-white mb-2">Typographie</h2>
          <Toggle label="Ajustement taille police" field="font_size_adjustment" desc="Permettre aux utilisateurs de changer la taille" />
          <div className="py-2">
            <label className="block text-sm text-gray-400 mb-1">Taille minimum (px)</label>
            <input type="number" className="w-full bg-[#0a0a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              value={config.min_font_size} onChange={e => setConfig({ ...config, min_font_size: parseInt(e.target.value) || 12 })} />
          </div>
          <Toggle label="Espacement du texte" field="text_spacing" desc="Augmenter l'espacement entre les lignes/lettres" />
          <Toggle label="Police dyslexie" field="dyslexia_font" desc="Utiliser OpenDyslexic ou similaire" />
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-6 space-y-1">
          <h2 className="text-lg font-semibold text-white mb-2">Contenu</h2>
          <Toggle label="Texte alternatif requis" field="alt_text_required" desc="Obliger les alt-text sur les images" />
          <Toggle label="Accessibilité activée" field="enabled" desc="Activer globalement les fonctions d'accessibilité" />
        </div>
      </div>
    </div>
  );
}
