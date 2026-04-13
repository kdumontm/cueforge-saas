"use client";
import { useState, useEffect, useCallback } from "react";
import { Tag, Trash2, Plus, Check, X, Merge2 } from "lucide-react";
import {
  Input, Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, ConfirmModal, useToast, ColorPicker,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface TagData {
  id: number;
  name: string;
  color?: string;
  usage_count: number;
}

interface CreatingTag {
  name: string;
  color: string;
}

export default function TagsPage() {
  const { toast } = useToast();
  const [tags, setTags] = useState<TagData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creatingTag, setCreatingTag] = useState<CreatingTag>({ name: "", color: "#6366f1" });
  const [creatingLoading, setCreatingLoading] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTag, setEditingTag] = useState<CreatingTag | null>(null);
  const [editingLoading, setEditingLoading] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSourceIds, setMergeSourceIds] = useState<number[]>([]);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);

  const loadTags = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listTags();
      setTags(res.tags || []);
      toast("Tags chargés", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const createTag = async () => {
    if (!creatingTag.name.trim()) {
      toast("Le nom ne peut pas être vide", "warning");
      return;
    }
    try {
      setCreatingLoading(true);
      await adminApi.createTag({
        name: creatingTag.name,
        color: creatingTag.color,
      });
      toast("Tag créé", "success");
      setCreatingTag({ name: "", color: "#6366f1" });
      setShowCreateForm(false);
      await loadTags();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setCreatingLoading(false);
    }
  };

  const startEdit = (tag: TagData) => {
    setEditingId(tag.id);
    setEditingTag({
      name: tag.name,
      color: tag.color || "#6366f1",
    });
  };

  const saveEdit = async () => {
    if (!editingTag || editingId === null) return;
    try {
      setEditingLoading(true);
      await adminApi.updateTag(editingId, {
        name: editingTag.name,
        color: editingTag.color,
      });
      toast("Tag mis à jour", "success");
      setEditingId(null);
      setEditingTag(null);
      await loadTags();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setEditingLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (deletingId === null) return;
    try {
      await adminApi.deleteTag(deletingId);
      toast("Tag supprimé", "success");
      await loadTags();
      setDeletingId(null);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  const mergeTags = async () => {
    if (mergeSourceIds.length === 0 || mergeTargetId === null) {
      toast("Sélectionnez une source et une cible", "warning");
      return;
    }
    try {
      setMerging(true);
      await adminApi.mergeTags(mergeSourceIds, mergeTargetId);
      toast("Tags fusionnés", "success");
      setMergeSourceIds([]);
      setMergeTargetId(null);
      setShowMergeModal(false);
      await loadTags();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setMerging(false);
    }
  };

  return (
    <PageWrapper>
      <SectionHeader
        title="Tags"
        description={`Gérez les ${tags.length} tags`}
        actions={
          <div className="flex gap-2">
            <Btn
              variant="default"
              onClick={() => setShowMergeModal(true)}
              icon={Merge2}
            >
              Fusionner
            </Btn>
            <Btn
              variant="primary"
              onClick={() => setShowCreateForm(true)}
              icon={Plus}
            >
              Créer un tag
            </Btn>
          </div>
        }
      />

      {/* Create form */}
      {showCreateForm && (
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-bold text-text-primary mb-4">Créer un nouveau tag</h3>
          <div className="space-y-4">
            <Input
              label="Nom"
              value={creatingTag.name}
              onChange={(v) => setCreatingTag({ ...creatingTag, name: v })}
              placeholder="Nom du tag..."
            />
            <ColorPicker
              label="Couleur"
              value={creatingTag.color}
              onChange={(v) => setCreatingTag({ ...creatingTag, color: v })}
            />
            <div className="flex gap-2 justify-end">
              <Btn
                variant="default"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreatingTag({ name: "", color: "#6366f1" });
                }}
                disabled={creatingLoading}
              >
                Annuler
              </Btn>
              <Btn
                variant="primary"
                onClick={createTag}
                loading={creatingLoading}
                icon={Plus}
              >
                Créer
              </Btn>
            </div>
          </div>
        </Card>
      )}

      {/* Merge modal */}
      {showMergeModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowMergeModal(false)}>
          <Card className="w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-text-primary mb-4">Fusionner des tags</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-text-secondary uppercase mb-2 block">
                  Tags source (à fusionner)
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {tags.map((tag) => (
                    <label key={tag.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={mergeSourceIds.includes(tag.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setMergeSourceIds([...mergeSourceIds, tag.id]);
                          } else {
                            setMergeSourceIds(mergeSourceIds.filter((id) => id !== tag.id));
                          }
                        }}
                      />
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color || "#6366f1" }}
                      />
                      <span>{tag.name}</span>
                      <span className="text-text-muted text-xs ml-auto">({tag.usage_count})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-text-secondary uppercase mb-2 block">
                  Tag cible
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto border border-border-default rounded-lg p-2">
                  {tags.map((tag) => (
                    <label key={tag.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="merge-target"
                        checked={mergeTargetId === tag.id}
                        onChange={() => setMergeTargetId(tag.id)}
                      />
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color || "#6366f1" }}
                      />
                      <span>{tag.name}</span>
                      <span className="text-text-muted text-xs ml-auto">({tag.usage_count})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Btn
                  variant="default"
                  onClick={() => {
                    setShowMergeModal(false);
                    setMergeSourceIds([]);
                    setMergeTargetId(null);
                  }}
                  disabled={merging}
                >
                  Annuler
                </Btn>
                <Btn
                  variant="primary"
                  onClick={mergeTags}
                  loading={merging}
                  icon={Merge2}
                >
                  Fusionner
                </Btn>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <LoadingScreen />
      ) : tags.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Aucun tag"
          description="Commencez par créer un tag"
          action={
            <Btn variant="primary" onClick={() => setShowCreateForm(true)} icon={Plus}>
              Créer un tag
            </Btn>
          }
        />
      ) : isMobile ? (
        // Mobile cards
        <div className="space-y-3">
          {tags.map((tag) => (
            <Card key={tag.id} className="p-4">
              {editingId === tag.id && editingTag ? (
                <div className="space-y-3">
                  <Input
                    label="Nom"
                    value={editingTag.name}
                    onChange={(v) =>
                      setEditingTag({ ...editingTag, name: v })
                    }
                  />
                  <ColorPicker
                    label="Couleur"
                    value={editingTag.color}
                    onChange={(v) =>
                      setEditingTag({ ...editingTag, color: v })
                    }
                  />
                  <div className="flex gap-2 pt-2">
                    <Btn
                      variant="default"
                      onClick={() => {
                        setEditingId(null);
                        setEditingTag(null);
                      }}
                      small
                      icon={X}
                      className="flex-1"
                    >
                      Annuler
                    </Btn>
                    <Btn
                      variant="primary"
                      onClick={saveEdit}
                      small
                      icon={Check}
                      className="flex-1"
                      loading={editingLoading}
                    >
                      Sauver
                    </Btn>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-6 h-6 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.color || "#6366f1" }}
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-text-primary text-sm">{tag.name}</h3>
                      <p className="text-xs text-text-muted">{tag.usage_count} utilisations</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Btn
                      variant="default"
                      onClick={() => startEdit(tag)}
                      small
                      className="flex-1"
                    >
                      Éditer
                    </Btn>
                    <Btn
                      variant="danger"
                      onClick={() => setDeletingId(tag.id)}
                      small
                      icon={Trash2}
                      className="flex-1"
                    >
                      Supprimer
                    </Btn>
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      ) : (
        // Desktop table
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Nom
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Couleur
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Utilisations
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {tags.map((tag) => (
                <tr key={tag.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  {editingId === tag.id && editingTag ? (
                    <>
                      <td className="px-4 py-3">
                        <Input
                          value={editingTag.name}
                          onChange={(v) =>
                            setEditingTag({ ...editingTag, name: v })
                          }
                          className="w-full"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="color"
                          value={editingTag.color}
                          onChange={(e) =>
                            setEditingTag({ ...editingTag, color: e.target.value })
                          }
                          className="w-8 h-8 rounded-lg border border-border-default mx-auto cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Btn
                            variant="default"
                            onClick={() => {
                              setEditingId(null);
                              setEditingTag(null);
                            }}
                            small
                            icon={X}
                          />
                          <Btn
                            variant="primary"
                            onClick={saveEdit}
                            small
                            icon={Check}
                            loading={editingLoading}
                          />
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3">
                        <p className="text-xs font-medium text-text-primary">{tag.name}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div
                          className="w-6 h-6 rounded-full mx-auto"
                          style={{ backgroundColor: tag.color || "#6366f1" }}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <p className="text-xs text-text-secondary">{tag.usage_count}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Btn
                            variant="default"
                            onClick={() => startEdit(tag)}
                            small
                          >
                            Éditer
                          </Btn>
                          <Btn
                            variant="danger"
                            onClick={() => setDeletingId(tag.id)}
                            small
                            icon={Trash2}
                          />
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Delete modal */}
      <ConfirmModal
        open={deletingId !== null}
        title="Supprimer le tag"
        message="Êtes-vous sûr de vouloir supprimer ce tag ? Tous les enregistrements associés seront affectés."
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </PageWrapper>
  );
}
