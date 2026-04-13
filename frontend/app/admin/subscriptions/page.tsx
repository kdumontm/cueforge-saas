"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Search, CreditCard, AlertTriangle,
} from "lucide-react";
import {
  Input, Select, Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, useToast, StatCard,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface Subscription {
  id: number;
  user_id: number;
  user_email: string;
  plan: "free" | "pro" | "unlimited";
  status: "active" | "trial" | "canceled" | "expired";
  period_start: string;
  period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  mrr: number; // Monthly recurring revenue
}

interface Stats {
  mrr: number;
  active: number;
  trial: number;
  churned: number;
}

export default function SubscriptionsPage() {
  const { toast } = useToast();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ mrr: 0, active: 0, trial: 0, churned: 0 });
  const [isMobile, setIsMobile] = useState(false);

  const loadSubscriptions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listSubscriptions({
        search: search || undefined,
        plan: planFilter === "all" ? undefined : planFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        skip,
        limit,
      });
      setSubscriptions(res.subscriptions || []);
      setTotal(res.total || 0);

      // Load stats
      const statsRes = await adminApi.subscriptionStats();
      setStats(statsRes || { mrr: 0, active: 0, trial: 0, churned: 0 });

      toast("Abonnements chargés", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [search, planFilter, statusFilter, skip, limit, toast]);

  useEffect(() => {
    setSkip(0);
  }, [search, planFilter, statusFilter]);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getStatusVariant = (status: string): "default" | "success" | "error" | "warning" => {
    switch (status) {
      case "active":
        return "success";
      case "trial":
        return "info";
      case "canceled":
        return "error";
      default:
        return "warning";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active":
        return "Actif";
      case "trial":
        return "Essai";
      case "canceled":
        return "Annulé";
      case "expired":
        return "Expiré";
      default:
        return status;
    }
  };

  const getPlanVariant = (plan: string): "default" | "purple" | "pink" => {
    switch (plan) {
      case "pro":
        return "purple";
      case "unlimited":
        return "pink";
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
        title="Abonnements"
        description={`Gérez les ${total} abonnements`}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={CreditCard}
          label="MRR"
          value={`€${stats.mrr.toLocaleString("fr-FR")}`}
          color="#10b981"
        />
        <StatCard
          icon={CreditCard}
          label="Actifs"
          value={stats.active}
          color="#3b82f6"
        />
        <StatCard
          icon={AlertTriangle}
          label="Essai"
          value={stats.trial}
          color="#eab308"
        />
        <StatCard
          icon={AlertTriangle}
          label="Churned"
          value={stats.churned}
          color="#ef4444"
        />
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <Input
            placeholder="Rechercher par email..."
            value={search}
            onChange={setSearch}
            label="Recherche"
          />
          <Select
            label="Plan"
            value={planFilter}
            onChange={setPlanFilter}
            options={[
              { value: "all", label: "Tous les plans" },
              { value: "free", label: "Free" },
              { value: "pro", label: "Pro" },
              { value: "unlimited", label: "Unlimited" },
            ]}
          />
          <Select
            label="Statut"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "Tous les statuts" },
              { value: "active", label: "Actif" },
              { value: "trial", label: "Essai" },
              { value: "canceled", label: "Annulé" },
              { value: "expired", label: "Expiré" },
            ]}
          />
          <div className="flex items-end gap-2">
            <Btn
              variant="primary"
              onClick={() => {
                setSkip(0);
                loadSubscriptions();
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
      ) : subscriptions.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Aucun abonnement trouvé"
          description={search || planFilter !== "all" || statusFilter !== "all" ? "Modifiez les filtres" : "Aucun abonnement"}
        />
      ) : isMobile ? (
        // Mobile cards
        <div className="space-y-3">
          {subscriptions.map((sub) => (
            <Card key={sub.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-text-primary">{sub.user_email}</h3>
                  <p className="text-xs text-text-muted">ID: {sub.id}</p>
                </div>
              </div>

              <div className="space-y-2 text-xs mb-3">
                <div className="flex justify-between">
                  <span className="text-text-muted">Plan:</span>
                  <Badge variant={getPlanVariant(sub.plan)}>
                    {sub.plan.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Statut:</span>
                  <Badge variant={getStatusVariant(sub.status)}>
                    {getStatusLabel(sub.status)}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Début:</span>
                  <span className="text-text-secondary">
                    {formatDate(sub.period_start)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Fin:</span>
                  <span className="text-text-secondary">
                    {formatDate(sub.period_end)}
                  </span>
                </div>
                {sub.cancel_at_period_end && (
                  <div className="p-2 rounded bg-red-500/10 border border-red-500/25">
                    <p className="text-[11px] text-red-400 font-medium">
                      Annulation prévue à la fin de la période
                    </p>
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
                  Email
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Plan
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Statut
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Début
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Fin
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Annulation
                </th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub) => (
                <tr key={sub.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-secondary">{sub.user_email}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={getPlanVariant(sub.plan)}>
                      {sub.plan.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={getStatusVariant(sub.status)}>
                      {getStatusLabel(sub.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">
                      {formatDate(sub.period_start)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">
                      {formatDate(sub.period_end)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {sub.cancel_at_period_end ? (
                      <Badge variant="error">OUI</Badge>
                    ) : (
                      <span className="text-xs text-text-muted">—</span>
                    )}
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
