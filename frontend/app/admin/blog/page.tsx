"use client";
import { useState, useEffect, useCallback } from "react";
import { BookOpen, Trash2, Edit3, Plus, Check, X, Copy } from "lucide-react";
import {
  Input, Select, Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, ConfirmModal, useToast, Toggle,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt?: string;
  content: string;
  cover_image_url?: string;
  status: "draft" | "published";
  tags?: string;
  created_at: string;
  updated_at: string;
}

interface EditingPost {
  id?: number;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_image_url: string;
  status: "draft" | "published";
  tags: string;
}

const initialPost: EditingPost = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  cover_image_url: "",
  status: "draft",
  tags: "",
};

export default function BlogPage() {
  const { toast } = useToast();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [skip, setSkip] = useState(0);
  const [limit] = useState(15);
  const [total, setTotal] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingPost, setEditingPost] = useState<EditingPost>({ ...initialPost });
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listBlogPosts({
        status: statusFilter === "all" ? undefined : statusFilter,
        skip,
        limit,
      });
      setPosts(res.posts || []);
      setTotal(res.total || 0);
      toast("Articles chargés", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, skip, limit, toast]);

  useEffect(() => {
    setSkip(0);
  }, [statusFilter]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const startCreate = () => {
    setEditingPost({ ...initialPost });
    setEditingPostId(null);
    setShowForm(true);
  };

  const startEdit = (post: BlogPost) => {
    setEditingPost({
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || "",
      content: post.content,
      cover_image_url: post.cover_image_url || "",
      status: post.status,
      tags: post.tags || "",
    });
    setEditingPostId(post.id);
    setShowForm(true);
  };

  const savePost = async () => {
    if (!editingPost.title.trim() || !editingPost.slug.trim()) {
      toast("Le titre et le slug sont requis", "warning");
      return;
    }
    try {
      setFormLoading(true);
      if (editingPostId) {
        await adminApi.updateBlogPost(editingPostId, editingPost);
        toast("Article mis à jour", "success");
      } else {
        await adminApi.createBlogPost(editingPost);
        toast("Article créé", "success");
      }
      setShowForm(false);
      setEditingPost({ ...initialPost });
      setEditingPostId(null);
      await loadPosts();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setFormLoading(false);
    }
  };

  const duplicatePost = async (post: BlogPost) => {
    try {
      setFormLoading(true);
      const newPost = {
        ...post,
        id: undefined,
        title: `${post.title} (copie)`,
        slug: `${post.slug}-copy-${Date.now()}`,
        status: "draft" as const,
      };
      await adminApi.createBlogPost(newPost);
      toast("Article dupliqué", "success");
      await loadPosts();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setFormLoading(false);
    }
  };

  const togglePublish = async (id: number) => {
    try {
      await adminApi.toggleBlogPublish(id);
      toast("Statut de publication modifié", "success");
      await loadPosts();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  const confirmDelete = async () => {
    if (deletingId === null) return;
    try {
      await adminApi.deleteBlogPost(deletingId);
      toast("Article supprimé", "success");
      await loadPosts();
      setDeletingId(null);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const pages = Math.ceil(total / limit);
  const currentPage = Math.floor(skip / limit) + 1;

  return (
    <PageWrapper>
      <SectionHeader
        title="Blog"
        description={`Gérez les ${total} articles`}
        actions={
          <Btn variant="primary" onClick={startCreate} icon={Plus}>
            Nouvel article
          </Btn>
        }
      />

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={() => setShowForm(false)}>
          <Card className="w-full max-w-2xl mx-4 my-8 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-text-primary mb-4">
              {editingPostId ? "Éditer l'article" : "Nouvel article"}
            </h3>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              <Input
                label="Titre"
                value={editingPost.title}
                onChange={(v) => setEditingPost({ ...editingPost, title: v })}
              />
              <Input
                label="Slug"
                value={editingPost.slug}
                onChange={(v) => setEditingPost({ ...editingPost, slug: v })}
              />
              <Input
                label="Extrait"
                value={editingPost.excerpt}
                onChange={(v) => setEditingPost({ ...editingPost, excerpt: v })}
                multiline
                rows={2}
              />
              <Input
                label="Contenu"
                value={editingPost.content}
                onChange={(v) => setEditingPost({ ...editingPost, content: v })}
                multiline
                rows={6}
              />
              <Input
                label="URL de l'image de couverture"
                value={editingPost.cover_image_url}
                onChange={(v) => setEditingPost({ ...editingPost, cover_image_url: v })}
              />
              <Input
                label="Tags (séparés par des virgules)"
                value={editingPost.tags}
                onChange={(v) => setEditingPost({ ...editingPost, tags: v })}
              />
              <Select
                label="Statut"
                value={editingPost.status}
                onChange={(v) => setEditingPost({ ...editingPost, status: v as "draft" | "published" })}
                options={[
                  { value: "draft", label: "Brouillon" },
                  { value: "published", label: "Publié" },
                ]}
              />
              <div className="flex gap-2 justify-end pt-4 border-t border-border-subtle">
                <Btn
                  variant="default"
                  onClick={() => {
                    setShowForm(false);
                    setEditingPost({ ...initialPost });
                    setEditingPostId(null);
                  }}
                  disabled={formLoading}
                >
                  Annuler
                </Btn>
                <Btn
                  variant="primary"
                  onClick={savePost}
                  loading={formLoading}
                  icon={Check}
                >
                  Sauver
                </Btn>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="p-4 mb-6">
        <Select
          label="Statut"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "Tous les statuts" },
            { value: "draft", label: "Brouillons" },
            { value: "published", label: "Publiés" },
          ]}
        />
      </Card>

      {/* Loading */}
      {loading ? (
        <LoadingScreen />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Aucun article"
          description="Commencez par créer un article"
          action={
            <Btn variant="primary" onClick={startCreate} icon={Plus}>
              Nouvel article
            </Btn>
          }
        />
      ) : isMobile ? (
        // Mobile cards
        <div className="space-y-3">
          {posts.map((post) => (
            <Card key={post.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <Badge variant={post.status === "published" ? "success" : "default"}>
                    {post.status === "published" ? "Publié" : "Brouillon"}
                  </Badge>
                  <h3 className="font-semibold text-text-primary text-sm mt-2">{post.title}</h3>
                  <p className="text-xs text-text-muted mt-1">{formatDate(post.created_at)}</p>
                </div>
              </div>
              <p className="text-xs text-text-secondary line-clamp-2 mb-3">{post.excerpt}</p>
              <div className="flex gap-2">
                <Btn
                  variant="default"
                  onClick={() => startEdit(post)}
                  small
                  icon={Edit3}
                  className="flex-1"
                >
                  Éditer
                </Btn>
                <Btn
                  variant="default"
                  onClick={() => duplicatePost(post)}
                  small
                  icon={Copy}
                  className="flex-1"
                >
                  Dupliquer
                </Btn>
                <Btn
                  variant="danger"
                  onClick={() => setDeletingId(post.id)}
                  small
                  icon={Trash2}
                  className="flex-1"
                >
                  Supprimer
                </Btn>
              </div>
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
                  Titre
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Statut
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-xs font-medium text-text-primary">{post.title}</p>
                      <p className="text-[10px] text-text-muted">{post.slug}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={post.status === "published" ? "success" : "default"}>
                      {post.status === "published" ? "Publié" : "Brouillon"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">{formatDate(post.created_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Btn
                        variant="default"
                        onClick={() => startEdit(post)}
                        small
                        icon={Edit3}
                      />
                      <Btn
                        variant="default"
                        onClick={() => duplicatePost(post)}
                        small
                        icon={Copy}
                      />
                      <Btn
                        variant="danger"
                        onClick={() => setDeletingId(post.id)}
                        small
                        icon={Trash2}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-xs text-text-muted">
            Page {currentPage} sur {pages}
          </div>
          <div className="flex gap-2">
            <Btn
              variant="default"
              onClick={() => setSkip(Math.max(0, skip - limit))}
              disabled={skip === 0}
              small
            >
              Précédent
            </Btn>
            <Btn
              variant="default"
              onClick={() => setSkip(skip + limit)}
              disabled={currentPage >= pages}
              small
            >
              Suivant
            </Btn>
          </div>
        </div>
      )}

      {/* Delete modal */}
      <ConfirmModal
        open={deletingId !== null}
        title="Supprimer l'article"
        message="Êtes-vous sûr de vouloir supprimer cet article ? Cette action est irréversible."
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </PageWrapper>
  );
}
