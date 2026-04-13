"use client";
import { useState, useEffect, useCallback } from "react";
import { FlaskConical, Clock, CheckCircle } from "lucide-react";
import {
  Input, Select, Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, useToast, StatCard,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface Analysis {
  id: number;
  track_id: number;
  track_title?: string;
  track_artist?: string;
  status: "pending" | "processing" | "completed" | "failed";
  duration_ms?: number;
  services_used?: string[];
  created_at: string;
}

interface Stats {
  total: number;
  completed: number;
  failed: number;
  average_duration_ms: number;
  success_rate: number;
}

export default function AnalysesPage() {
  const { toast } = useToast();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, completed: 0, failed: 0, average_duration_ms: 0, success_rate: 0 });
  const [isMobile, setIsMobile] = useState(false);

  const loadAnalyses = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listAnalyses({
        status: statusFilter === "all" ? undefined : statusFilter,
        skip,
        limit,
      });
      setAnalyses(res.analyses || []);
      setTotal(res.total || 0);

      try {
        const statsRes = await adminApi.analysisStats();
        setStats(statsRes);
      } catch {
        // Stats might not be available
      }

      toast("Analyses chargées", "success");
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
    loadAnalyses();
  }, [loadAnalyses]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getStatusVariant = (status: string): "default" | "info" | "warning" | "error" | "success" => {
    switch (status) {
      case "completed":
        return "success";
      case "processing":
        return "info";
      case "failed":
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

  const formatDuration = (ms?: number) => {
    if (!ms) return "—";
    const seconds = (ms / 1000).toFixed(2);
    return `${seconds}s`;
  };

  const filteredAnalyses = search
    ? analyses.filter(
        (a) =>
          a.track_title?.toLowerCase().includes(search.toLowerCase()) ||
          a.track_artist?.toLowerCase().includes(search.toLowerCase())
      )
    : analyses;

  const pages = Math.ceil(total / limit);
  const currentPage = Math.floor(skip / limit) + 1;

  return (
    <PageWrapper>
      <SectionHeader
        title="Analyses"
        description={`Consultez les ${total} analyses de pistes`}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={FlaskConical} label="Total" value={stats.total} color="#6366f1" />
        <StatCard icon={CheckCircle} label="Complétées" value={stats.completed} color="#10b981" />
        <StatCard
          icon={Clock}
          label="Durée moy."
          value={formatDuration(stats.average_duration_ms)}
          color="#3b82f6"
        />
        <StatCard
          icon={CheckCircle}
          label="Taux de succès"
          value={`${Math.round(stats.success_rate * 100)}%`}
          color="#8b5cf6"
        />
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Input
            placeholder="Rechercher par titre ou artiste..."
            value={search}
            onChange={setSearch}
            label="Recherche"
          />
          <Select
            label="Statut"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "Tous les statuts" },
              { value: "pending", label: "En attente" },
              { value: "processing", label: "En cours" },
              { value: "completed", label: "Complétée" },
              { value: "failed", label: "Erreur" },
            ]}
          />
          <div className="flex items-end">
            <Btn
              variant="primary"
              onClick={() => {
                setSkip(0);
                loadAnalyses();
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
      ) : filteredAnalyses.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="Aucune analyse"
          description="Aucune analyse ne correspond à vos critères"
        />
      ) : isMobile ? (
        // Mobile cards
        <div className="space-y-3">
          {filteredAnalyses.map((analysis) => (
            <Card key={analysis.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <Badge variant={getStatusVariant(analysis.status)}>
                    {analysis.status.toUpperCase()}
                  </Badge>
                  <h3 className="font-semibold text-text-primary text-sm mt-2">{analysis.track_title}</h3>
                  <p className="text-xs text-text-muted">{analysis.track_artist}</p>
                </div>
              </div>
              <div className="space-y-2 text-xs mb-3">
                <div className="flex justify-between">
                  <span className="text-text-muted">Date:</span>
                  <span className="text-text-secondary">{formatDate(analysis.created_at)}</span>
                </div>
                {analysis.duration_ms && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Durée:</span>
                    <span className="text-text-secondary">{formatDuration(analysis.duration_ms)}</span>
                  </div>
                )}
                {analysis.services_used && analysis.services_used.length > 0 && (
                  <div>
                    <p className="text-text-muted mb-1">Services:</p>
                    <div className="flex flex-wrap gap-1">
                      {analysis.services_used.map((svc) => (
                        <Badge key={svc} variant="default">
                          {svc}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
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
                  Piste
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Statut
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Durée
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Services
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAnalyses.map((analysis) => (
                <tr key={analysis.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-xs font-medium text-text-primary">{analysis.track_title}</p>
                      <p className="text-[10px] text-text-muted">{analysis.track_artist}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={getStatusVariant(analysis.status)}>
                      {analysis.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <p className="text-xs text-text-secondary font-mono">{formatDuration(analysis.duration_ms)}</p>
                  </td>
                  <td className="px-4 py-3">
                    {analysis.services_used && analysis.services_used.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {analysis.services_used.map((svc) => (
                          <Badge key={svc} variant="default">
                            {svc}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted">—</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">{formatDate(analysis.created_at)}</p>
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
