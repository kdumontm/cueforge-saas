"use client";

import { useState, useEffect } from "react";
import { GripVertical, ChevronUp, ChevronDown, Eye, EyeOff, Plus, ExternalLink, Menu, PanelBottom } from "lucide-react";
import {
  Input,
  Toggle,
  Btn,
  Card,
  Badge,
  TabBar,
  PageWrapper,
  SectionHeader,
  LoadingScreen,
  EmptyState,
  useToast,
  PageGuide,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface Page {
  id: number;
  name: string;
  slug: string;
  title: string;
  is_published: boolean;
  show_in_nav: boolean;
  nav_label: string | null;
  sort_order: number;
  layout?: string;
}

const FOOTER_STORAGE_KEY = "cueforge_footer_pages";

export default function NavigationPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("menu");

  const [pages, setPages] = useState<Page[]>([]);
  const [footerPages, setFooterPages] = useState<number[]>([]);
  const [changes, setChanges] = useState<Record<number, Partial<Page>>>({});

  // Load pages on mount
  useEffect(() => {
    const loadPages = async () => {
      try {
        setLoading(true);
        const data = await adminApi.listPages();
        setPages(data || []);

        // Load footer preferences from localStorage
        const stored = localStorage.getItem(FOOTER_STORAGE_KEY);
        if (stored) {
          setFooterPages(JSON.parse(stored));
        }
      } catch (error) {
        toast(error instanceof Error ? error.message : "Erreur de chargement", "error");
      } finally {
        setLoading(false);
      }
    };
    loadPages();
  }, [toast]);

  const handlePageChange = (pageId: number, updates: Partial<Page>) => {
    setChanges((prev) => ({
      ...prev,
      [pageId]: { ...prev[pageId], ...updates },
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Save all page changes
      const promises = Object.entries(changes).map(([pageId, data]) => {
        const saveData: any = {};
        if (data.show_in_nav !== undefined) saveData.show_in_nav = data.show_in_nav;
        if (data.nav_label !== undefined) saveData.nav_label = data.nav_label;
        if (data.sort_order !== undefined) saveData.sort_order = data.sort_order;

        return adminApi.updatePage(parseInt(pageId), saveData);
      });

      await Promise.all(promises);

      // Save footer preferences
      localStorage.setItem(FOOTER_STORAGE_KEY, JSON.stringify(footerPages));

      // Update local state
      setPages((prev) =>
        prev.map((p) =>
          changes[p.id] ? { ...p, ...changes[p.id] } : p
        )
      );

      setChanges({});
      toast("Navigation mise à jour avec succès", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erreur de sauvegarde", "error");
    } finally {
      setSaving(false);
    }
  };

  const movePageOrder = (pageId: number, direction: "up" | "down") => {
    const currentPage = pages.find((p) => p.id === pageId);
    if (!currentPage) return;

    const navPages = pages.filter((p) => p.show_in_nav).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const currentIndex = navPages.findIndex((p) => p.id === pageId);

    if (direction === "up" && currentIndex > 0) {
      const prevPage = navPages[currentIndex - 1];
      const newOrder = currentPage.sort_order || 0;
      const prevOrder = prevPage.sort_order || 0;

      handlePageChange(pageId, { sort_order: prevOrder });
      handlePageChange(prevPage.id, { sort_order: newOrder });

      setPages((prev) => {
        const updated = [...prev];
        const currIdx = updated.findIndex((p) => p.id === pageId);
        const prevIdx = updated.findIndex((p) => p.id === prevPage.id);

        if (currIdx > -1 && prevIdx > -1) {
          [updated[currIdx].sort_order, updated[prevIdx].sort_order] = [
            updated[prevIdx].sort_order,
            updated[currIdx].sort_order,
          ];
        }
        return updated;
      });
    } else if (direction === "down" && currentIndex < navPages.length - 1) {
      const nextPage = navPages[currentIndex + 1];
      const newOrder = currentPage.sort_order || 0;
      const nextOrder = nextPage.sort_order || 0;

      handlePageChange(pageId, { sort_order: nextOrder });
      handlePageChange(nextPage.id, { sort_order: newOrder });

      setPages((prev) => {
        const updated = [...prev];
        const currIdx = updated.findIndex((p) => p.id === pageId);
        const nextIdx = updated.findIndex((p) => p.id === nextPage.id);

        if (currIdx > -1 && nextIdx > -1) {
          [updated[currIdx].sort_order, updated[nextIdx].sort_order] = [
            updated[nextIdx].sort_order,
            updated[currIdx].sort_order,
          ];
        }
        return updated;
      });
    }
  };

  const togglePageInNav = (pageId: number, show: boolean) => {
    handlePageChange(pageId, { show_in_nav: show });
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, show_in_nav: show } : p))
    );
  };

  const togglePageInFooter = (pageId: number, show: boolean) => {
    setFooterPages((prev) => {
      if (show) {
        return [...prev, pageId];
      } else {
        return prev.filter((id) => id !== pageId);
      }
    });
  };

  const updateNavLabel = (pageId: number, label: string) => {
    handlePageChange(pageId, { nav_label: label });
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, nav_label: label } : p))
    );
  };

  if (loading) return <LoadingScreen />;

  const navPages = pages.filter((p) => p.show_in_nav).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const nonNavPages = pages.filter((p) => !p.show_in_nav);
  const publishedPages = pages.filter((p) => p.is_published);

  const tabs = [
    { id: "menu", label: "Menu principal", icon: Menu },
    { id: "footer", label: "Footer", icon: PanelBottom },
  ];

  return (
    <PageWrapper>
      <PageGuide
        id="navigation"
        icon={Menu}
        title="Configuration de la navigation"
        description="Organisez les menus de votre site : menu principal (header) et pied de page (footer). Réorganisez les pages par glisser-déposer et personnalisez les labels affichés."
        steps={[
          { text: "Choisissez l'onglet Menu principal ou Footer" },
          { text: "Activez/désactivez les pages avec les toggles" },
          { text: "Réordonnez les pages avec les flèches haut/bas" },
          { text: "Cliquez sur Sauvegarder pour appliquer" },
        ]}
      />
      <SectionHeader
        title="Gestion de la navigation"
        description="Configurez le menu principal et les liens du footer de votre site."
        actions={
          Object.keys(changes).length > 0 && (
            <Btn variant="primary" onClick={handleSave} loading={saving}>
              Enregistrer les changements
            </Btn>
          )
        }
      />

      <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* MENU PRINCIPAL TAB */}
      {activeTab === "menu" && (
        <div className="space-y-6">
          {/* Pages in nav */}
          <Card className="overflow-hidden">
            <div className="border-b border-border-subtle p-4">
              <h3 className="font-semibold text-text-primary">Pages dans le menu</h3>
              <p className="text-xs text-text-muted mt-1">Glissez-déposez pour réorganiser l'ordre d'affichage</p>
            </div>
            {navPages.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={Menu}
                  title="Aucune page dans le menu"
                  description="Ajoutez des pages au menu principal pour les afficher en haut de votre site."
                />
              </div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {navPages.map((page, idx) => (
                  <div
                    key={page.id}
                    className="p-4 flex items-center gap-3 hover:bg-bg-hover transition-colors group"
                  >
                    {/* Drag handle */}
                    <GripVertical size={16} className="text-text-muted cursor-grab active:cursor-grabbing" />

                    {/* Page info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          value={
                            changes[page.id]?.nav_label !== undefined
                              ? changes[page.id].nav_label || ""
                              : page.nav_label || page.name
                          }
                          onChange={(e) => updateNavLabel(page.id, e.target.value)}
                          className="flex-1 px-2 py-1 rounded-md border border-border-default bg-bg-secondary text-text-primary text-sm outline-none focus:border-accent"
                          placeholder="Label du menu"
                        />
                        {page.is_published ? (
                          <Badge variant="success">Publié</Badge>
                        ) : (
                          <Badge variant="warning">Brouillon</Badge>
                        )}
                      </div>
                      <p className="text-xs text-text-muted font-mono">{page.slug}</p>
                    </div>

                    {/* Move buttons */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Btn
                        small
                        variant="ghost"
                        icon={ChevronUp}
                        onClick={() => movePageOrder(page.id, "up")}
                        disabled={idx === 0}
                      />
                      <Btn
                        small
                        variant="ghost"
                        icon={ChevronDown}
                        onClick={() => movePageOrder(page.id, "down")}
                        disabled={idx === navPages.length - 1}
                      />
                    </div>

                    {/* Toggle show in nav */}
                    <Toggle
                      on={true}
                      onToggle={() => togglePageInNav(page.id, false)}
                      disabled={false}
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Pages not in nav */}
          {nonNavPages.length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b border-border-subtle p-4">
                <h3 className="font-semibold text-text-primary">Pages disponibles</h3>
                <p className="text-xs text-text-muted mt-1">Cliquez sur + pour ajouter au menu</p>
              </div>
              <div className="divide-y divide-border-subtle">
                {nonNavPages.map((page) => (
                  <div
                    key={page.id}
                    className="p-4 flex items-center gap-3 hover:bg-bg-hover transition-colors"
                  >
                    {/* Page info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-text-primary text-sm">{page.name}</span>
                        {page.is_published ? (
                          <Badge variant="success">Publié</Badge>
                        ) : (
                          <Badge variant="warning">Brouillon</Badge>
                        )}
                      </div>
                      <p className="text-xs text-text-muted font-mono">{page.slug}</p>
                    </div>

                    {/* Add to nav button */}
                    <Btn
                      small
                      variant="primary"
                      icon={Plus}
                      onClick={() => togglePageInNav(page.id, true)}
                    >
                      Ajouter
                    </Btn>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Navigation preview */}
          <Card className="p-4">
            <h3 className="font-semibold text-text-primary text-sm mb-3">Aperçu du menu</h3>
            <div className="flex items-center gap-2 p-3 bg-bg-secondary rounded-lg border border-border-subtle overflow-x-auto">
              {navPages.map((page) => (
                <span
                  key={page.id}
                  className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-bg-hover rounded-md whitespace-nowrap"
                >
                  {page.nav_label || page.name}
                </span>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* FOOTER TAB */}
      {activeTab === "footer" && (
        <div className="space-y-6">
          {/* Footer links */}
          <Card className="overflow-hidden">
            <div className="border-b border-border-subtle p-4">
              <h3 className="font-semibold text-text-primary">Liens du footer</h3>
              <p className="text-xs text-text-muted mt-1">Sélectionnez les pages à afficher dans le footer</p>
            </div>
            {publishedPages.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={PanelBottom}
                  title="Aucune page publiée"
                  description="Publiez des pages pour les afficher dans le footer."
                />
              </div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {publishedPages.map((page) => (
                  <div
                    key={page.id}
                    className="p-4 flex items-center gap-3 hover:bg-bg-hover transition-colors"
                  >
                    {/* Page info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-text-primary text-sm">{page.name}</span>
                        <Badge variant="success">Publié</Badge>
                      </div>
                      <p className="text-xs text-text-muted font-mono">{page.slug}</p>
                    </div>

                    {/* Toggle show in footer */}
                    <Toggle
                      on={footerPages.includes(page.id)}
                      onToggle={() => togglePageInFooter(page.id, !footerPages.includes(page.id))}
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Footer text info */}
          <Card className="p-4 bg-bg-elevated border border-border-subtle">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h4 className="font-semibold text-text-primary text-sm mb-1">Texte du footer</h4>
                <p className="text-xs text-text-muted mb-3">
                  Modifiez le texte personnalisé du footer dans les paramètres du site.
                </p>
              </div>
              <Btn
                small
                variant="default"
                icon={ExternalLink}
                onClick={() => window.location.href = "/admin/settings"}
              >
                Paramètres
              </Btn>
            </div>
          </Card>

          {/* Footer preview */}
          <Card className="p-4">
            <h3 className="font-semibold text-text-primary text-sm mb-3">Aperçu du footer</h3>
            <div className="p-4 bg-bg-secondary rounded-lg border border-border-subtle space-y-2">
              {footerPages.length === 0 ? (
                <p className="text-xs text-text-muted italic">Aucun lien dans le footer</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {pages
                    .filter((p) => footerPages.includes(p.id))
                    .map((page) => (
                      <a
                        key={page.id}
                        href="#"
                        onClick={(e) => e.preventDefault()}
                        className="text-xs text-accent hover:underline font-medium"
                      >
                        {page.name}
                      </a>
                    ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </PageWrapper>
  );
}
