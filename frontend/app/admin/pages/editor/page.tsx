"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Input,
  Select,
  Btn,
  Card,
  Badge,
  Toggle,
  ColorPicker,
  PageWrapper,
  SectionHeader,
  LoadingScreen,
  ConfirmModal,
  useToast,
  TabBar,
} from "../../_components/shared";
import { adminApi } from "../../_components/api";
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  Save,
  Globe,
  ArrowLeft,
  Settings,
  Eye,
  EyeOff,
} from "lucide-react";

// Types
interface Component {
  id: number;
  section_id: number;
  component_type: string;
  content: Record<string, any>;
  custom_css_class?: string;
  grid_column?: string;
  is_visible: boolean;
  sort_order: number;
}

interface Section {
  id: number;
  page_id: number;
  section_type: string;
  sort_order: number;
  is_visible: boolean;
  background_color?: string;
  padding_top?: string;
  padding_bottom?: string;
  max_width?: string;
  custom_css_class?: string;
  settings?: Record<string, any>;
  components: Component[];
}

interface Page {
  id: number;
  name: string;
  slug: string;
  title: string;
  description?: string;
  meta_title?: string;
  meta_description?: string;
  layout: "default" | "full-width" | "sidebar";
  is_published: boolean;
  sections: Section[];
  created_at: string;
  updated_at: string;
}

const SECTION_TYPES = [
  "hero",
  "features",
  "pricing",
  "cta",
  "testimonials",
  "faq",
  "stats",
  "text",
  "image-text",
  "gallery",
  "custom",
];

const COMPONENT_TYPES = [
  "heading",
  "text",
  "image",
  "button",
  "card",
  "pricing-card",
  "feature-item",
  "testimonial",
  "faq-item",
  "divider",
  "spacer",
  "custom-html",
];

const LAYOUT_OPTIONS = [
  { value: "default", label: "Par défaut" },
  { value: "full-width", label: "Pleine largeur" },
  { value: "sidebar", label: "Avec barre latérale" },
];

export default function PageEditorWrapper() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <PageEditorPage />
    </Suspense>
  );
}

function PageEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const pageId = parseInt(searchParams.get("id") || "0");

  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("settings");

  // Editor state
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    new Set()
  );
  const [expandedComponents, setExpandedComponents] = useState<Set<number>>(
    new Set()
  );
  const [selectedComponentId, setSelectedComponentId] = useState<number | null>(
    null
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "section" | "component";
    id: number;
  } | null>(null);

  // Preview refs
  const previewRef = useRef<HTMLDivElement>(null);

  // Load page
  useEffect(() => {
    if (pageId) {
      loadPage();
    }
  }, [pageId]);

  async function loadPage() {
    try {
      setLoading(true);
      const data = await adminApi.getPage(pageId);
      setPage(data);
    } catch (err: any) {
      toast(err.message || "Erreur lors du chargement de la page", "error");
    } finally {
      setLoading(false);
    }
  }

  // Save page
  async function savePage() {
    if (!page) return;
    try {
      setSaving(true);
      await adminApi.updatePage(pageId, {
        name: page.name,
        slug: page.slug,
        title: page.title,
        description: page.description,
        meta_title: page.meta_title,
        meta_description: page.meta_description,
        layout: page.layout,
        is_published: page.is_published,
      });
      toast("Page sauvegardée avec succès", "success");
    } catch (err: any) {
      toast(err.message || "Erreur lors de la sauvegarde", "error");
    } finally {
      setSaving(false);
    }
  }

  // Toggle publish
  async function togglePublish() {
    if (!page) return;
    try {
      setSaving(true);
      await adminApi.publishPage(pageId);
      setPage({ ...page, is_published: !page.is_published });
      toast(
        page.is_published
          ? "Page dépubliée avec succès"
          : "Page publiée avec succès",
        "success"
      );
    } catch (err: any) {
      toast(err.message || "Erreur lors de la publication", "error");
    } finally {
      setSaving(false);
    }
  }

  // Section operations
  async function updateSection(sectionId: number, updates: Partial<Section>) {
    if (!page) return;
    try {
      await adminApi.updateSection(sectionId, updates);
      const updatedSections = page.sections.map((s) =>
        s.id === sectionId ? { ...s, ...updates } : s
      );
      setPage({ ...page, sections: updatedSections });
      toast("Section mise à jour", "success");
    } catch (err: any) {
      toast(err.message || "Erreur lors de la mise à jour", "error");
    }
  }

  async function deleteSection(sectionId: number) {
    if (!page) return;
    try {
      setSaving(true);
      await adminApi.deleteSection(sectionId);
      setPage({
        ...page,
        sections: page.sections.filter((s) => s.id !== sectionId),
      });
      toast("Section supprimée avec succès", "success");
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    } catch (err: any) {
      toast(err.message || "Erreur lors de la suppression", "error");
    } finally {
      setSaving(false);
    }
  }

  // Component operations
  async function updateComponent(
    componentId: number,
    updates: Partial<Component>
  ) {
    if (!page) return;
    try {
      await adminApi.updateComponent(componentId, updates);
      const updatedSections = page.sections.map((s) => ({
        ...s,
        components: s.components.map((c) =>
          c.id === componentId ? { ...c, ...updates } : c
        ),
      }));
      setPage({ ...page, sections: updatedSections });
      toast("Composant mis à jour", "success");
    } catch (err: any) {
      toast(err.message || "Erreur lors de la mise à jour", "error");
    }
  }

  async function deleteComponent(componentId: number) {
    if (!page) return;
    try {
      setSaving(true);
      await adminApi.deleteComponent(componentId);
      const updatedSections = page.sections.map((s) => ({
        ...s,
        components: s.components.filter((c) => c.id !== componentId),
      }));
      setPage({ ...page, sections: updatedSections });
      toast("Composant supprimé avec succès", "success");
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    } catch (err: any) {
      toast(err.message || "Erreur lors de la suppression", "error");
    } finally {
      setSaving(false);
    }
  }

  async function addSection() {
    if (!page) return;
    try {
      const newSection = await adminApi.createSection({
        page_id: pageId,
        section_type: "text",
        sort_order: (page.sections?.length || 0) + 1,
        is_visible: true,
        background_color: "#ffffff",
        padding_top: "py-10",
        padding_bottom: "pb-10",
        max_width: "100%",
      });
      setPage({
        ...page,
        sections: [...(page.sections || []), newSection],
      });
      toast("Section créée avec succès", "success");
    } catch (err: any) {
      toast(err.message || "Erreur lors de la création", "error");
    }
  }

  async function addComponent(sectionId: number) {
    if (!page) return;
    try {
      const section = page.sections.find((s) => s.id === sectionId);
      if (!section) return;

      const newComponent = await adminApi.createComponent({
        section_id: sectionId,
        component_type: "text",
        content: { text: "Nouveau contenu" },
        sort_order: (section.components?.length || 0) + 1,
        is_visible: true,
      });

      const updatedSections = page.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              components: [...(s.components || []), newComponent],
            }
          : s
      );
      setPage({ ...page, sections: updatedSections });
      toast("Composant créé avec succès", "success");
    } catch (err: any) {
      toast(err.message || "Erreur lors de la création", "error");
    }
  }

  if (loading) return <LoadingScreen />;
  if (!page) return <PageWrapper><div className="text-text-muted">Page non trouvée</div></PageWrapper>;

  return (
    <PageWrapper className="p-0">
      {/* Toolbar */}
      <div className="sticky top-0 z-40 bg-bg-card border-b border-border-subtle p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Btn
            variant="ghost"
            icon={ArrowLeft}
            onClick={() => router.back()}
            small
          />
          <div>
            <h2 className="font-bold text-text-primary">{page.name}</h2>
            <p className="text-[11px] text-text-muted">/{page.slug}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={page.is_published ? "success" : "warning"}>
            {page.is_published ? "Publiée" : "Brouillon"}
          </Badge>
          <Btn
            variant={page.is_published ? "warning" : "success"}
            icon={Globe}
            onClick={togglePublish}
            small
            loading={saving}
          >
            {page.is_published ? "Dépublier" : "Publier"}
          </Btn>
          <Btn
            variant="primary"
            icon={Save}
            onClick={savePage}
            small
            loading={saving}
          >
            Enregistrer
          </Btn>
        </div>
      </div>

      {/* Main Layout - Two Panels */}
      <div className="flex flex-col lg:flex-row min-h-screen">
        {/* Left Panel - Editor (60%) */}
        <div className="w-full lg:w-3/5 border-r border-border-subtle p-6 overflow-y-auto max-h-[calc(100vh-80px)]">
          <TabBar
            tabs={[
              { id: "settings", label: "Paramètres", icon: Settings },
              { id: "sections", label: "Sections" },
            ]}
            active={activeTab}
            onChange={setActiveTab}
          />

          {/* Page Settings Tab */}
          {activeTab === "settings" && (
            <div className="space-y-6">
              <Card className="p-5">
                <h3 className="font-bold text-text-primary mb-4">
                  Paramètres de la page
                </h3>
                <div className="space-y-4">
                  <Input
                    label="Nom interne"
                    value={page.name}
                    onChange={(v) => setPage({ ...page, name: v })}
                  />
                  <Input
                    label="Slug"
                    value={page.slug}
                    onChange={(v) => setPage({ ...page, slug: v })}
                    hint="URL-friendly identifier"
                  />
                  <Input
                    label="Titre de la page"
                    value={page.title}
                    onChange={(v) => setPage({ ...page, title: v })}
                  />
                  <Input
                    label="Description"
                    value={page.description || ""}
                    onChange={(v) => setPage({ ...page, description: v })}
                    multiline
                    rows={2}
                  />
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="font-bold text-text-primary mb-4">
                  Paramètres SEO
                </h3>
                <div className="space-y-4">
                  <Input
                    label="Meta Title"
                    value={page.meta_title || ""}
                    onChange={(v) => setPage({ ...page, meta_title: v })}
                    hint="Titre affiché dans les résultats de recherche"
                  />
                  <Input
                    label="Meta Description"
                    value={page.meta_description || ""}
                    onChange={(v) => setPage({ ...page, meta_description: v })}
                    multiline
                    rows={2}
                    hint="Description affichée dans les résultats"
                  />
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="font-bold text-text-primary mb-4">
                  Mise en page
                </h3>
                <Select
                  label="Type de mise en page"
                  value={page.layout}
                  onChange={(v) =>
                    setPage({ ...page, layout: v as any })
                  }
                  options={LAYOUT_OPTIONS}
                />
              </Card>
            </div>
          )}

          {/* Sections Tab */}
          {activeTab === "sections" && (
            <div className="space-y-4">
              <Btn
                variant="primary"
                icon={Plus}
                onClick={addSection}
                small
                className="w-full"
              >
                Ajouter une section
              </Btn>

              {page.sections && page.sections.length > 0 ? (
                page.sections.map((section) => (
                  <SectionEditor
                    key={section.id}
                    section={section}
                    isExpanded={expandedSections.has(section.id)}
                    onToggleExpand={() => {
                      const newSet = new Set(expandedSections);
                      if (newSet.has(section.id)) {
                        newSet.delete(section.id);
                      } else {
                        newSet.add(section.id);
                      }
                      setExpandedSections(newSet);
                    }}
                    onUpdate={updateSection}
                    onDelete={(id) => {
                      setDeleteTarget({ type: "section", id });
                      setShowDeleteConfirm(true);
                    }}
                    onAddComponent={addComponent}
                    onUpdateComponent={updateComponent}
                    onDeleteComponent={(id) => {
                      setDeleteTarget({ type: "component", id });
                      setShowDeleteConfirm(true);
                    }}
                    expandedComponents={expandedComponents}
                    onToggleComponentExpand={(id) => {
                      const newSet = new Set(expandedComponents);
                      if (newSet.has(id)) {
                        newSet.delete(id);
                      } else {
                        newSet.add(id);
                      }
                      setExpandedComponents(newSet);
                    }}
                    selectedComponentId={selectedComponentId}
                    onSelectComponent={setSelectedComponentId}
                  />
                ))
              ) : (
                <Card className="p-8 text-center">
                  <p className="text-sm text-text-muted">
                    Aucune section. Commencez par en ajouter une.
                  </p>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Right Panel - Live Preview (40%) */}
        <div className="w-full lg:w-2/5 bg-bg-secondary p-6 overflow-y-auto max-h-[calc(100vh-80px)]">
          <div className="mb-4">
            <h3 className="font-bold text-text-primary text-sm">Aperçu en direct</h3>
          </div>
          <div
            ref={previewRef}
            className="bg-white rounded-lg border border-border-subtle overflow-hidden shadow-lg"
          >
            <PagePreview page={page} onComponentClick={setSelectedComponentId} />
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      <ConfirmModal
        open={showDeleteConfirm}
        title={
          deleteTarget?.type === "section"
            ? "Supprimer la section"
            : "Supprimer le composant"
        }
        message={
          deleteTarget?.type === "section"
            ? "Êtes-vous sûr ? Cette action supprimera aussi tous les composants de la section."
            : "Êtes-vous sûr de vouloir supprimer ce composant ?"
        }
        onConfirm={() => {
          if (deleteTarget?.type === "section") {
            deleteSection(deleteTarget.id);
          } else if (deleteTarget?.type === "component") {
            deleteComponent(deleteTarget.id);
          }
        }}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDeleteTarget(null);
        }}
        variant="danger"
      />
    </PageWrapper>
  );
}

// Section Editor Component
function SectionEditor({
  section,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  onAddComponent,
  onUpdateComponent,
  onDeleteComponent,
  expandedComponents,
  onToggleComponentExpand,
  selectedComponentId,
  onSelectComponent,
}: {
  section: Section;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (id: number, updates: Partial<Section>) => void;
  onDelete: (id: number) => void;
  onAddComponent: (sectionId: number) => void;
  onUpdateComponent: (id: number, updates: Partial<Component>) => void;
  onDeleteComponent: (id: number) => void;
  expandedComponents: Set<number>;
  onToggleComponentExpand: (id: number) => void;
  selectedComponentId: number | null;
  onSelectComponent: (id: number | null) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <Card className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between cursor-pointer" onClick={onToggleExpand}>
        <div className="flex items-center gap-2 flex-1">
          <ChevronDown
            size={16}
            className={`transition-transform ${isExpanded ? "rotate-0" : "-rotate-90"}`}
          />
          <Badge variant="info">{section.section_type}</Badge>
          <span className="text-sm font-medium text-text-primary">
            Section {section.sort_order}
          </span>
          <span className="text-xs text-text-muted">
            ({section.components?.length || 0} composants)
          </span>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Toggle
            on={section.is_visible}
            onToggle={() =>
              onUpdate(section.id, { is_visible: !section.is_visible })
            }
          />
          <Btn
            variant="ghost"
            icon={Settings}
            small
            onClick={() => setShowSettings(!showSettings)}
          />
          <Btn
            variant="danger"
            icon={Trash2}
            small
            onClick={() => onDelete(section.id)}
          />
        </div>
      </div>

      {/* Settings (collapsible) */}
      {showSettings && (
        <div className="mt-4 pt-4 border-t border-border-subtle space-y-3">
          <Select
            label="Type de section"
            value={section.section_type}
            onChange={(v) => onUpdate(section.id, { section_type: v })}
            options={SECTION_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <ColorPicker
            label="Couleur de fond"
            value={section.background_color || "#ffffff"}
            onChange={(v) => onUpdate(section.id, { background_color: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Padding haut"
              value={section.padding_top || "py-16"}
              onChange={(v) =>
                onUpdate(section.id, { padding_top: v })
              }
              placeholder="py-16, py-8, etc."
            />
            <Input
              label="Padding bas"
              value={section.padding_bottom || "pb-16"}
              onChange={(v) =>
                onUpdate(section.id, { padding_bottom: v })
              }
              placeholder="pb-16, pb-8, etc."
            />
          </div>
          <Input
            label="Largeur max"
            value={section.max_width || "100%"}
            onChange={(v) => onUpdate(section.id, { max_width: v })}
            placeholder="100%, 1200px, etc."
          />
          <Input
            label="Classe CSS"
            value={section.custom_css_class || ""}
            onChange={(v) => onUpdate(section.id, { custom_css_class: v })}
            placeholder="custom-class"
          />
        </div>
      )}

      {/* Components List */}
      {isExpanded && (
        <div className="mt-4 space-y-3">
          {section.components && section.components.length > 0 ? (
            section.components.map((component) => (
              <ComponentEditor
                key={component.id}
                component={component}
                isExpanded={expandedComponents.has(component.id)}
                onToggleExpand={() => onToggleComponentExpand(component.id)}
                onUpdate={onUpdateComponent}
                onDelete={onDeleteComponent}
                isSelected={selectedComponentId === component.id}
                onSelect={() =>
                  onSelectComponent(
                    selectedComponentId === component.id ? null : component.id
                  )
                }
              />
            ))
          ) : (
            <p className="text-xs text-text-muted p-2">
              Aucun composant. Ajoutez-en un.
            </p>
          )}

          <Btn
            variant="default"
            icon={Plus}
            onClick={() => onAddComponent(section.id)}
            small
            className="w-full"
          >
            Ajouter un composant
          </Btn>
        </div>
      )}
    </Card>
  );
}

// Component Editor Component
function ComponentEditor({
  component,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  isSelected,
  onSelect,
}: {
  component: Component;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (id: number, updates: Partial<Component>) => void;
  onDelete: (id: number) => void;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`bg-bg-secondary border rounded-lg p-3 cursor-pointer transition-colors ${
        isSelected ? "border-accent bg-accent/5" : "border-border-subtle"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          <ChevronDown
            size={14}
            className={`transition-transform ${isExpanded ? "rotate-0" : "-rotate-90"}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
          />
          <Badge variant="purple" className="text-[10px]">
            {component.component_type}
          </Badge>
          <span className="text-xs text-text-secondary truncate">
            {getComponentPreview(component)}
          </span>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Toggle
            on={component.is_visible}
            onToggle={() =>
              onUpdate(component.id, { is_visible: !component.is_visible })
            }
          />
          <Btn
            variant="danger"
            icon={Trash2}
            small
            onClick={() => onDelete(component.id)}
          />
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-border-subtle space-y-3">
          <ComponentContentEditor
            component={component}
            onUpdate={onUpdate}
          />
          <div className="pt-3 border-t border-border-subtle space-y-3">
            <Input
              label="Classe CSS"
              value={component.custom_css_class || ""}
              onChange={(v) =>
                onUpdate(component.id, { custom_css_class: v })
              }
              placeholder="custom-class"
            />
            <Input
              label="Colonnes grille"
              value={component.grid_column || "auto"}
              onChange={(v) => onUpdate(component.id, { grid_column: v })}
              placeholder="span-full, span-2, etc."
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Component Content Editor
function ComponentContentEditor({
  component,
  onUpdate,
}: {
  component: Component;
  onUpdate: (id: number, updates: Partial<Component>) => void;
}) {
  const content = component.content || {};

  const updateContent = (key: string, value: any) => {
    onUpdate(component.id, {
      content: { ...content, [key]: value },
    });
  };

  switch (component.component_type) {
    case "heading":
      return (
        <div className="space-y-3">
          <Input
            label="Texte"
            value={content.text || ""}
            onChange={(v) => updateContent("text", v)}
          />
          <Select
            label="Niveau"
            value={content.level || "h1"}
            onChange={(v) => updateContent("level", v)}
            options={[
              { value: "h1", label: "H1" },
              { value: "h2", label: "H2" },
              { value: "h3", label: "H3" },
              { value: "h4", label: "H4" },
              { value: "h5", label: "H5" },
              { value: "h6", label: "H6" },
            ]}
          />
        </div>
      );

    case "text":
      return (
        <Input
          label="Contenu texte"
          value={content.text || ""}
          onChange={(v) => updateContent("text", v)}
          multiline
          rows={3}
        />
      );

    case "image":
      return (
        <div className="space-y-3">
          <Input
            label="URL de l'image"
            value={content.src || ""}
            onChange={(v) => updateContent("src", v)}
          />
          <Input
            label="Texte alternatif"
            value={content.alt || ""}
            onChange={(v) => updateContent("alt", v)}
          />
        </div>
      );

    case "button":
      return (
        <div className="space-y-3">
          <Input
            label="Texte du bouton"
            value={content.text || ""}
            onChange={(v) => updateContent("text", v)}
          />
          <Input
            label="URL"
            value={content.url || ""}
            onChange={(v) => updateContent("url", v)}
          />
          <Select
            label="Variante"
            value={content.variant || "primary"}
            onChange={(v) => updateContent("variant", v)}
            options={[
              { value: "primary", label: "Primaire" },
              { value: "secondary", label: "Secondaire" },
              { value: "outline", label: "Outline" },
            ]}
          />
        </div>
      );

    case "divider":
      return (
        <Input
          label="Hauteur (px)"
          value={content.height || "1"}
          onChange={(v) => updateContent("height", v)}
          type="number"
        />
      );

    case "spacer":
      return (
        <Input
          label="Hauteur (px)"
          value={content.height || "40"}
          onChange={(v) => updateContent("height", v)}
          type="number"
        />
      );

    case "custom-html":
      return (
        <Input
          label="Code HTML"
          value={content.html || ""}
          onChange={(v) => updateContent("html", v)}
          multiline
          rows={4}
        />
      );

    default:
      return (
        <div className="text-xs text-text-muted p-2 bg-bg-hover rounded">
          Éditeur générique pour {component.component_type}
        </div>
      );
  }
}

// Page Preview Component
function PagePreview({
  page,
  onComponentClick,
}: {
  page: Page;
  onComponentClick: (id: number) => void;
}) {
  if (!page.sections || page.sections.length === 0) {
    return (
      <div className="p-8 text-center text-text-muted">
        <p className="text-sm">Aucune section à prévisualiser</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {page.sections.map((section) => (
        <div
          key={section.id}
          style={{
            backgroundColor: section.background_color || "#ffffff",
          }}
          className={`border-b border-gray-200 ${section.padding_top || ""} ${section.padding_bottom || ""}`}
        >
          <div
            style={{
              maxWidth: section.max_width || "100%",
              margin: "0 auto",
            }}
            className={`px-6 ${section.custom_css_class || ""}`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {section.components?.map((component) => (
                <div
                  key={component.id}
                  onClick={() => onComponentClick(component.id)}
                  className="cursor-pointer p-2 rounded hover:bg-gray-100"
                  style={{
                    gridColumn:
                      component.grid_column === "span-full"
                        ? "1 / -1"
                        : component.grid_column,
                  }}
                >
                  <ComponentPreview component={component} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Component Preview
function ComponentPreview({ component }: { component: Component }) {
  const content = component.content || {};

  switch (component.component_type) {
    case "heading":
      const HeadingTag = (content.level || "h1") as any;
      return <HeadingTag className="font-bold">{content.text || "Titre"}</HeadingTag>;

    case "text":
      return <p className="text-sm text-gray-700">{content.text || "Texte"}</p>;

    case "image":
      return (
        <img
          src={content.src || "https://via.placeholder.com/300"}
          alt={content.alt || "Image"}
          className="w-full h-auto rounded"
          loading="lazy"
        />
      );

    case "button":
      return (
        <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
          {content.text || "Bouton"}
        </button>
      );

    case "divider":
      return <hr className="my-2" />;

    case "spacer":
      return <div style={{ height: (content.height || 40) + "px" }} />;

    default:
      return (
        <div className="text-xs text-gray-500 p-2 bg-gray-100 rounded">
          {component.component_type}
        </div>
      );
  }
}

function getComponentPreview(component: Component): string {
  const content = component.content || {};
  switch (component.component_type) {
    case "heading":
      return content.text?.substring(0, 30) || "Titre";
    case "text":
      return content.text?.substring(0, 30) || "Texte";
    case "image":
      return "Image";
    case "button":
      return content.text || "Bouton";
    default:
      return component.component_type;
  }
}
