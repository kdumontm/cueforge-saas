"use client";
import { useState, useEffect, useCallback } from "react";
import { Bell, Trash2, Send } from "lucide-react";
import {
  Input, Select, Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, ConfirmModal, useToast,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface Notification {
  id: number;
  message: string;
  type: "info" | "warning" | "error" | "success";
  target: "all" | "specific_plan" | "specific_users";
  target_value?: string;
  sent_at: string;
  user_count?: number;
}

export default function NotificationsAdminPage() {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [skip, setSkip] = useState(0);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastType, setBroadcastType] = useState("info");
  const [broadcastTarget, setBroadcastTarget] = useState("all");
  const [broadcastTargetValue, setBroadcastTargetValue] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listNotifications({ skip, limit });
      setNotifications(res.notifications || []);
      setTotal(res.total || 0);
      toast("Notifications chargées", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [skip, limit, toast]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const sendBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      toast("Le message ne peut pas être vide", "warning");
      return;
    }

    try {
      setBroadcasting(true);
      const data = {
        message: broadcastMessage,
        type: broadcastType,
        target: broadcastTarget,
        target_value: broadcastTargetValue || undefined,
      };
      await adminApi.broadcastNotification(data);
      toast("Notification envoyée", "success");
      setBroadcastMessage("");
      setBroadcastType("info");
      setBroadcastTarget("all");
      setBroadcastTargetValue("");
      setShowBroadcast(false);
      await loadNotifications();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setBroadcasting(false);
    }
  };

  const confirmDelete = async () => {
    if (deletingId === null) return;
    try {
      await adminApi.deleteNotification(deletingId);
      toast("Notification supprimée", "success");
      await loadNotifications();
      setDeletingId(null);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  const getTypeVariant = (type: string): "default" | "info" | "warning" | "error" | "success" => {
    switch (type) {
      case "error":
        return "error";
      case "warning":
        return "warning";
      case "success":
        return "success";
      default:
        return "info";
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

  const pages = Math.ceil(total / limit);
  const currentPage = Math.floor(skip / limit) + 1;

  return (
    <PageWrapper>
      <SectionHeader
        title="Notifications"
        description={`Gérez les ${total} notifications envoyées`}
        actions={
          <Btn
            variant="primary"
            onClick={() => setShowBroadcast(true)}
            icon={Send}
          >
            Envoyer une notification
          </Btn>
        }
      />

      {/* Broadcast modal */}
      {showBroadcast && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowBroadcast(false)}>
          <Card className="w-full max-w-lg mx-4 p-6" onClick={() => {}}>
            <h3 className="text-lg font-bold text-text-primary mb-4">Envoyer une notification</h3>
            <div className="space-y-4">
              <Input
                label="Message"
                value={broadcastMessage}
                onChange={setBroadcastMessage}
                placeholder="Votre message..."
                multiline
                rows={3}
              />
              <Select
                label="Type"
                value={broadcastType}
                onChange={setBroadcastType}
                options={[
                  { value: "info", label: "Information" },
                  { value: "warning", label: "Avertissement" },
                  { value: "error", label: "Erreur" },
                  { value: "success", label: "Succès" },
                ]}
              />
              <Select
                label="Cible"
                value={broadcastTarget}
                onChange={setBroadcastTarget}
                options={[
                  { value: "all", label: "Tous les utilisateurs" },
                  { value: "specific_plan", label: "Un plan spécifique" },
                  { value: "specific_users", label: "Utilisateurs spécifiques" },
                ]}
              />
              {broadcastTarget !== "all" && (
                <Input
                  label="Cible (plan ou ID utilisateur)"
                  value={broadcastTargetValue}
                  onChange={setBroadcastTargetValue}
                  placeholder={broadcastTarget === "specific_plan" ? "pro, enterprise..." : "1,2,3..."}
                />
              )}
              <div className="flex gap-2 justify-end pt-4">
                <Btn
                  variant="default"
                  onClick={() => setShowBroadcast(false)}
                  disabled={broadcasting}
                >
                  Annuler
                </Btn>
                <Btn
                  variant="primary"
                  onClick={sendBroadcast}
                  loading={broadcasting}
                  icon={Send}
                >
                  Envoyer
                </Btn>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <LoadingScreen />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Aucune notification"
          description="Aucune notification n'a été envoyée"
        />
      ) : isMobile ? (
        // Mobile cards
        <div className="space-y-3">
          {notifications.map((notif) => (
            <Card key={notif.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant={getTypeVariant(notif.type)}>
                      {notif.type.toUpperCase()}
                    </Badge>
                    <Badge variant="default">
                      {notif.target}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-text-primary text-sm line-clamp-2">{notif.message}</h3>
                </div>
              </div>
              <div className="flex items-center justify-between mb-3 text-xs text-text-muted">
                <span>{notif.user_count ? `${notif.user_count} utilisateurs` : "Tous les utilisateurs"}</span>
                <span>{formatDate(notif.sent_at)}</span>
              </div>
              <Btn
                variant="danger"
                onClick={() => setDeletingId(notif.id)}
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
                  Message
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Type
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Cible
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold text-text-muted uppercase">
                  Utilisateurs
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Date d'envoi
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((notif) => (
                <tr key={notif.id} className="border-b border-border-subtle hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-primary line-clamp-2">{notif.message}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={getTypeVariant(notif.type)}>
                      {notif.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="default">
                      {notif.target}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <p className="text-xs text-text-secondary">
                      {notif.user_count || "Tous"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-text-muted">{formatDate(notif.sent_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Btn
                      variant="danger"
                      onClick={() => setDeletingId(notif.id)}
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
        title="Supprimer la notification"
        message="Êtes-vous sûr de vouloir supprimer cette notification ? Cette action est irréversible."
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </PageWrapper>
  );
}
