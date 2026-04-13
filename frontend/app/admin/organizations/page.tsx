"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Search, Building2,
} from "lucide-react";
import {
  Input, Btn, Card, Badge, PageWrapper, SectionHeader, LoadingScreen, EmptyState, useToast, StatCard,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface Organization {
  id: number;
  name: string;
  plan: "free" | "pro" | "unlimited";
  member_count: number;
  created_at: string;
  updated_at: string;
  seats_used: number;
  seats_limit: number | null;
}

export default function OrganizationsPage() {
  const { toast } = useToast();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const loadOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listOrganizations({
        search: search || undefined,
        skip,
        limit,
      });
      setOrganizations(res.organizations || []);
      setTotal(res.total || 0);
      toast("Organisations chargées", "success");
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
    loadOrganizations();
  }, [loadOrganizations]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

  const getCapacityColor = (org: Organization) => {
    if (!org.seats_limit) return "#10b981";
    const usage = org.seats_used / org.seats_limit;
    if (usage >= 1) return "#ef4444";
    if (usage >= 0.8) return "#eab308";
    return "#10b981";
  };

  const pages = Math.ceil(total / limit);
  const currentPage = Math.floor(skip / limit) + 1;

  return (
    <PageWrapper>
      <SectionHeader
        title="Organisations"
        description={`Gérez les ${total} organisations`}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Building2} label="Total" value={total} color="#6366f1" />
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Input
            placeholder="Rechercher par nom..."
            value={search}
            onChange={setSearch}
            label="Recherche"
          />
          <div className="flex items-end gap-2">
            <Btn
              variant="primary"
              onClick={() => {
                setSkip(0);
                loadOrganizations();
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
      ) : organizations.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aucune organisation trouvée"
          description={search ? "Modifiez les filtres" : "Aucune organisation"}
        />
      ) : isMobile ? (
        // Mobile cards
        <div className="space-y-3">
          {organizations.map((org) => (
            <Card key={org.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-text-primary">
                    {org.name}
                  </h3>
                  <p className="text-xs text-text-muted">ID: {org.id}</p>
                </div>
              </div>

              <div className="space-y-2 text-xs mb-3">
                <div className="flex justify-between">
                  <span className="text-text-muted">Plan:</span>
                  <Badge variant={getPlanVariant(org.plan)}>
                    {org.plan.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Membres:</span>
                  <span className="text-text-secondary">
                    {org.member_count}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Sièges:</span>
                  <span
                    className="text-text-secondary font-semibold"
                    style={{ color: getCapacityColor(org) }}
                  >
                    {org.seats_used}
                    {org.seats_limit ? `/${org.seats_limit}` : "/illimité"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Créée:</span>
                  <span className="text-text-secondary">
                    {formatDate(org.created_at)}
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
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Plan
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Membres
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Sièges
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Créée
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Modifiée
                </th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => (
                <tr
                  key={org.id}
                  className="border-b border-border-subtle hover:bg-bg-hover transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium text-text-primary">
                      {org.name}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={getPlanVariant(org.plan)}>
                      {org.plan.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <p className="text-xs font-semibold text-text-primary">
                      {org.member_count}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <p
                      className="text-xs font-semibold"
                      style={{ color: getCapacityColor(org) }}
                    >
                      {org.seats_used}
                      {org.seats_limit ? `/${org.seats_limit}` : "/∞"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">
                      {formatDate(org.created_at)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">
                      {formatDate(org.updated_at)}
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
