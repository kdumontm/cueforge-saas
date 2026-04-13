"use client";
import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Database, Radio, AlertTriangle, HelpCircle,
  HeartPulse, CheckCircle2, AlertCircle,
} from "lucide-react";
import {
  Btn, Card, PageWrapper, SectionHeader, LoadingScreen, useToast,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface ServiceStatus {
  name: string;
  status: "healthy" | "warning" | "unhealthy";
  message: string;
}

interface DbStats {
  database_size: string;
  active_connections: number;
  tables: Array<{
    name: string;
    row_count: number;
    size: string;
  }>;
}

export default function HealthPage() {
  const { toast } = useToast();
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      setRefreshing(true);

      // Load service health
      const healthRes = await adminApi.getHealth();
      setServices(healthRes.services || []);

      // Load DB stats
      const dbRes = await adminApi.getDbStats();
      setDbStats(dbRes);

      setLastUpdate(new Date());
      toast("Données de santé chargées", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  useEffect(() => {
    const interval = setInterval(loadHealth, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, [loadHealth]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return CheckCircle2;
      case "warning":
        return AlertTriangle;
      case "unhealthy":
        return AlertCircle;
      default:
        return HelpCircle;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "#10b981";
      case "warning":
        return "#eab308";
      case "unhealthy":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  const formatTime = (date: Date | null) => {
    if (!date) return "—";
    return date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <PageWrapper>
      <SectionHeader
        title="Santé du Système"
        description="État des services et statistiques de la base de données"
        actions={
          <Btn
            variant="primary"
            onClick={loadHealth}
            disabled={refreshing}
            loading={refreshing}
            icon={RefreshCw}
            small
          >
            Actualiser
          </Btn>
        }
      />

      {loading ? (
        <LoadingScreen />
      ) : (
        <>
          {/* Last update */}
          <div className="mb-6 text-xs text-text-muted">
            Dernière mise à jour: {formatTime(lastUpdate)}
          </div>

          {/* Services */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              État des Services
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {services.map((service) => {
                const Icon = getStatusIcon(service.status);
                const color = getStatusColor(service.status);
                return (
                  <Card key={service.name} className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: color + "18" }}
                      >
                        <Icon size={16} style={{ color }} />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-text-primary">
                          {service.name}
                        </h4>
                        <p className="text-xs text-text-muted mt-1">
                          {service.message}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* DB Stats */}
          {dbStats && (
            <div>
              <h3 className="text-lg font-semibold text-text-primary mb-4">
                Statistiques Base de Données
              </h3>

              {/* Summary */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-500/15">
                      <Database size={16} style={{ color: "#3b82f6" }} />
                    </div>
                    <span className="text-[11px] font-semibold text-text-muted uppercase">
                      Taille Totale
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-text-primary font-mono">
                    {dbStats.database_size}
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-green-500/15">
                      <Radio size={16} style={{ color: "#10b981" }} />
                    </div>
                    <span className="text-[11px] font-semibold text-text-muted uppercase">
                      Connexions Actives
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-text-primary font-mono">
                    {dbStats.active_connections}
                  </div>
                </Card>
              </div>

              {/* Tables */}
              <div>
                <h4 className="text-sm font-semibold text-text-primary mb-3">
                  Tables
                </h4>
                <Card className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border-subtle">
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                          Nom
                        </th>
                        <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                          Lignes
                        </th>
                        <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                          Taille
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbStats.tables.map((table) => (
                        <tr
                          key={table.name}
                          className="border-b border-border-subtle hover:bg-bg-hover transition-colors"
                        >
                          <td className="px-4 py-3">
                            <p className="text-xs font-mono text-text-secondary">
                              {table.name}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <p className="text-xs text-text-primary font-semibold">
                              {table.row_count.toLocaleString("fr-FR")}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <p className="text-xs text-text-muted">
                              {table.size}
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </PageWrapper>
  );
}
