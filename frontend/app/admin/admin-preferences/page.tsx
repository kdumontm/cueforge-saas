"use client";
import { useState, useEffect, useMemo } from "react";
import {
  Save, RotateCcw, Keyboard, Bell, Sun, Moon, LayoutGrid,
  Search, Eye, EyeOff, Lock,
} from "lucide-react";
import {
  Input, Select, Btn, Card, Badge, Toggle, PageWrapper,
  SectionHeader, useToast, PageGuide,
} from "../_components/shared";
import { adminApi } from "../_components/api";
import { useAdminModules } from "../_components/AdminModulesContext";
import { NAV_GROUPS, ALL_NAV_ITEMS, ESSENTIAL_MODULE_IDS } from "../_components/navItems";

/* ── Types ─────────────────────────────── */

interface AdminPreferences {
  language: "fr" | "en" | "es" | "de";
  timezone: string;
  theme: "dark" | "light" | "auto";
  notifications_email: boolean;
  notifications_push: boolean;
  notifications_in_app: boolean;
}

interface AdminShortcut {
  id: string;
  action: string;
  keys: string;
  description: string;
}

const timezones = [
  "UTC", "Europe/Paris", "Europe/London", "Europe/Berlin",
  "America/New_York", "America/Los_Angeles", "Asia/Tokyo",
];

const defaultShortcuts: AdminShortcut[] = [
  { id: "search", action: "Recherche globale", keys: "Ctrl+K", description: "Ouvrir la recherche" },
  { id: "dashboard", action: "Tableau de bord", keys: "Ctrl+D", description: "Aller au dashboard" },
  { id: "users", action: "Utilisateurs", keys: "Ctrl+U", description: "Aller aux utilisateurs" },
  { id: "settings", action: "Paramètres", keys: "Ctrl+,", description: "Ouvrir les paramètres" },
  { id: "help", action: "Aide", keys: "Ctrl+H", description: "Ouvrir l'aide" },
];

/* ── Page ──────────────────────────────── */

export default function AdminPreferencesPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"modules" | "preferences" | "shortcuts">("modules");

  // Modules context
  const { disabledModules, toggleModule, isEnabled } = useAdminModules();
  const [moduleSearch, setModuleSearch] = useState("");

  // Preferences
  const [prefs, setPrefs] = useState<AdminPreferences>({
    language: "fr",
    timezone: "Europe/Paris",
    theme: "dark",
    notifications_email: true,
    notifications_push: true,
    notifications_in_app: true,
  });

  // Shortcuts
  const [shortcuts, setShortcuts] = useState<AdminShortcut[]>(defaultShortcuts);
  const [editingShortcut, setEditingShortcut] = useState<string | null>(null);
  const [editingKeys, setEditingKeys] = useState("");

  // Stats
  const totalModules = ALL_NAV_ITEMS.length;
  const enabledCount = ALL_NAV_ITEMS.filter((i) => isEnabled(i.id)).length;
  const disabledCount = totalModules - enabledCount;

  // Load preferences
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        setLoading(true);
        const [prefsRes, shortcutsRes] = await Promise.all([
          adminApi.getAdminPreferences().catch(() => null),
          adminApi.getAdminShortcuts().catch(() => null),
        ]);
        if (prefsRes) setPrefs(prefsRes);
        if (shortcutsRes?.shortcuts) setShortcuts(shortcutsRes.shortcuts);
      } catch {
        // Silently handle errors
      } finally {
        setLoading(false);
      }
    };
    loadPreferences();
  }, []);

  // Save preferences
  const handleSavePreferences = async () => {
    try {
      setSaving(true);
      await adminApi.updateAdminPreferences(prefs);
      toast("Préférences enregistrées", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  // Save shortcuts
  const handleSaveShortcuts = async () => {
    try {
      setSaving(true);
      await adminApi.updateAdminShortcuts({ shortcuts });
      toast("Raccourcis enregistrés", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  // Filtered nav groups for module search
  const filteredGroups = useMemo(() => {
    if (!moduleSearch.trim()) return NAV_GROUPS;
    const q = moduleSearch.toLowerCase();
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          group.label.toLowerCase().includes(q)
      ),
    })).filter((g) => g.items.length > 0);
  }, [moduleSearch]);

  // Bulk actions
  const handleEnableAll = () => {
    ALL_NAV_ITEMS.forEach((item) => {
      if (!isEnabled(item.id)) toggleModule(item.id);
    });
    toast("Tous les modules activés", "success");
  };

  const handleDisableNonEssential = () => {
    ALL_NAV_ITEMS.forEach((item) => {
      if (!ESSENTIAL_MODULE_IDS.has(item.id) && isEnabled(item.id)) {
        toggleModule(item.id);
      }
    });
    toast("Modules non-essentiels désactivés", "success");
  };

  // Bulk toggle for a group
  const toggleGroup = (groupLabel: string, enable: boolean) => {
    const group = NAV_GROUPS.find((g) => g.label === groupLabel);
    if (!group) return;
    group.items.forEach((item) => {
      if (ESSENTIAL_MODULE_IDS.has(item.id)) return;
      const currently = isEnabled(item.id);
      if (currently !== enable) toggleModule(item.id);
    });
  };

  const tabs = [
    { id: "modules" as const, label: "Modules Admin", icon: LayoutGrid },
    { id: "preferences" as const, label: "Paramètres", icon: Save },
    { id: "shortcuts" as const, label: "Raccourcis", icon: Keyboard },
  ];

  return (
    <PageWrapper>
      <PageGuide
        id="admin-preferences"
        icon={LayoutGrid}
        title="Préférences Admin & Modules"
        description="Activez ou désactivez les modules de la sidebar admin. Les modules désactivés disparaissent de la navigation mais restent accessibles par URL directe."
        steps={[
          { text: "Utilisez les toggles pour activer/désactiver chaque module" },
          { text: "Les modules essentiels (Dashboard, Utilisateurs, Santé, Réglages) ne peuvent pas être désactivés" },
          { text: "Utilisez 'Tout activer' ou 'Tout désactiver' pour des actions en masse" },
        ]}
      />
      <SectionHeader
        title="Préférences Admin"
        description={`${enabledCount} modules actifs sur ${totalModules}`}
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border-subtle">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 font-medium text-sm transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "text-accent border-accent"
                : "text-text-muted border-transparent hover:text-text-secondary"
            }`}
          >
            <tab.icon size={15} />
            {tab.label}
            {tab.id === "modules" && disabledCount > 0 && (
              <Badge variant="warning">{disabledCount} off</Badge>
            )}
          </button>
        ))}
      </div>

      {/* ═══ MODULES TAB ═══ */}
      {activeTab === "modules" && (
        <div className="space-y-6">
          {/* Stats + Actions */}
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-accent">{enabledCount}</div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wider">Actifs</div>
                </div>
                <div className="w-px h-10 bg-border-subtle" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-text-muted">{disabledCount}</div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wider">Masqués</div>
                </div>
                <div className="w-px h-10 bg-border-subtle" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-text-primary">{totalModules}</div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wider">Total</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Btn variant="primary" small onClick={handleEnableAll}>
                  <Eye size={14} /> Tout activer
                </Btn>
                <Btn variant="warning" small onClick={handleDisableNonEssential}>
                  <EyeOff size={14} /> Tout désactiver
                </Btn>
              </div>
            </div>
          </Card>

          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={moduleSearch}
              onChange={(e) => setModuleSearch(e.target.value)}
              placeholder="Rechercher un module…"
              className="w-full pl-10 pr-4 py-2.5 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none transition-colors"
            />
          </div>

          {/* Groups */}
          <div className="space-y-4">
            {filteredGroups.map((group) => {
              const groupEnabled = group.items.filter((i) => isEnabled(i.id)).length;
              const groupTotal = group.items.length;
              const allEnabled = groupEnabled === groupTotal;
              const allDisabled = groupEnabled === 0 || (groupEnabled === group.items.filter((i) => ESSENTIAL_MODULE_IDS.has(i.id)).length);

              return (
                <Card key={group.label} className="overflow-hidden">
                  {/* Group header */}
                  <div className="flex items-center justify-between px-5 py-3 bg-bg-secondary border-b border-border-subtle">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-bold text-text-primary">{group.label}</h3>
                      <Badge variant={groupEnabled === groupTotal ? "success" : groupEnabled === 0 ? "error" : "warning"}>
                        {groupEnabled}/{groupTotal}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Btn
                        small
                        variant={allEnabled ? "default" : "primary"}
                        disabled={allEnabled}
                        onClick={() => toggleGroup(group.label, true)}
                      >
                        Tout activer
                      </Btn>
                      <Btn
                        small
                        variant={allDisabled ? "default" : "warning"}
                        disabled={allDisabled}
                        onClick={() => toggleGroup(group.label, false)}
                      >
                        Tout masquer
                      </Btn>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="divide-y divide-border-subtle">
                    {group.items.map((item) => {
                      const essential = ESSENTIAL_MODULE_IDS.has(item.id);
                      const enabled = isEnabled(item.id);

                      return (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between px-5 py-3 transition-colors ${
                            enabled ? "bg-bg-primary" : "bg-bg-primary/50 opacity-60"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <item.icon size={16} className={enabled ? "text-accent" : "text-text-muted"} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-text-primary truncate">
                                {item.label}
                              </p>
                              <p className="text-[10px] text-text-muted font-mono">{item.href}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 ml-3">
                            {essential && (
                              <Badge variant="info">
                                <Lock size={10} className="mr-1" />
                                Essentiel
                              </Badge>
                            )}
                            <Toggle
                              on={enabled}
                              onToggle={() => !essential && toggleModule(item.id)}
                              disabled={essential}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>

          {filteredGroups.length === 0 && (
            <div className="text-center py-12 text-text-muted">
              <Search size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Aucun module trouvé pour « {moduleSearch} »</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ PREFERENCES TAB ═══ */}
      {activeTab === "preferences" && (
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-text-primary font-semibold mb-4">Paramètres généraux</h3>
            <div className="space-y-4 max-w-md">
              <Select
                label="Langue"
                value={prefs.language}
                onChange={(v) => setPrefs({ ...prefs, language: v as any })}
                options={[
                  { value: "fr", label: "Français" },
                  { value: "en", label: "English" },
                  { value: "es", label: "Español" },
                  { value: "de", label: "Deutsch" },
                ]}
              />
              <Select
                label="Fuseau horaire"
                value={prefs.timezone}
                onChange={(v) => setPrefs({ ...prefs, timezone: v })}
                options={timezones.map((tz) => ({ value: tz, label: tz }))}
              />
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Thème</p>
                <div className="flex gap-2">
                  {(["dark", "light", "auto"] as const).map((theme) => (
                    <button
                      key={theme}
                      onClick={() => setPrefs({ ...prefs, theme })}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                        prefs.theme === theme
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border-subtle text-text-muted hover:border-border-default"
                      }`}
                    >
                      {theme === "dark" && <Moon size={14} />}
                      {theme === "light" && <Sun size={14} />}
                      {theme === "auto" && <RotateCcw size={14} />}
                      <span className="text-sm">{theme === "dark" ? "Sombre" : theme === "light" ? "Clair" : "Auto"}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-text-primary font-semibold mb-4 flex items-center gap-2">
              <Bell size={16} /> Notifications
            </h3>
            <div className="space-y-3">
              {[
                { key: "notifications_email" as const, label: "Notifications par email" },
                { key: "notifications_push" as const, label: "Notifications push" },
                { key: "notifications_in_app" as const, label: "Notifications dans l'appli" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg border border-border-subtle">
                  <span className="text-sm text-text-secondary">{label}</span>
                  <Toggle on={prefs[key]} onToggle={() => setPrefs({ ...prefs, [key]: !prefs[key] })} />
                </div>
              ))}
            </div>
          </Card>

          <div className="flex justify-end">
            <Btn variant="primary" onClick={handleSavePreferences} loading={saving}>
              <Save size={14} /> Enregistrer les préférences
            </Btn>
          </div>
        </div>
      )}

      {/* ═══ SHORTCUTS TAB ═══ */}
      {activeTab === "shortcuts" && (
        <Card className="p-6">
          <h3 className="text-text-primary font-semibold mb-4 flex items-center gap-2">
            <Keyboard size={16} /> Raccourcis clavier
          </h3>
          <div className="space-y-3 mb-6">
            {shortcuts.map((shortcut) => (
              <div
                key={shortcut.id}
                className="flex items-center justify-between p-4 bg-bg-secondary rounded-lg border border-border-subtle"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-primary">{shortcut.action}</p>
                  <p className="text-xs text-text-muted">{shortcut.description}</p>
                </div>
                {editingShortcut === shortcut.id ? (
                  <div className="flex gap-2 items-center">
                    <Input
                      value={editingKeys}
                      onChange={(v) => setEditingKeys(v)}
                      placeholder="ex: Ctrl+K"
                    />
                    <Btn
                      variant="primary"
                      small
                      onClick={() => {
                        setShortcuts((s) => s.map((sc) => sc.id === shortcut.id ? { ...sc, keys: editingKeys } : sc));
                        setEditingShortcut(null);
                      }}
                    >
                      OK
                    </Btn>
                    <Btn variant="default" small onClick={() => setEditingShortcut(null)}>
                      Annuler
                    </Btn>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingShortcut(shortcut.id); setEditingKeys(shortcut.keys); }}
                    className="px-3 py-1.5 rounded-lg border border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-default text-sm font-mono transition-colors"
                  >
                    {shortcut.keys}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Btn variant="primary" onClick={handleSaveShortcuts} loading={saving}>
              <Save size={14} /> Enregistrer les raccourcis
            </Btn>
          </div>
        </Card>
      )}
    </PageWrapper>
  );
}
