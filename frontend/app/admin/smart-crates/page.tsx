"use client";
import { useState, useEffect, useCallback } from "react";
import { Boxes, Trash2 } from "lucide-react";
import {
  Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, ConfirmModal, useToast,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface SmartCrate {
  id: number;
  user_id: number;
  user_email?: string;
  name: string;
  criteria: Record<string, any>;
  track_count?: number;
  created_at: string;
}

export default function SmartCratesPage() {
  const { toast } = useToast();
  const [crates, setCrates] = useState<SmartCrate[]>([]);
  const [loading, setLoading] = useState(true);
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadCrates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listSmartCrates({ skip, limit });
      setCrates(res.smart_crates || []);
      setTotal(res.total || 0);
      toast("Smart Crates chargées", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [skip, limit, toast]);

  useEffect(() => {
    loadCrates();
  }, [loadCrates]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const confirmDelete = async () => {
    if (deletingId === null) return;
    try {
      await adminApi.deleteSmartCrate(deletingId);
      toast("Smart Crate supprimée", "success");
      await loadCrates();
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

  const getCriteriaSummary = (criteria: Record<string, any>) => {
    const keys = Object.keys(criteria);
    return keys.slice(0, 3).join(", ") + (keys.length > 3 ? "..." : "");
  };

  const pages = Math.ceil(total / limit);
  const currentPage = Math.floor(skip / limit) + 1;

  return (
    <PageWrapper>
      <SectionHeader
        title="Smart Crates"
        description={`Gérez les ${total} smart crates`}
      />

      {/* Loading */}
      {loading ? (
        <LoadingScreen />
      ) : crates.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Aucune smart crate"
          description="Aucune smart crate n'a été créée"
        />
      ) : isMobile ? (
        // Mobile cards
        <div className="space-y-3">
          {crates.map((crate) => (
            <Card key={crate.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-text-primary text-sm">{crate.name}</h3>
                  <p className="text-xs text-text-muted">{crate.user_email}</p>
                </div>
              </div>
              <div className="space-y-2 text-xs mb-3">
                <div className="flex justify-between">
                  <span className="text-text-muted">Pistes:</span>
                  <span className="text-text-secondary">{crate.track_count || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Critères:</span>
                  <span className="text-text-secondary">{getCriteriaSummary(crate.criteria)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Créé:</span>
                  <span className="text-text-secondary">{formatDate(crate.created_at)}</span>
                </div>
              </div>
              <Btn
                variant="danger"
                onClick={() => setDeletingId(crate.id)}
                small
                icon={Trash2}
                className="w-full"
              >
                Supprimer
              </Btn>
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
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Utilisateur
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Pistes
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Critères
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
              {crates.map((crate) => (
                <tr key={crate.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium text-text-primary">{crate.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-secondary">{crate.user_email}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <p className="text-xs text-text-secondary font-mono">{crate.track_count || 0}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-secondary line-clamp-1">
                      {getCriteriaSummary(crate.criteria)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">{formatDate(crate.created_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Btn
                      variant="danger"
                      onClick={() => setDeletingId(crate.id)}
                      small
                      icon={Trash2}
                    />
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
        title="Supprimer la smart crate"
        message="Êtes-vous sûr de vouloir supprimer cette smart crate ? Cette action est irréversible."
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </PageWrapper>
  );
}
