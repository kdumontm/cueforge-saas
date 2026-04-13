"use client";

import { useState, useEffect, useRef } from "react";
import {
  Input,
  Select,
  Btn,
  Card,
  Badge,
  PageWrapper,
  SectionHeader,
  LoadingScreen,
  EmptyState,
  ConfirmModal,
  useToast,
  TabBar,
} from "../_components/shared";
import { adminApi } from "../_components/api";
import { Copy, Trash2, ImageIcon, Upload, CheckCircle } from "lucide-react";

interface MediaItem {
  id: number;
  filename: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  width?: number;
  height?: number;
  alt_text?: string;
  category: string;
  tags?: string[];
  created_at: string;
}

export default function MediaPage() {
  const { toast } = useToast();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editAltText, setEditAltText] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const dragRef = useRef<HTMLDivElement>(null);

  const categories = [
    { id: "all", label: "Tous" },
    { id: "general", label: "Général" },
    { id: "logo", label: "Logo" },
    { id: "hero", label: "Hero" },
    { id: "icon", label: "Icône" },
  ];

  // Load media
  useEffect(() => {
    loadMedia();
  }, [activeCategory]);

  async function loadMedia() {
    try {
      setLoading(true);
      const cat = activeCategory === "all" ? undefined : activeCategory;
      const data = await adminApi.listMedia(cat);
      setMedia(Array.isArray(data) ? data : data.items || []);
    } catch (err: any) {
      toast(err.message || "Erreur lors du chargement des fichiers", "error");
    } finally {
      setLoading(false);
    }
  }

  // Format file size
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  // Handle drag & drop
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (dragRef.current) {
      dragRef.current.classList.add("ring-2", "ring-accent");
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    if (dragRef.current) {
      dragRef.current.classList.remove("ring-2", "ring-accent");
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (dragRef.current) {
      dragRef.current.classList.remove("ring-2", "ring-accent");
    }

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await uploadFiles(files);
    }
  }

  async function uploadFiles(files: File[]) {
    try {
      setUploading(true);
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          toast(`${file.name} n'est pas une image`, "error");
          continue;
        }
        await adminApi.uploadMedia(file, activeCategory === "all" ? "general" : activeCategory);
      }
      toast(`${files.length} fichier(s) téléchargé(s) avec succès`, "success");
      await loadMedia();
    } catch (err: any) {
      toast(err.message || "Erreur lors du téléchargement", "error");
    } finally {
      setUploading(false);
    }
  }

  function openEditModal(item: MediaItem) {
    setSelectedMedia(item);
    setEditAltText(item.alt_text || "");
    setEditCategory(item.category);
    setShowEditModal(true);
  }

  async function saveMediaChanges() {
    if (!selectedMedia) return;
    try {
      await adminApi.updateMedia(selectedMedia.id, {
        alt_text: editAltText,
        category: editCategory,
      });
      toast("Fichier mis à jour avec succès", "success");
      setShowEditModal(false);
      await loadMedia();
    } catch (err: any) {
      toast(err.message || "Erreur lors de la mise à jour", "error");
    }
  }

  async function deleteMedia() {
    if (!selectedMedia) return;
    try {
      await adminApi.deleteMedia(selectedMedia.id);
      toast("Fichier supprimé avec succès", "success");
      setShowDeleteConfirm(false);
      setShowEditModal(false);
      await loadMedia();
    } catch (err: any) {
      toast(err.message || "Erreur lors de la suppression", "error");
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast("URL copiée dans le presse-papiers", "success");
  }

  const filteredMedia =
    activeCategory === "all" ? media : media.filter((m) => m.category === activeCategory);

  return (
    <PageWrapper>
      <SectionHeader
        title="Gestionnaire de médias"
        description="Gérez les images et fichiers de votre site"
      />

      {/* Upload Zone */}
      <Card className="p-8 mb-6 border-2 border-dashed border-border-default hover:border-accent/50 transition-colors cursor-pointer"
        ref={dragRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <label className="flex flex-col items-center justify-center text-center cursor-pointer">
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-3">
            <Upload size={24} className="text-accent" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary mb-1">
            Déposez vos fichiers ici
          </h3>
          <p className="text-xs text-text-muted mb-3">
            ou cliquez pour sélectionner des fichiers
          </p>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files || []);
              if (files.length > 0) uploadFiles(files);
            }}
            className="hidden"
          />
          <Btn variant="primary" small disabled={uploading}>
            {uploading ? "Téléchargement..." : "Sélectionner des fichiers"}
          </Btn>
        </label>
      </Card>

      {/* Category Tabs */}
      <TabBar
        tabs={categories}
        active={activeCategory}
        onChange={setActiveCategory}
      />

      {/* Media Grid */}
      {loading ? (
        <LoadingScreen />
      ) : filteredMedia.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="Aucun fichier"
          description="Aucun fichier média trouvé dans cette catégorie. Commencez par en ajouter un."
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredMedia.map((item) => (
            <div
              key={item.id}
              onClick={() => openEditModal(item)}
              className="group cursor-pointer rounded-lg overflow-hidden bg-bg-card border border-border-subtle hover:border-accent/50 transition-all"
            >
              {/* Image */}
              <div className="relative w-full aspect-square bg-bg-secondary overflow-hidden">
                <img
                  src={item.file_url}
                  alt={item.alt_text || item.filename}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="text-white text-xs font-medium">Cliquez pour modifier</div>
                </div>
              </div>

              {/* Info */}
              <div className="p-3 border-t border-border-subtle">
                <p className="text-xs font-medium text-text-primary truncate mb-1">
                  {item.filename}
                </p>
                <div className="flex items-center justify-between">
                  <Badge variant="info" className="text-[10px]">
                    {formatFileSize(item.file_size)}
                  </Badge>
                  <Badge variant="default" className="text-[10px]">
                    {item.width}×{item.height}
                  </Badge>
                </div>
                <p className="text-[10px] text-text-muted mt-2">
                  {new Date(item.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedMedia && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-text-primary mb-4">
              Modifier le fichier
            </h3>

            {/* Preview */}
            <div className="mb-4 rounded-lg overflow-hidden bg-bg-secondary">
              <img
                src={selectedMedia.file_url}
                alt={selectedMedia.alt_text || selectedMedia.filename}
                className="w-full h-auto max-h-64 object-cover"
                loading="lazy"
              />
            </div>

            {/* Details */}
            <div className="space-y-3 mb-4 pb-4 border-b border-border-subtle">
              <div>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                  Fichier
                </p>
                <p className="text-xs text-text-primary font-mono">{selectedMedia.filename}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                    Taille
                  </p>
                  <p className="text-xs text-text-primary">
                    {formatFileSize(selectedMedia.file_size)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                    Dimensions
                  </p>
                  <p className="text-xs text-text-primary">
                    {selectedMedia.width}×{selectedMedia.height}
                  </p>
                </div>
              </div>
            </div>

            {/* Edit Fields */}
            <Input
              label="Texte alternatif (alt)"
              value={editAltText}
              onChange={setEditAltText}
              placeholder="Description de l'image..."
              className="mb-3"
            />

            <Select
              label="Catégorie"
              value={editCategory}
              onChange={setEditCategory}
              options={[
                { value: "general", label: "Général" },
                { value: "logo", label: "Logo" },
                { value: "hero", label: "Hero" },
                { value: "icon", label: "Icône" },
              ]}
              className="mb-4"
            />

            {/* URL Copy */}
            <div className="mb-4 p-3 bg-bg-secondary rounded-lg border border-border-subtle">
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
                URL publique
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={selectedMedia.file_url}
                  readOnly
                  className="flex-1 text-xs bg-transparent text-text-primary font-mono outline-none truncate"
                />
                <Btn
                  variant="ghost"
                  icon={Copy}
                  small
                  onClick={() => copyToClipboard(selectedMedia.file_url)}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Btn
                variant="danger"
                icon={Trash2}
                onClick={() => setShowDeleteConfirm(true)}
              >
                Supprimer
              </Btn>
              <Btn variant="default" onClick={() => setShowEditModal(false)}>
                Annuler
              </Btn>
              <Btn
                variant="primary"
                icon={CheckCircle}
                onClick={saveMediaChanges}
              >
                Enregistrer
              </Btn>
            </div>
          </Card>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        open={showDeleteConfirm}
        title="Supprimer le fichier"
        message={`Êtes-vous sûr de vouloir supprimer "${selectedMedia?.filename}" ? Cette action est irréversible.`}
        onConfirm={deleteMedia}
        onCancel={() => setShowDeleteConfirm(false)}
        variant="danger"
      />
    </PageWrapper>
  );
}
