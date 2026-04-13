"use client";

import { useEffect, useState } from "react";
import {
  Plus, Trash2, Edit2, Download, Upload, Check, X, Globe, FileText,
  Save, Loader, Eye, EyeOff
} from "lucide-react";
import { Card, Badge, PageWrapper, LoadingScreen } from "../_components/shared";
import { adminApi } from "../_components/api";

interface Locale {
  id: number;
  code: string;
  name: string;
  completion_percent: number;
  is_enabled: boolean;
  is_default: boolean;
}

interface Translation {
  id: number;
  locale_id: number;
  namespace: string;
  key: string;
  value: string;
  reviewed: boolean;
  created_at: string;
}

export default function TranslationsPage() {
  const [tab, setTab] = useState<"locales" | "translations">("locales");
  const [loading, setLoading] = useState(true);
  const [locales, setLocales] = useState<Locale[]>([]);
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [stats, setStats] = useState<any>(null);

  // Filters
  const [selectedLocale, setSelectedLocale] = useState("");
  const [selectedNamespace, setSelectedNamespace] = useState("");
  const [searchKey, setSearchKey] = useState("");

  // Forms
  const [showCreateLocale, setShowCreateLocale] = useState(false);
  const [newLocale, setNewLocale] = useState({ code: "", name: "" });
  const [editingTranslation, setEditingTranslation] = useState<Partial<Translation> | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [localesData, statsData, namespacesData] = await Promise.all([
        adminApi.getLocales(),
        adminApi.getTranslationStats(),
        adminApi.getTranslationNamespaces(),
      ]);
      setLocales(localesData);
      setStats(statsData);
      setNamespaces(namespacesData);
      if (localesData.length > 0 && !selectedLocale) {
        setSelectedLocale(localesData[0].id.toString());
      }
    } catch (err) {
      console.error("Erreur chargement traductions:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadTranslations = async () => {
    if (!selectedLocale) return;
    try {
      const data = await adminApi.getTranslations({
        locale_id: parseInt(selectedLocale),
        namespace: selectedNamespace || undefined,
        search: searchKey || undefined,
      });
      setTranslations(data);
    } catch (err) {
      console.error("Erreur chargement traductions:", err);
    }
  };

  useEffect(() => {
    if (tab === "translations") {
      loadTranslations();
    }
  }, [tab, selectedLocale, selectedNamespace, searchKey]);

  const handleCreateLocale = async () => {
    if (!newLocale.code || !newLocale.name) return;
    try {
      await adminApi.createLocale(newLocale);
      setNewLocale({ code: "", name: "" });
      setShowCreateLocale(false);
      loadData();
    } catch (err) {
      console.error("Erreur création locale:", err);
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await adminApi.setDefaultLocale(id);
      loadData();
    } catch (err) {
      console.error("Erreur:", err);
    }
  };

  const handleToggleLocale = async (id: number) => {
    try {
      const locale = locales.find(l => l.id === id);
      if (locale) {
        await adminApi.updateLocale(id, { is_enabled: !locale.is_enabled });
        loadData();
      }
    } catch (err) {
      console.error("Erreur:", err);
    }
  };

  const handleDeleteLocale = async (id: number) => {
    if (window.confirm("Confirmer la suppression de cette locale ?")) {
      try {
        await adminApi.deleteLocale(id);
        loadData();
      } catch (err) {
        console.error("Erreur:", err);
      }
    }
  };

  const handleSaveTranslation = async (translation: Translation) => {
    if (!editingTranslation) return;
    try {
      await adminApi.updateTranslation(translation.id, editingTranslation);
      setEditingTranslation(null);
      loadTranslations();
    } catch (err) {
      console.error("Erreur mise à jour:", err);
    }
  };

  const handleDeleteTranslation = async (id: number) => {
    if (window.confirm("Confirmer la suppression ?")) {
      try {
        await adminApi.deleteTranslation(id);
        loadTranslations();
      } catch (err) {
        console.error("Erreur:", err);
      }
    }
  };

  const handleExport = async () => {
    if (!selectedLocale) return;
    try {
      const data = await adminApi.exportTranslations(selectedLocale);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `translations-${selectedLocale}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Erreur export:", err);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || !selectedLocale) return;
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        await adminApi.importTranslations({ locale_id: selectedLocale, data });
        loadTranslations();
      } catch (err) {
        console.error("Erreur import:", err);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsText(file);
  };

  if (loading && locales.length === 0) return <LoadingScreen />;

  return (
    <PageWrapper title="Traductions i18n">
      {/* Tabs */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setTab("locales")}
          className={`px-6 py-3 rounded font-medium transition ${
            tab === "locales"
              ? "bg-purple-600 text-white"
              : "bg-[#1a1a2e] text-text-muted hover:text-white"
          }`}
        >
          <Globe className="inline mr-2" size={18} />
          Locales
        </button>
        <button
          onClick={() => setTab("translations")}
          className={`px-6 py-3 rounded font-medium transition ${
            tab === "translations"
              ? "bg-purple-600 text-white"
              : "bg-[#1a1a2e] text-text-muted hover:text-white"
          }`}
        >
          <FileText className="inline mr-2" size={18} />
          Traductions
        </button>
      </div>

      {/* LOCALES TAB */}
      {tab === "locales" && (
        <>
          <div className="mb-6 flex justify-between items-center">
            <div className="text-sm text-text-muted">
              {stats && `Total: ${stats.total_locales} | Complètes: ${stats.complete_locales}`}
            </div>
            <button
              onClick={() => setShowCreateLocale(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium transition flex items-center gap-2"
            >
              <Plus size={18} /> Nouvelle locale
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {locales.map((locale) => (
              <Card key={locale.id} className="p-6 bg-[#0a0a1a] border-[#2a2a4a]">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{locale.name}</h3>
                    <p className="text-sm text-text-muted">{locale.code}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleLocale(locale.id)}
                      className={`p-2 rounded transition ${
                        locale.is_enabled
                          ? "bg-green-900/30 text-green-400 hover:bg-green-900/50"
                          : "bg-gray-900/30 text-gray-400 hover:bg-gray-900/50"
                      }`}
                      title={locale.is_enabled ? "Actif" : "Inactif"}
                    >
                      {locale.is_enabled ? <Eye size={18} /> : <EyeOff size={18} />}
                    </button>
                    <button
                      onClick={() => handleDeleteLocale(locale.id)}
                      className="p-2 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 transition"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-text-muted">Complétude</span>
                    <span className="text-sm font-bold text-white">{locale.completion_percent}%</span>
                  </div>
                  <div className="w-full bg-[#1a1a2e] rounded-full h-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full transition-all"
                      style={{ width: `${locale.completion_percent}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  {locale.is_default && (
                    <Badge className="bg-purple-900 text-purple-100">Défaut</Badge>
                  )}
                  <button
                    onClick={() => handleSetDefault(locale.id)}
                    disabled={locale.is_default}
                    className="w-full px-3 py-2 bg-[#1a1a2e] hover:bg-[#2a2a4a] text-white rounded text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Définir par défaut
                  </button>
                </div>
              </Card>
            ))}
          </div>

          {showCreateLocale && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <Card className="bg-[#0a0a1a] border-[#2a2a4a] max-w-md w-full p-6">
                <h2 className="text-xl font-bold text-white mb-6">Nouvelle locale</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-2">Code (ex: fr-FR)</label>
                    <input
                      type="text"
                      value={newLocale.code}
                      onChange={(e) => setNewLocale({ ...newLocale, code: e.target.value })}
                      className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600"
                      placeholder="en-US"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-2">Nom</label>
                    <input
                      type="text"
                      value={newLocale.name}
                      onChange={(e) => setNewLocale({ ...newLocale, name: e.target.value })}
                      className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600"
                      placeholder="English (USA)"
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-6 pt-6 border-t border-[#2a2a4a]">
                  <button
                    onClick={() => setShowCreateLocale(false)}
                    className="flex-1 px-4 py-2 bg-[#2a2a4a] hover:bg-[#3a3a4a] text-white rounded font-medium transition"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleCreateLocale}
                    className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium transition"
                  >
                    Créer
                  </button>
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {/* TRANSLATIONS TAB */}
      {tab === "translations" && (
        <>
          <div className="flex gap-4 mb-6 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-text-muted mb-2">Locale</label>
              <select
                value={selectedLocale}
                onChange={(e) => setSelectedLocale(e.target.value)}
                className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600"
              >
                {locales.map((l) => (
                  <option key={l.id} value={l.id.toString()}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-text-muted mb-2">Namespace</label>
              <select
                value={selectedNamespace}
                onChange={(e) => setSelectedNamespace(e.target.value)}
                className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600"
              >
                <option value="">Tous</option>
                {namespaces.map((ns) => (
                  <option key={ns} value={ns}>
                    {ns}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-text-muted mb-2">Recherche</label>
              <input
                type="text"
                value={searchKey}
                onChange={(e) => setSearchKey(e.target.value)}
                placeholder="Clé, valeur..."
                className="w-full px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-white rounded focus:outline-none focus:border-purple-600"
              />
            </div>
            <div className="flex gap-2 items-end">
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-[#2a2a4a] hover:bg-[#3a3a4a] text-white rounded font-medium transition flex items-center gap-2"
              >
                <Download size={18} /> Exporter
              </button>
              <label className="px-4 py-2 bg-[#2a2a4a] hover:bg-[#3a3a4a] text-white rounded font-medium transition cursor-pointer flex items-center gap-2">
                <Upload size={18} /> Importer
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>
          </div>

          <Card className="p-6 bg-[#0a0a1a] border-[#2a2a4a] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a4a]">
                  <th className="text-left py-3 px-4 text-text-muted font-medium">Namespace</th>
                  <th className="text-left py-3 px-4 text-text-muted font-medium">Clé</th>
                  <th className="text-left py-3 px-4 text-text-muted font-medium">Valeur</th>
                  <th className="text-left py-3 px-4 text-text-muted font-medium">Révisé</th>
                  <th className="text-left py-3 px-4 text-text-muted font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {translations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-text-muted">
                      Aucune traduction trouvée
                    </td>
                  </tr>
                ) : (
                  translations.map((t) => (
                    <tr key={t.id} className="border-b border-[#1a1a2e] hover:bg-[#1a1a2e]/50 transition">
                      <td className="py-3 px-4 text-text-muted text-xs">{t.namespace}</td>
                      <td className="py-3 px-4 text-white font-mono text-xs">{t.key}</td>
                      <td className="py-3 px-4 text-white max-w-xs truncate">
                        {editingTranslation?.id === t.id ? (
                          <input
                            type="text"
                            value={editingTranslation.value || ""}
                            onChange={(e) =>
                              setEditingTranslation({ ...editingTranslation, value: e.target.value })
                            }
                            className="w-full px-2 py-1 bg-[#1a1a2e] border border-purple-600 text-white rounded text-sm focus:outline-none"
                          />
                        ) : (
                          t.value
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {t.reviewed ? (
                          <Check size={18} className="text-green-400" />
                        ) : (
                          <X size={18} className="text-gray-500" />
                        )}
                      </td>
                      <td className="py-3 px-4 flex gap-2">
                        {editingTranslation?.id === t.id ? (
                          <>
                            <button
                              onClick={() => handleSaveTranslation(t)}
                              className="text-green-400 hover:text-green-300 transition"
                            >
                              <Save size={16} />
                            </button>
                            <button
                              onClick={() => setEditingTranslation(null)}
                              className="text-gray-400 hover:text-gray-300 transition"
                            >
                              <X size={16} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditingTranslation({ ...t })}
                              className="text-purple-400 hover:text-purple-300 transition"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteTranslation(t.id)}
                              className="text-red-400 hover:text-red-300 transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </PageWrapper>
  );
}
