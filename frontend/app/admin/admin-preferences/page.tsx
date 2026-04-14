"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Save, RotateCcw, Keyboard, Bell, Sun, Moon,
} from "lucide-react";
import {
  Input, Select, Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, useToast,
} from "../_components/shared";
import { adminApi } from "../_components/api";

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
  "UTC",
  "Europe/Paris",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
];

const defaultShortcuts: AdminShortcut[] = [
  { id: "search", action: "Recherche globale", keys: "Ctrl+K", description: "Ouvrir la recherche" },
  { id: "dashboard", action: "Tableau de bord", keys: "Ctrl+D", description: "Aller au dashboard" },
  { id: "users", action: "Utilisateurs", keys: "Ctrl+U", description: "Aller aux utilisateurs" },
  { id: "settings", action: "Paramètres", keys: "Ctrl+,", description: "Ouvrir les paramètres" },
  { id: "help", action: "Aide", keys: "Ctrl+H", description: "Ouvrir l'aide" },
];

export default function AdminPreferencesPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"preferences" | "shortcuts">("preferences");

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

  // Load preferences
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        setLoading(true);
        const [prefsRes, shortcutsRes] = await Promise.all([
          adminApi.getAdminPreferences(),
          adminApi.getAdminShortcuts(),
        ]);
        setPrefs(prefsRes || prefs);
        setShortcuts(shortcutsRes.shortcuts || defaultShortcuts);
      } catch (err: any) {
        toast(`Erreur: ${err.message}`, "error");
      } finally {
        setLoading(false);
      }
    };
    loadPreferences();
  }, [toast]);

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

  // Update shortcut
  const handleUpdateShortcut = (shortcutId: string, newKeys: string) => {
    const updatedShortcuts = shortcuts.map((s) =>
      s.id === shortcutId ? { ...s, keys: newKeys } : s
    );
    setShortcuts(updatedShortcuts);
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <PageWrapper>
      <SectionHeader
        title="Préférences admin"
        description="Langue, fuseau horaire, thème, notifications, raccourcis"
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-700">
        {["preferences", "shortcuts"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === tab
                ? "text-purple-400 border-b-2 border-purple-600"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            {tab === "preferences" && "Paramètres"}
            {tab === "shortcuts" && "Raccourcis"}
          </button>
        ))}
      </div>

      {/* Preferences Tab */}
      {activeTab === "preferences" && (
        <div className="space-y-6">
          {/* General Settings */}
          <Card>
            <div className="p-6">
              <h3 className="text-white font-semibold mb-4">Paramètres généraux</h3>
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="block text-gray-400 text-sm font-medium mb-2">
                    Langue
                  </label>
                  <Select
                    value={prefs.language}
                    onChange={(e) =>
                      setPrefs({ ...prefs, language: e.target.value as any })
                    }
                  >
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="de">Deutsch</option>
                  </Select>
                </div>

                <div>
                  <label className="block text-gray-400 text-sm font-medium mb-2">
                    Fuseau horaire
                  </label>
                  <Select
                    value={prefs.timezone}
                    onChange={(e) =>
                      setPrefs({ ...prefs, timezone: e.target.value })
                    }
                  >
                    {timezones.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-gray-400 text-sm font-medium mb-2">
                    Thème
                  </label>
                  <div className="flex gap-2">
                    {["dark", "light", "auto"].map((theme) => (
                      <button
                        key={theme}
                        onClick={() => setPrefs({ ...prefs, theme: theme as any })}
                        className={`flex items-center gap-2 px-4 py-2 rounded border transition-colors ${
                          prefs.theme === theme
                            ? "border-purple-600 bg-purple-600/20 text-purple-300"
                            : "border-gray-700 text-gray-400 hover:border-gray-600"
                        }`}
                      >
                        {theme === "dark" && <Moon className="w-4 h-4" />}
                        {theme === "light" && <Sun className="w-4 h-4" />}
                        {theme === "auto" && <RotateCcw className="w-4 h-4" />}
                        {theme === "dark" && "Sombre"}
                        {theme === "light" && "Clair"}
                        {theme === "auto" && "Auto"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Notifications */}
          <Card>
            <div className="p-6">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <Bell className="w-5 h-5" /> Notifications
              </h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs.notifications_email}
                    onChange={(e) =>
                      setPrefs({
                        ...prefs,
                        notifications_email: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded bg-[#0a0a1a] border-gray-700 text-purple-600 cursor-pointer"
                  />
                  <span className="text-gray-300">Notifications par email</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs.notifications_push}
                    onChange={(e) =>
                      setPrefs({
                        ...prefs,
                        notifications_push: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded bg-[#0a0a1a] border-gray-700 text-purple-600 cursor-pointer"
                  />
                  <span className="text-gray-300">Notifications push</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs.notifications_in_app}
                    onChange={(e) =>
                      setPrefs({
                        ...prefs,
                        notifications_in_app: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded bg-[#0a0a1a] border-gray-700 text-purple-600 cursor-pointer"
                  />
                  <span className="text-gray-300">Notifications dans l'appli</span>
                </label>
              </div>
            </div>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Btn
              variant="primary"
              onClick={handleSavePreferences}
              disabled={saving}
              className="min-w-[200px]"
            >
              <Save className="w-4 h-4" /> Enregistrer les préférences
            </Btn>
          </div>
        </div>
      )}

      {/* Shortcuts Tab */}
      {activeTab === "shortcuts" && (
        <Card>
          <div className="p-6">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Keyboard className="w-5 h-5" /> Raccourcis clavier
            </h3>
            <div className="space-y-3 mb-6">
              {shortcuts.map((shortcut) => (
                <div
                  key={shortcut.id}
                  className="flex items-center justify-between bg-[#0a0a1a] p-4 rounded border border-gray-700"
                >
                  <div className="flex-1">
                    <p className="text-white font-medium">{shortcut.action}</p>
                    <p className="text-gray-400 text-sm">{shortcut.description}</p>
                  </div>

                  {editingShortcut === shortcut.id ? (
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        value={editingKeys}
                        onChange={(v) => setEditingKeys(v)}
                        placeholder="ex: Ctrl+K"
                        className="w-32"
                      />
                      <Btn
                        variant="success"
                        size="sm"
                        onClick={() => {
                          handleUpdateShortcut(shortcut.id, editingKeys);
                          setEditingShortcut(null);
                        }}
                      >
                        OK
                      </Btn>
                      <Btn
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditingShortcut(null)}
                      >
                        Annuler
                      </Btn>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingShortcut(shortcut.id);
                        setEditingKeys(shortcut.keys);
                      }}
                      className="px-3 py-1 rounded border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 text-sm transition-colors"
                    >
                      {shortcut.keys}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <Btn
              variant="primary"
              onClick={handleSaveShortcuts}
              disabled={saving}
            >
              <Save className="w-4 h-4" /> Enregistrer les raccourcis
            </Btn>
          </div>
        </Card>
      )}
    </PageWrapper>
  );
}
