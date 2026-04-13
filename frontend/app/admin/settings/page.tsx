"use client";

import { useState, useEffect } from "react";
import { Palette, Globe, Share2, AlertCircle, Info } from "lucide-react";
import {
  Input,
  Select,
  Toggle,
  Btn,
  Card,
  TabBar,
  PageWrapper,
  SectionHeader,
  LoadingScreen,
  ColorPicker,
  useToast,
  PageGuide,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface Settings {
  // Branding
  site_name?: string;
  tagline?: string;
  logo_url?: string;
  favicon_url?: string;
  font_family?: string;

  // Colors
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  background_color?: string;
  text_color?: string;

  // SEO
  meta_title?: string;
  meta_description?: string;
  og_image_url?: string;
  google_analytics_id?: string;

  // Social
  twitter_url?: string;
  instagram_url?: string;
  discord_url?: string;
  youtube_url?: string;
  footer_text?: string;

  // Maintenance
  maintenance_mode?: boolean;
  maintenance_message?: string;
}

const FONT_FAMILIES = [
  { value: "inter", label: "Inter (Sans-serif)" },
  { value: "poppins", label: "Poppins (Sans-serif)" },
  { value: "playfair", label: "Playfair Display (Serif)" },
  { value: "space-mono", label: "Space Mono (Monospace)" },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("branding");

  // Form state
  const [settings, setSettings] = useState<Settings>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const data = await adminApi.getSettings();
        setSettings(data || {});
        setHasChanges(false);
      } catch (error) {
        toast(error instanceof Error ? error.message : "Erreur de chargement", "error");
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, [toast]);

  const handleSettingChange = (key: string, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async (keys: string[]) => {
    try {
      setSaving(true);
      const data = keys.reduce((acc, key) => {
        acc[key] = settings[key as keyof Settings];
        return acc;
      }, {} as any);

      await adminApi.updateSettings(data);
      setHasChanges(false);
      toast("Paramètres mis à jour avec succès", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erreur de sauvegarde", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingScreen />;

  const tabs = [
    { id: "branding", label: "Branding", icon: Globe },
    { id: "colors", label: "Couleurs", icon: Palette },
    { id: "seo", label: "SEO", icon: Globe },
    { id: "social", label: "Réseaux sociaux", icon: Share2 },
    { id: "maintenance", label: "Maintenance", icon: AlertCircle },
  ];

  return (
    <PageWrapper>
      <PageGuide
        id="settings"
        icon={Info}
        title="Réglages du site"
        description="Personnalisez l'apparence et les métadonnées de votre site CueForge. Les modifications sont sauvegardées onglet par onglet."
        steps={[
          { text: "Branding : nom du site, tagline, logo et favicon" },
          { text: "Couleurs : personnalisez la palette de couleurs de l'interface" },
          { text: "SEO : titre, description et image pour le partage social" },
          { text: "Réseaux sociaux : liens vers vos profils Twitter, Instagram, Discord, YouTube" },
          { text: "Maintenance : activez le mode maintenance si besoin" },
        ]}
      />
      <SectionHeader
        title="Réglages du site"
        description="Configurez l'apparence, les couleurs, le SEO et les réseaux sociaux de votre site CueForge."
      />

      <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* BRANDING TAB */}
      {activeTab === "branding" && (
        <Card className="p-6">
          <div className="space-y-5">
            <Input
              label="Nom du site"
              value={settings.site_name || ""}
              onChange={(v) => handleSettingChange("site_name", v)}
              placeholder="CueForge"
            />
            <Input
              label="Tagline"
              value={settings.tagline || ""}
              onChange={(v) => handleSettingChange("tagline", v)}
              placeholder="DJ audio analysis SaaS"
            />
            <Input
              label="URL du logo"
              value={settings.logo_url || ""}
              onChange={(v) => handleSettingChange("logo_url", v)}
              placeholder="https://example.com/logo.png"
            />
            <Input
              label="URL du favicon"
              value={settings.favicon_url || ""}
              onChange={(v) => handleSettingChange("favicon_url", v)}
              placeholder="https://example.com/favicon.ico"
            />
            <Select
              label="Police de caractères"
              value={settings.font_family || "inter"}
              onChange={(v) => handleSettingChange("font_family", v)}
              options={FONT_FAMILIES}
            />
          </div>
          <div className="mt-6 flex justify-end">
            <Btn
              variant="primary"
              onClick={() =>
                handleSave(["site_name", "tagline", "logo_url", "favicon_url", "font_family"])
              }
              loading={saving}
            >
              Enregistrer
            </Btn>
          </div>
        </Card>
      )}

      {/* COLORS TAB */}
      {activeTab === "colors" && (
        <Card className="p-6">
          <div className="grid grid-cols-2 gap-6">
            <ColorPicker
              label="Couleur primaire"
              value={settings.primary_color || "#0066FF"}
              onChange={(v) => handleSettingChange("primary_color", v)}
            />
            <ColorPicker
              label="Couleur secondaire"
              value={settings.secondary_color || "#FF6B35"}
              onChange={(v) => handleSettingChange("secondary_color", v)}
            />
            <ColorPicker
              label="Couleur accent"
              value={settings.accent_color || "#00D9FF"}
              onChange={(v) => handleSettingChange("accent_color", v)}
            />
            <ColorPicker
              label="Couleur de fond"
              value={settings.background_color || "#0F0F23"}
              onChange={(v) => handleSettingChange("background_color", v)}
            />
            <ColorPicker
              label="Couleur du texte"
              value={settings.text_color || "#FFFFFF"}
              onChange={(v) => handleSettingChange("text_color", v)}
            />
          </div>
          <div className="mt-6 flex justify-end">
            <Btn
              variant="primary"
              onClick={() =>
                handleSave([
                  "primary_color",
                  "secondary_color",
                  "accent_color",
                  "background_color",
                  "text_color",
                ])
              }
              loading={saving}
            >
              Enregistrer
            </Btn>
          </div>
        </Card>
      )}

      {/* SEO TAB */}
      {activeTab === "seo" && (
        <Card className="p-6">
          <div className="space-y-5">
            <Input
              label="Titre Meta"
              value={settings.meta_title || ""}
              onChange={(v) => handleSettingChange("meta_title", v)}
              placeholder="CueForge — Audio Analysis for DJs"
            />
            <Input
              label="Description Meta"
              value={settings.meta_description || ""}
              onChange={(v) => handleSettingChange("meta_description", v)}
              placeholder="Analyze your DJ mixes with AI-powered audio analysis"
              multiline
              rows={3}
            />
            <Input
              label="URL image OG"
              value={settings.og_image_url || ""}
              onChange={(v) => handleSettingChange("og_image_url", v)}
              placeholder="https://example.com/og-image.png"
            />
            <Input
              label="Google Analytics ID"
              value={settings.google_analytics_id || ""}
              onChange={(v) => handleSettingChange("google_analytics_id", v)}
              placeholder="G-XXXXXXXXXX"
            />
          </div>
          <div className="mt-6 flex justify-end">
            <Btn
              variant="primary"
              onClick={() =>
                handleSave([
                  "meta_title",
                  "meta_description",
                  "og_image_url",
                  "google_analytics_id",
                ])
              }
              loading={saving}
            >
              Enregistrer
            </Btn>
          </div>
        </Card>
      )}

      {/* SOCIAL TAB */}
      {activeTab === "social" && (
        <Card className="p-6">
          <div className="space-y-5">
            <Input
              label="URL Twitter"
              value={settings.twitter_url || ""}
              onChange={(v) => handleSettingChange("twitter_url", v)}
              placeholder="https://twitter.com/cueforge"
            />
            <Input
              label="URL Instagram"
              value={settings.instagram_url || ""}
              onChange={(v) => handleSettingChange("instagram_url", v)}
              placeholder="https://instagram.com/cueforge"
            />
            <Input
              label="URL Discord"
              value={settings.discord_url || ""}
              onChange={(v) => handleSettingChange("discord_url", v)}
              placeholder="https://discord.gg/cueforge"
            />
            <Input
              label="URL YouTube"
              value={settings.youtube_url || ""}
              onChange={(v) => handleSettingChange("youtube_url", v)}
              placeholder="https://youtube.com/@cueforge"
            />
            <Input
              label="Texte du pied de page"
              value={settings.footer_text || ""}
              onChange={(v) => handleSettingChange("footer_text", v)}
              placeholder="© 2026 CueForge. Tous droits réservés."
              multiline
              rows={3}
            />
          </div>
          <div className="mt-6 flex justify-end">
            <Btn
              variant="primary"
              onClick={() =>
                handleSave([
                  "twitter_url",
                  "instagram_url",
                  "discord_url",
                  "youtube_url",
                  "footer_text",
                ])
              }
              loading={saving}
            >
              Enregistrer
            </Btn>
          </div>
        </Card>
      )}

      {/* MAINTENANCE TAB */}
      {activeTab === "maintenance" && (
        <Card className="p-6">
          <div className="space-y-5">
            <div className="flex items-center justify-between p-4 bg-bg-secondary rounded-lg border border-border-subtle">
              <div>
                <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">
                  Mode maintenance
                </label>
                <p className="text-xs text-text-muted">
                  Activez pour afficher un message de maintenance à tous les utilisateurs
                </p>
              </div>
              <Toggle
                on={settings.maintenance_mode || false}
                onToggle={() =>
                  handleSettingChange("maintenance_mode", !settings.maintenance_mode)
                }
              />
            </div>

            {settings.maintenance_mode && (
              <Input
                label="Message de maintenance"
                value={settings.maintenance_message || ""}
                onChange={(v) => handleSettingChange("maintenance_message", v)}
                placeholder="Nous effectuons une maintenance. Veuillez revenir plus tard."
                multiline
                rows={4}
              />
            )}
          </div>
          <div className="mt-6 flex justify-end">
            <Btn
              variant="primary"
              onClick={() =>
                handleSave(["maintenance_mode", "maintenance_message"])
              }
              loading={saving}
            >
              Enregistrer
            </Btn>
          </div>
        </Card>
      )}
    </PageWrapper>
  );
}
