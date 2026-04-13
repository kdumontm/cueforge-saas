"use client";
import { useState, useEffect, useCallback } from "react";
import { Key, Trash2 } from "lucide-react";
import {
  Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, ConfirmModal, useToast,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface ApiKey {
  id: number;
  user_id: number;
  user_email?: string;
  key: string;
  status: "active" | "revoked";
  created_at: string;
  last_used_at?: string;
}

export default function ApiKeysPage() {
  const { toast } = useToast();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const loadApiKeys = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listApiKeys();
      setApiKeys(res.api_keys || []);
      toast("Clés API chargées", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const confirmRevoke = async () => {
    if (revokingId === null) return;
    try {
      await adminApi.revokeApiKey(revokingId);
      toast("Clé API révoquée", "success");
      await loadApiKeys();
      setRevokingId(null);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
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

  const maskKey = (key: string) => {
    return key.substring(0, 4) + "..." + key.substring(key.length - 4);
  };

  return (
    <PageWrapper>
      <SectionHeader
        title="Clés API"
        description={`Gérez les ${apiKeys.length} clés API`}
      />

      {/* Loading */}
      {loading ? (
        <LoadingScreen />
      ) : apiKeys.length === 0 ? (
        <EmptyState
          icon={Key}
          title="Aucune clé API"
          description="Aucune clé API n'a été créée"
        />
      ) : isMobile ? (
        // Mobile cards
        <div className="space-y-3">
          {apiKeys.map((ak) => (
            <Card key={ak.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <p className="text-xs text-text-muted">{ak.user_email}</p>
                  <p className="font-mono text-xs text-text-secondary mt-1">{maskKey(ak.key)}</p>
                </div>
                <Badge variant={ak.status === "active" ? "success" : "error"}>
                  {ak.status === "active" ? "Actif" : "Révoqué"}
                </Badge>
              </div>
              <div className="space-y-2 text-xs mb-3">
                <div className="flex justify-between">
                  <span className="text-text-muted">Créé:</span>
                  <span className="text-text-secondary">{formatDate(ak.created_at)}</span>
                </div>
                {ak.last_used_at && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Dernier usage:</span>
                    <span className="text-text-secondary">{formatDate(ak.last_used_at)}</span>
                  </div>
                )}
              </div>
              {ak.status === "active" && (
                <Btn
                  variant="danger"
                  onClick={() => setRevokingId(ak.id)}
                  small
                  className="w-full"
                >
                  Révoquer
                </Btn>
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
                  Utilisateur
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Clé
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Statut
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Créée
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Dernier usage
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((ak) => (
                <tr key={ak.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-secondary">{ak.user_email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs text-text-secondary">{maskKey(ak.key)}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={ak.status === "active" ? "success" : "error"}>
                      {ak.status === "active" ? "Actif" : "Révoqué"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">{formatDate(ak.created_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">{ak.last_used_at ? formatDate(ak.last_used_at) : "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    {ak.status === "active" && (
                      <Btn
                        variant="danger"
                        onClick={() => setRevokingId(ak.id)}
                        small
                      >
                        Révoquer
                      </Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Revoke modal */}
      <ConfirmModal
        open={revokingId !== null}
        title="Révoquer la clé API"
        message="Êtes-vous sûr de vouloir révoquer cette clé API ? Cette action est irréversible et empêchera les accès avec cette clé."
        variant="danger"
        onConfirm={confirmRevoke}
        onCancel={() => setRevokingId(null)}
      />
    </PageWrapper>
  );
}
