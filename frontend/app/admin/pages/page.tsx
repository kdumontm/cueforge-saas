"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Input,
  Select,
  Btn,
  Card,
  Badge,
  Toggle,
  PageWrapper,
  SectionHeader,
  LoadingScreen,
  EmptyState,
  ConfirmModal,
  useToast,
  PageGuide,
} from "../_components/shared";
import { adminApi } from "../_components/api";
import { Plus, Trash2, FileText, Edit2, Globe, Lock } from "lucide-react";

interface Page {
  id: number;
  name: string;
  slug: string;
  title: string;
  description?: string;
  layout: "default" | "full-width" | "sidebar";
  is_published: boolean;
  show_in_nav: boolean;
  nav_label?: string;
  created_at: string;
  updated_at: string;
  sections_count?: number;
}

const LAYOUT_OPTIONS = [
  { value: "default", label: "Par défaut" },
  { value: "full-width", label: "Pleine largeur" },
  { value: "sidebar", label: "Avec barre latérale" },
];

const SYSTEM_PAGES = ["home", "pricing", "features"];

export default function PagesListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);

  // Form state for adding new page
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newLayout, setNewLayout] = useState("default");
  const [newShowInNav, setNewShowInNav] = useState(true);
  const [newNavLabel, setNewNavLabel] = useState("");

  // Load pages
  useEffect(() => {
    loadPages();
  }, []);

  async function loadPages() {
    try {
      setLoading(true);
      const data = await adminApi.listPages();
      setPages(Array.isArray(data) ? data : data.items || []);
    } catch (err: any) {
      toast(err.message || "Erreur lors du chargement des pages", "error");
    } finally {
      setLoading(false);
    }
  }

  // Auto-generate slug from name
  function generateSlug(text: string) {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");
  }

  // Add new page
  async function addPage() {
    if (!newName.trim()) {
      toast("Entrez le nom de la page", "error");
      return;
    }
    if (!newSlug.trim()) {
      toast("Entrez le slug", "error");
      return;
    }
    if (!newTitle.trim()) {
      toast("Entrez le titre", "error");
      return;
    }

    try {
      setSaving(true);
      await adminApi.createPage({
        name: newName.trim(),
        slug: newSlug.trim(),
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        layout: newLayout,
        show_in_nav: newShowInNav,
        nav_label: newNavLabel.trim() || null,
      });
      toast("Page créée avec succès", "success");
      setShowAddModal(false);
      resetForm();
      await loadPages();
    } catch (err: any) {
      toast(err.message || "Erreur lors de la création", "error");
    } finally {
      setSaving(false);
    }
  }

  // Toggle publish status
  async function togglePublish(page: Page) {
    try {
      setSaving(true);
      await adminApi.publishPage(page.id);
      toast(
        page.is_published
          ? "Page dépubliée avec succès"
          : "Page publiée avec succès",
        "success"
      );
      await loadPages();
    } catch (err: any) {
      toast(err.message || "Erreur lors de la mise à jour", "error");
    } finally {
      setSaving(false);
    }
  }

  // Delete page
  async function deletePage() {
    if (!selectedPage) return;
    try {
      setSaving(true);
      await adminApi.deletePage(selectedPage.id);
      toast("Page supprimée avec succès", "success");
      setShowDeleteConfirm(false);
      setSelectedPage(null);
      await loadPages();
    } catch (err: any) {
      toast(err.message || "Erreur lors de la suppression", "error");
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setNewName("");
    setNewSlug("");
    setNewTitle("");
    setNewDescription("");
    setNewLayout("default");
    setNewShowInNav(true);
    setNewNavLabel("");
  }

  function openDeleteConfirm(page: Page) {
    if (SYSTEM_PAGES.includes(page.slug)) {
      toast("Les pages système ne peuvent pas être supprimées", "error");
      return;
    }
    setSelectedPage(page);
    setShowDeleteConfirm(true);
  }

  function openEditor(page: Page) {
    router.push(`/admin/pages/editor?id=${page.id}`);
  }

  return (
    <PageWrapper>
      <PageGuide
        id="pages-cms"
        icon={FileText}
        title="Gestionnaire de pages CMS"
        description="Créez et gérez les pages de contenu de votre site (landing pages, mentions légales, FAQ…). Chaque page a un slug unique utilisé pour l'URL."
        steps={[
          { text: "Cliquez sur « Créer une page » pour ajouter du contenu" },
          { text: "Utilisez l'éditeur visuel pour organiser sections et composants" },
          { text: "Publiez la page quand elle est prête — elle sera accessible publiquement" },
        ]}
      />
      <SectionHeader
        title="Pages du site"
        description="Gérez les pages et leur contenu avec l'éditeur visuel"
        actions={
          <Btn
            variant="primary"
            icon={Plus}
            onClick={() => setShowAddModal(true)}
            small
          >
            Créer une page
          </Btn>
        }
      />

      {loading ? (
        <LoadingScreen />
      ) : pages.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucune page"
          description="Aucune page n'existe. Commencez par en créer une."
          action={
            <Btn
              variant="primary"
              icon={Plus}
              onClick={() => setShowAddModal(true)}
              small
            >
              Créer une page
            </Btn>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pages.map((page) => (
            <Card key={page.id} className="p-5 flex flex-col">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-text-primary truncate">
                    {page.name}
                  </h3>
                  <p className="text-xs text-text-muted font-mono truncate">
                    /{page.slug}
                  </p>
                </div>
                {SYSTEM_PAGES.includes(page.slug) && (
                  <Lock size={14} className="text-text-muted ml-2 flex-shrink-0" />
                )}
              </div>

              {/* Status badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant={page.is_published ? "success" : "warning"}>
                  {page.is_published ? "Publiée" : "Brouillon"}
                </Badge>
                <Badge variant="info">{page.layout}</Badge>
                {page.show_in_nav && <Badge variant="default">Nav</Badge>}
              </div>

              {/* Description */}
              <p className="text-xs text-text-muted mb-3 line-clamp-2 flex-1">
                {page.description || "Pas de description"}
              </p>

              {/* Meta info */}
              <div className="text-[10px] text-text-muted mb-4 pb-3 border-t border-border-subtle pt-3">
                <div className="flex justify-between mb-1">
                  <span>Sections:</span>
                  <strong className="font-mono">{page.sections_count || 0}</strong>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Btn
                  variant="primary"
                  icon={Edit2}
                  onClick={() => openEditor(page)}
                  small
                  className="flex-1"
                >
                  Éditer
                </Btn>
                <Btn
                  variant={page.is_published ? "warning" : "success"}
                  icon={Globe}
                  onClick={() => togglePublish(page)}
                  small
                  disabled={saving}
                />
                <Btn
                  variant="danger"
                  icon={Trash2}
                  small
                  onClick={() => openDeleteConfirm(page)}
                  disabled={saving || SYSTEM_PAGES.includes(page.slug)}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Page Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-text-primary mb-4">
              Créer une nouvelle page
            </h3>

            <div className="space-y-4 mb-6">
              <Input
                label="Nom de la page"
                value={newName}
                onChange={(v) => {
                  setNewName(v);
                  if (!newSlug) setNewSlug(generateSlug(v));
                }}
                placeholder="ex: À propos"
              />

              <Input
                label="Slug"
                value={newSlug}
                onChange={setNewSlug}
                placeholder="ex: about"
                hint="URL-friendly identifier"
              />

              <Input
                label="Titre (page)"
                value={newTitle}
                onChange={setNewTitle}
                placeholder="ex: À propos de TrackCue"
              />

              <Input
                label="Description"
                value={newDescription}
                onChange={setNewDescription}
                placeholder="Description courte de la page"
                multiline
                rows={2}
              />

              <Select
                label="Type de mise en page"
                value={newLayout}
                onChange={setNewLayout}
                options={LAYOUT_OPTIONS}
              />

              <div className="p-3 bg-bg-secondary rounded-lg border border-border-subtle">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                    Afficher dans la navigation
                  </label>
                  <input
                    type="checkbox"
                    checked={newShowInNav}
                    onChange={(e) => setNewShowInNav(e.target.checked)}
                    className="w-4 h-4 cursor-pointer"
                  />
                </div>
              </div>

              {newShowInNav && (
                <Input
                  label="Label de navigation"
                  value={newNavLabel}
                  onChange={setNewNavLabel}
                  placeholder="Texte affiché dans le menu"
                  hint="Laissez vide pour utiliser le nom"
                />
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Btn
                variant="default"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                disabled={saving}
              >
                Annuler
              </Btn>
              <Btn
                variant="primary"
                onClick={addPage}
                loading={saving}
              >
                Créer la page
              </Btn>
            </div>
          </Card>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        open={showDeleteConfirm}
        title="Supprimer la page"
        message={`Êtes-vous sûr de vouloir supprimer "${selectedPage?.name}" ? Cette action supprimera aussi tous ses contenus et est irréversible.`}
        onConfirm={deletePage}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setSelectedPage(null);
        }}
        variant="danger"
      />
    </PageWrapper>
  );
}
