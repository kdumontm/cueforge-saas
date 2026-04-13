"use client";
import { useState, useEffect, useCallback } from "react";
import { ExternalLink, Trash2, Copy } from "lucide-react";
import {
  Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, ConfirmModal, useToast,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface SharedLink {
  id: number;
  user_id: number;
  user_email?: string;
  url: string;
  link_type: string;
  view_count: number;
  status: "active" | "revoked";
  created_at: string;
}

export default function SharedLinksPage() {
  const { toast } = useToast();
  const [links, setLinks] = useState<SharedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadLinks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listSharedLinks({ skip, limit });
      setLinks(res.shared_links || []);
      setTotal(res.total || 0);
      toast("Liens partagés chargés", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [skip, limit, toast]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const confirmDelete = async () => {
    if (deletingId === null) return;
    try {
      await adminApi.deleteSharedLink(deletingId);
      toast("Lien supprimé", "success");
      await loadLinks();
      setDeletingId(null);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast("URL copiée", "success");
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
        title="Liens Partagés"
        description={`Gérez les ${total} liens partagés`}
      />

      {/* Loading */}
      {loading ? (
        <LoadingScreen />
      ) : links.length === 0 ? (
        <EmptyState
          icon={ExternalLink}
          title="Aucun lien partagé"
          description="Aucun lien partagé n'a été créé"
        />
      ) : isMobile ? (
        // Mobile cards
        <div className="space-y-3">
          {links.map((link) => (
            <Card key={link.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <Badge variant={link.status === "active" ? "success" : "error"}>
                    {link.status === "active" ? "Actif" : "Révoqué"}
                  </Badge>
                  <p className="text-xs text-text-muted mt-2">{link.user_email}</p>
                </div>
              </div>
              <div className="space-y-2 text-xs mb-3">
                <div className="flex justify-between">
                  <span className="text-text-muted">Type:</span>
                  <span className="text-text-secondary">{link.link_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Vues:</span>
                  <span className="text-text-secondary">{link.view_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Créé:</span>
                  <span className="text-text-secondary">{formatDate(link.created_at)}</span>
                </div>
              </div>
              <p className="font-mono text-[10px] text-text-secondary bg-bg-hover p-2 rounded mb-3 break-all">
                {link.url}
              </p>
              <div className="flex gap-2">
                <Btn
                  variant="default"
                  onClick={() => copyUrl(link.url)}
                  small
                  icon={Copy}
                  className="flex-1"
                >
                  Copier
                </Btn>
                <Btn
                  variant="danger"
                  onClick={() => setDeletingId(link.id)}
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
                  URL
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Type
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Vues
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Statut
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-secondary">{link.user_email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs text-text-secondary break-all max-w-xs">{link.url}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="default">{link.link_type}</Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <p className="text-xs text-text-secondary">{link.view_count}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={link.status === "active" ? "success" : "error"}>
                      {link.status === "active" ? "Actif" : "Révoqué"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Btn
                        variant="default"
                        onClick={() => copyUrl(link.url)}
                        small
                        icon={Copy}
                      />
                      <Btn
                        variant="danger"
                        onClick={() => setDeletingId(link.id)}
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
        title="Supprimer le lien"
        message="Êtes-vous sûr de vouloir supprimer ce lien partagé ? Cette action est irréversible."
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </PageWrapper>
  );
}
