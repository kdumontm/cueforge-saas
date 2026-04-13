"use client";
import { useState, useEffect, useCallback } from "react";
import {
  MessageCircle, Trash2, Edit3, Check, X, Mail,
} from "lucide-react";
import {
  Input, Select, Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, ConfirmModal, useToast, StatCard,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface Feedback {
  id: number;
  user_id: number;
  user_email?: string;
  type: "bug" | "feature" | "other";
  subject: string;
  message: string;
  status: "new" | "read" | "in_progress" | "done" | "rejected";
  admin_response?: string;
  created_at: string;
}

interface Stats {
  total: number;
  bugs: number;
  features: number;
  other: number;
  unread: number;
}

export default function FeedbacksPage() {
  const { toast } = useToast();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, bugs: 0, features: 0, other: 0, unread: 0 });
  const [isMobile, setIsMobile] = useState(false);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingResponse, setEditingResponse] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadFeedbacks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listFeedbacks({
        type: typeFilter === "all" ? undefined : typeFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        skip,
        limit,
      });
      setFeedbacks(res.feedbacks || []);
      setTotal(res.total || 0);

      // Load stats
      try {
        const statsRes = await adminApi.feedbackStats();
        setStats(statsRes);
      } catch {
        // Stats might not be available
      }

      toast("Retours chargés", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, skip, limit, toast]);

  useEffect(() => {
    setSkip(0);
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    loadFeedbacks();
  }, [loadFeedbacks]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const updateStatus = async (id: number, newStatus: string) => {
    try {
      await adminApi.updateFeedback(id, { status: newStatus });
      toast("Statut mis à jour", "success");
      await loadFeedbacks();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  const saveResponse = async (id: number) => {
    try {
      await adminApi.updateFeedback(id, { admin_response: editingResponse, status: "done" });
      toast("Réponse enregistrée", "success");
      setEditingId(null);
      setEditingResponse("");
      await loadFeedbacks();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  const confirmDelete = async () => {
    if (deletingId === null) return;
    try {
      await adminApi.deleteFeedback(deletingId);
      toast("Retour supprimé", "success");
      await loadFeedbacks();
      setDeletingId(null);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  const getTypeVariant = (type: string): "default" | "info" | "warning" | "error" => {
    switch (type) {
      case "bug":
        return "error";
      case "feature":
        return "info";
      default:
        return "default";
    }
  };

  const getStatusVariant = (status: string): "default" | "success" | "error" | "info" | "warning" => {
    switch (status) {
      case "done":
        return "success";
      case "in_progress":
        return "info";
      case "rejected":
        return "error";
      default:
        return "default";
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
        title="Retours Utilisateurs"
        description={`Gérez les ${total} retours reçus`}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard icon={MessageCircle} label="Total" value={total} color="#6366f1" />
        <StatCard icon={Mail} label="Bugs" value={stats.bugs} color="#ef4444" />
        <StatCard icon={Mail} label="Demandes" value={stats.features} color="#3b82f6" />
        <StatCard icon={Mail} label="Autres" value={stats.other} color="#8b5cf6" />
        <StatCard icon={Mail} label="Non lus" value={stats.unread} color="#f59e0b" />
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Select
            label="Type"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "all", label: "Tous les types" },
              { value: "bug", label: "Bug" },
              { value: "feature", label: "Demande de fonction" },
              { value: "other", label: "Autre" },
            ]}
          />
          <Select
            label="Statut"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "Tous les statuts" },
              { value: "new", label: "Nouveau" },
              { value: "read", label: "Lu" },
              { value: "in_progress", label: "En cours" },
              { value: "done", label: "Résolu" },
              { value: "rejected", label: "Rejeté" },
            ]}
          />
          <div className="flex items-end">
            <Btn
              variant="primary"
              onClick={() => {
                setSkip(0);
                loadFeedbacks();
              }}
              small
            >
              Filtrer
            </Btn>
          </div>
        </div>
      </Card>

      {/* Loading */}
      {loading ? (
        <LoadingScreen />
      ) : feedbacks.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="Aucun retour trouvé"
          description="Aucun retour ne correspond à vos filtres"
        />
      ) : isMobile ? (
        // Mobile cards
        <div className="space-y-3">
          {feedbacks.map((fb) => (
            <Card key={fb.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={getTypeVariant(fb.type)}>
                      {fb.type.toUpperCase()}
                    </Badge>
                    <Badge variant={getStatusVariant(fb.status)}>
                      {fb.status}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-text-primary text-sm">{fb.subject}</h3>
                  <p className="text-xs text-text-muted mt-1">{fb.user_email}</p>
                </div>
              </div>

              <p className="text-xs text-text-secondary mb-3 line-clamp-2">{fb.message}</p>

              {expandedId === fb.id && (
                <div className="bg-bg-hover p-3 rounded-lg mb-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-text-muted mb-1">Message complet</p>
                    <p className="text-xs text-text-secondary">{fb.message}</p>
                  </div>
                  {fb.admin_response && (
                    <div>
                      <p className="text-xs font-semibold text-text-muted mb-1">Réponse admin</p>
                      <p className="text-xs text-text-secondary">{fb.admin_response}</p>
                    </div>
                  )}
                  {editingId !== fb.id && (
                    <div>
                      <p className="text-xs font-semibold text-text-muted mb-1">Changer le statut</p>
                      <Select
                        value={fb.status}
                        onChange={(v) => updateStatus(fb.id, v)}
                        options={[
                          { value: "new", label: "Nouveau" },
                          { value: "read", label: "Lu" },
                          { value: "in_progress", label: "En cours" },
                          { value: "done", label: "Résolu" },
                          { value: "rejected", label: "Rejeté" },
                        ]}
                      />
                    </div>
                  )}
                  {editingId === fb.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingResponse}
                        onChange={(e) => setEditingResponse(e.target.value)}
                        placeholder="Votre réponse..."
                        rows={3}
                        className="w-full px-2 py-1 text-xs rounded-lg border border-border-default bg-bg-secondary text-text-primary outline-none focus:border-accent"
                      />
                      <div className="flex gap-1">
                        <Btn
                          variant="default"
                          onClick={() => {
                            setEditingId(null);
                            setEditingResponse("");
                          }}
                          small
                          icon={X}
                          className="flex-1"
                        >
                          Annuler
                        </Btn>
                        <Btn
                          variant="primary"
                          onClick={() => saveResponse(fb.id)}
                          small
                          icon={Check}
                          className="flex-1"
                        >
                          Sauver
                        </Btn>
                      </div>
                    </div>
                  ) : (
                    <Btn
                      variant="default"
                      onClick={() => {
                        setEditingId(fb.id);
                        setEditingResponse(fb.admin_response || "");
                      }}
                      small
                      icon={Edit3}
                      className="w-full"
                    >
                      Répondre
                    </Btn>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Btn
                  variant="default"
                  onClick={() => setExpandedId(expandedId === fb.id ? null : fb.id)}
                  small
                  className="flex-1"
                >
                  {expandedId === fb.id ? "Fermer" : "Détails"}
                </Btn>
                <Btn
                  variant="danger"
                  onClick={() => setDeletingId(fb.id)}
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
                  Utilisateur
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Sujet / Message
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
              {feedbacks.map((fb) => (
                <tr key={fb.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-secondary">{fb.user_email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={getTypeVariant(fb.type)}>
                      {fb.type.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-xs font-medium text-text-primary">{fb.subject}</p>
                      <p className="text-[10px] text-text-muted line-clamp-1">{fb.message}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={getStatusVariant(fb.status)}>
                      {fb.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">{formatDate(fb.created_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Btn
                        variant="default"
                        onClick={() => setExpandedId(expandedId === fb.id ? null : fb.id)}
                        small
                      >
                        {expandedId === fb.id ? "Fermer" : "Détails"}
                      </Btn>
                      <Btn
                        variant="danger"
                        onClick={() => setDeletingId(fb.id)}
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

      {/* Expanded details */}
      {expandedId !== null && !isMobile && (
        <Card className="mt-6 p-6">
          {feedbacks.map((fb) => {
            if (fb.id !== expandedId) return null;
            return (
              <div key={fb.id} className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-2">Message complet</h3>
                  <p className="text-sm text-text-secondary bg-bg-hover p-3 rounded-lg">{fb.message}</p>
                </div>

                {fb.admin_response && (
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary mb-2">Réponse admin</h3>
                    <p className="text-sm text-text-secondary bg-bg-hover p-3 rounded-lg">{fb.admin_response}</p>
                  </div>
                )}

                {editingId === fb.id ? (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-text-primary">Répondre</h3>
                    <textarea
                      value={editingResponse}
                      onChange={(e) => setEditingResponse(e.target.value)}
                      placeholder="Votre réponse..."
                      rows={4}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-secondary text-text-primary outline-none focus:border-accent"
                    />
                    <div className="flex gap-2 justify-end">
                      <Btn
                        variant="default"
                        onClick={() => {
                          setEditingId(null);
                          setEditingResponse("");
                        }}
                      >
                        Annuler
                      </Btn>
                      <Btn
                        variant="primary"
                        onClick={() => saveResponse(fb.id)}
                        icon={Check}
                      >
                        Enregistrer
                      </Btn>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 justify-end">
                    <Select
                      label="Statut"
                      value={fb.status}
                      onChange={(v) => updateStatus(fb.id, v)}
                      options={[
                        { value: "new", label: "Nouveau" },
                        { value: "read", label: "Lu" },
                        { value: "in_progress", label: "En cours" },
                        { value: "done", label: "Résolu" },
                        { value: "rejected", label: "Rejeté" },
                      ]}
                      className="flex-1 max-w-xs"
                    />
                    <Btn
                      variant="primary"
                      onClick={() => {
                        setEditingId(fb.id);
                        setEditingResponse(fb.admin_response || "");
                      }}
                      icon={Edit3}
                    >
                      Répondre
                    </Btn>
                  </div>
                )}
              </div>
            );
          })}
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
        title="Supprimer le retour"
        message="Êtes-vous sûr de vouloir supprimer ce retour ? Cette action est irréversible."
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </PageWrapper>
  );
}
