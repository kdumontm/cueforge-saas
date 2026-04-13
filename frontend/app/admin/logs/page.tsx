"use client";
import { useState, useEffect, useCallback } from "react";
import { ScrollText, Search } from "lucide-react";
import {
  Input, Select, Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, useToast,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface ActivityLog {
  id: number;
  user_id?: number;
  user_email?: string;
  action: string;
  details: string;
  ip_address?: string;
  created_at: string;
}

export default function LogsPage() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [skip, setSkip] = useState(0);
  const [limit] = useState(30);
  const [total, setTotal] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listActivityLogsEnhanced({
        action: actionFilter === "all" ? undefined : actionFilter,
        search: search || undefined,
        skip,
        limit,
      });
      setLogs(res.logs || res.activity || []);
      setTotal(res.total || 0);
      toast("Logs chargés", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [search, actionFilter, skip, limit, toast]);

  useEffect(() => {
    setSkip(0);
  }, [search, actionFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getActionVariant = (action: string): "default" | "info" | "warning" | "error" | "success" => {
    if (action.includes("delete")) return "error";
    if (action.includes("create")) return "success";
    if (action.includes("update")) return "info";
    if (action.includes("login")) return "warning";
    return "default";
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const pages = Math.ceil(total / limit);
  const currentPage = Math.floor(skip / limit) + 1;

  return (
    <PageWrapper>
      <SectionHeader
        title="Journaux d'Activité"
        description={`Consultez les ${total} derniers événements`}
      />

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <Input
            placeholder="Rechercher dans les détails..."
            value={search}
            onChange={setSearch}
            label="Recherche"
          />
          <Select
            label="Type d'action"
            value={actionFilter}
            onChange={setActionFilter}
            options={[
              { value: "all", label: "Toutes les actions" },
              { value: "login", label: "Connexion" },
              { value: "create", label: "Création" },
              { value: "update", label: "Modification" },
              { value: "delete", label: "Suppression" },
            ]}
          />
          <div />
          <div className="flex items-end">
            <Btn
              variant="primary"
              onClick={() => {
                setSkip(0);
                loadLogs();
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
      ) : logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Aucun log trouvé"
          description="Aucun événement ne correspond à votre recherche"
        />
      ) : isMobile ? (
        // Mobile cards
        <div className="space-y-3">
          {logs.map((log) => (
            <Card key={log.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={getActionVariant(log.action)}>
                      {log.action}
                    </Badge>
                  </div>
                  <p className="text-xs text-text-muted">{log.user_email || "Système"}</p>
                  <p className="text-xs text-text-muted mt-1">{formatDate(log.created_at)}</p>
                </div>
              </div>
              <p className="text-xs text-text-secondary line-clamp-2 mb-2">{log.details}</p>
              <Btn
                variant="default"
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                small
                className="w-full"
              >
                {expandedId === log.id ? "Fermer" : "Détails"}
              </Btn>
              {expandedId === log.id && (
                <div className="mt-3 bg-bg-hover p-3 rounded-lg space-y-2">
                  <div>
                    <p className="text-[10px] font-semibold text-text-muted mb-1">Détails</p>
                    <p className="text-xs text-text-secondary">{log.details}</p>
                  </div>
                  {log.ip_address && (
                    <div>
                      <p className="text-[10px] font-semibold text-text-muted mb-1">Adresse IP</p>
                      <p className="text-xs font-mono text-text-secondary">{log.ip_address}</p>
                    </div>
                  )}
                </div>
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
                  Timestamp
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Utilisateur
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Détails
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  IP
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-border-subtle hover:bg-bg-hover transition-colors cursor-pointer"
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                >
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">{formatDate(log.created_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-secondary">{log.user_email || "Système"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={getActionVariant(log.action)}>
                      {log.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-secondary line-clamp-1">{log.details}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-mono text-text-muted">{log.ip_address || "—"}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Expanded view */}
      {expandedId !== null && !isMobile && (
        <Card className="mt-6 p-6">
          {logs.map((log) => {
            if (log.id !== expandedId) return null;
            return (
              <div key={log.id} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-semibold text-text-muted mb-1">Timestamp</p>
                    <p className="text-sm text-text-primary">{formatDate(log.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-muted mb-1">Utilisateur</p>
                    <p className="text-sm text-text-primary">{log.user_email || "Système"}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-muted mb-1">Action</p>
                  <Badge variant={getActionVariant(log.action)} className="text-xs">
                    {log.action}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-muted mb-1">Détails</p>
                  <p className="text-sm text-text-secondary bg-bg-hover p-3 rounded-lg break-words">
                    {log.details}
                  </p>
                </div>
                {log.ip_address && (
                  <div>
                    <p className="text-sm font-semibold text-text-muted mb-1">Adresse IP</p>
                    <p className="text-sm font-mono text-text-primary bg-bg-hover p-3 rounded-lg">
                      {log.ip_address}
                    </p>
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
    </PageWrapper>
  );
}
