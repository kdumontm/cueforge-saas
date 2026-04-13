"use client";
import { useState, useEffect, useCallback } from "react";
import { Webhook, Trash2, Play } from "lucide-react";
import {
  Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, ConfirmModal, useToast,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface WebhookData {
  id: number;
  user_id: number;
  user_email?: string;
  url: string;
  events: string[];
  status?: string;
  created_at: string;
}

export default function WebhooksPage() {
  const { toast } = useToast();
  const [webhooks, setWebhooks] = useState<WebhookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadWebhooks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listWebhooks();
      setWebhooks(res.webhooks || []);
      toast("Webhooks chargés", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadWebhooks();
  }, [loadWebhooks]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const testWebhook = async (id: number) => {
    try {
      setTestingId(id);
      await adminApi.testWebhook(id);
      toast("Webhook testé avec succès", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setTestingId(null);
    }
  };

  const confirmDelete = async () => {
    if (deletingId === null) return;
    try {
      await adminApi.deleteWebhook(deletingId);
      toast("Webhook supprimé", "success");
      await loadWebhooks();
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

  return (
    <PageWrapper>
      <SectionHeader
        title="Webhooks"
        description={`Gérez les ${webhooks.length} webhooks`}
      />

      {/* Loading */}
      {loading ? (
        <LoadingScreen />
      ) : webhooks.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="Aucun webhook"
          description="Aucun webhook n'a été configuré"
        />
      ) : isMobile ? (
        // Mobile cards
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <Card key={wh.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <p className="text-xs text-text-muted">{wh.user_email}</p>
                  <p className="font-mono text-xs text-text-secondary mt-1 break-all">{wh.url}</p>
                </div>
              </div>
              <div className="mb-3">
                <p className="text-xs font-semibold text-text-muted mb-2">Événements:</p>
                <div className="flex flex-wrap gap-1">
                  {wh.events.map((evt) => (
                    <Badge key={evt} variant="default">
                      {evt}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Btn
                  variant="default"
                  onClick={() => testWebhook(wh.id)}
                  small
                  icon={Play}
                  className="flex-1"
                  loading={testingId === wh.id}
                >
                  Tester
                </Btn>
                <Btn
                  variant="danger"
                  onClick={() => setDeletingId(wh.id)}
                  small
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
                  Événements
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
              {webhooks.map((wh) => (
                <tr key={wh.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-secondary">{wh.user_email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs text-text-secondary break-all max-w-xs">{wh.url}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {wh.events.slice(0, 3).map((evt) => (
                        <Badge key={evt} variant="default">
                          {evt}
                        </Badge>
                      ))}
                      {wh.events.length > 3 && (
                        <Badge variant="default">+{wh.events.length - 3}</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">{formatDate(wh.created_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Btn
                        variant="default"
                        onClick={() => testWebhook(wh.id)}
                        small
                        icon={Play}
                        loading={testingId === wh.id}
                      >
                        Tester
                      </Btn>
                      <Btn
                        variant="danger"
                        onClick={() => setDeletingId(wh.id)}
                        small
                      >
                        Supprimer
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Delete modal */}
      <ConfirmModal
        open={deletingId !== null}
        title="Supprimer le webhook"
        message="Êtes-vous sûr de vouloir supprimer ce webhook ? Cette action est irréversible."
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </PageWrapper>
  );
}
