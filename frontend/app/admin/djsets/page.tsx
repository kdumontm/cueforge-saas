"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Search, Disc3,
} from "lucide-react";
import {
  Input, Btn, Card, PageWrapper, SectionHeader, LoadingScreen, EmptyState, useToast, StatCard,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface DJSet {
  id: number;
  name: string;
  user_id: number;
  user_email: string;
  track_count: number;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export default function DJSetsPage() {
  const { toast } = useToast();
  const [djsets, setDJSets] = useState<DJSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const loadDJSets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listDjSets({
        search: search || undefined,
        skip,
        limit,
      });
      setDJSets(res.djsets || []);
      setTotal(res.total || 0);
      toast("DJ Sets chargés", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [search, skip, limit, toast]);

  useEffect(() => {
    setSkip(0);
  }, [search]);

  useEffect(() => {
    loadDJSets();
  }, [loadDJSets]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "—";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  };

  const pages = Math.ceil(total / limit);
  const currentPage = Math.floor(skip / limit) + 1;

  return (
    <PageWrapper>
      <SectionHeader
        title="DJ Sets"
        description={`Gérez les ${total} DJ Sets`}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Disc3} label="Total" value={total} color="#f59e0b" />
        <StatCard
          icon={Disc3}
          label="Avg. Pistes"
          value={
            djsets.length > 0
              ? Math.round(
                  djsets.reduce((sum, s) => sum + s.track_count, 0) /
                    djsets.length
                )
              : 0
          }
          color="#06b6d4"
        />
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Input
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={setSearch}
            label="Recherche"
          />
          <div className="flex items-end gap-2">
            <Btn
              variant="primary"
              onClick={() => {
                setSkip(0);
                loadDJSets();
              }}
              small
              icon={Search}
            >
              Rechercher
            </Btn>
          </div>
        </div>
      </Card>

      {/* Loading */}
      {loading ? (
        <LoadingScreen />
      ) : djsets.length === 0 ? (
        <EmptyState
          icon={Disc3}
          title="Aucun DJ Set trouvé"
          description={search ? "Modifiez les filtres" : "Aucun DJ Set"}
        />
      ) : isMobile ? (
        // Mobile cards
        <div className="space-y-3">
          {djsets.map((djset) => (
            <Card key={djset.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-text-primary">
                    {djset.name}
                  </h3>
                  <p className="text-xs text-text-muted">{djset.user_email}</p>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-muted">Pistes:</span>
                  <span className="text-text-secondary">
                    {djset.track_count}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Durée:</span>
                  <span className="text-text-secondary">
                    {formatDuration(djset.duration_minutes)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Créé:</span>
                  <span className="text-text-secondary">
                    {formatDate(djset.created_at)}
                  </span>
                </div>
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
                  Nom
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Utilisateur
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Pistes
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Durée
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Créé
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Modifié
                </th>
              </tr>
            </thead>
            <tbody>
              {djsets.map((djset) => (
                <tr
                  key={djset.id}
                  className="border-b border-border-subtle hover:bg-bg-hover transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium text-text-primary">
                      {djset.name}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-secondary">
                      {djset.user_email}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <p className="text-xs font-semibold text-text-primary">
                      {djset.track_count}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <p className="text-xs text-text-secondary">
                      {formatDuration(djset.duration_minutes)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">
                      {formatDate(djset.created_at)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">
                      {formatDate(djset.updated_at)}
                    </p>
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
    </PageWrapper>
  );
}
