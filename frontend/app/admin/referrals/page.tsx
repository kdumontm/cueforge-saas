"use client";
import { useState, useEffect, useCallback } from "react";
import { UserPlus, TrendingUp } from "lucide-react";
import {
  Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, useToast, StatCard,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface Referral {
  id: number;
  referrer_id: number;
  referrer_email?: string;
  referred_id: number;
  referred_email?: string;
  status: "pending" | "completed" | "cancelled";
  created_at: string;
}

interface Stats {
  total: number;
  completed: number;
  pending: number;
  conversion_rate: number;
}

export default function ReferralsPage() {
  const { toast } = useToast();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, completed: 0, pending: 0, conversion_rate: 0 });
  const [isMobile, setIsMobile] = useState(false);

  const loadReferrals = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listReferrals({ skip, limit });
      setReferrals(res.referrals || []);
      setTotal(res.total || 0);

      try {
        const statsRes = await adminApi.referralStats();
        setStats(statsRes);
      } catch {
        // Stats might not be available
      }

      toast("Parrainage chargés", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [skip, limit, toast]);

  useEffect(() => {
    loadReferrals();
  }, [loadReferrals]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getStatusVariant = (status: string): "default" | "success" | "warning" | "info" => {
    switch (status) {
      case "completed":
        return "success";
      case "pending":
        return "warning";
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
        title="Parrainage"
        description={`Gérez les ${total} parrainages`}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={UserPlus} label="Total" value={stats.total} color="#6366f1" />
        <StatCard icon={TrendingUp} label="Complétés" value={stats.completed} color="#10b981" />
        <StatCard icon={UserPlus} label="En attente" value={stats.pending} color="#f59e0b" />
        <StatCard
          icon={TrendingUp}
          label="Taux de conversion"
          value={`${Math.round(stats.conversion_rate * 100)}%`}
          color="#3b82f6"
        />
      </div>

      {/* Loading */}
      {loading ? (
        <LoadingScreen />
      ) : referrals.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Aucun parrainage"
          description="Aucun parrainage n'a été enregistré"
        />
      ) : isMobile ? (
        // Mobile cards
        <div className="space-y-3">
          {referrals.map((ref) => (
            <Card key={ref.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <Badge variant={getStatusVariant(ref.status)}>
                    {ref.status === "completed" ? "Complété" : ref.status === "pending" ? "En attente" : "Annulé"}
                  </Badge>
                  <p className="text-xs text-text-muted mt-2">{formatDate(ref.created_at)}</p>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                <div>
                  <p className="font-semibold text-text-muted mb-1">Parrain</p>
                  <p className="text-text-secondary">{ref.referrer_email}</p>
                </div>
                <div>
                  <p className="font-semibold text-text-muted mb-1">Parrainé</p>
                  <p className="text-text-secondary">{ref.referred_email}</p>
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
                  Parrain
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Parrainé
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Statut
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((ref) => (
                <tr key={ref.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-secondary">{ref.referrer_email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-secondary">{ref.referred_email}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={getStatusVariant(ref.status)}>
                      {ref.status === "completed" ? "Complété" : ref.status === "pending" ? "En attente" : "Annulé"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">{formatDate(ref.created_at)}</p>
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
