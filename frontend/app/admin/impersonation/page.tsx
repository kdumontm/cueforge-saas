"use client";

import { useEffect, useState } from "react";
import { StopCircle, Play } from "lucide-react";
import { Card, PageWrapper, LoadingScreen, Btn, Input } from "../_components/shared";
import { adminApi } from "../_components/api";

interface ImpersonationLog {
  id: number;
  admin_id: string;
  user_id: string;
  reason: string;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
}

export default function AdminImpersonation() {
  const [logs, setLogs] = useState<ImpersonationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeSession, setActiveSession] = useState<ImpersonationLog | null>(null);

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    try {
      setLoading(true);
      setError(null);
      const data = await adminApi.getImpersonationLogs?.() ?? [];
      setLogs(data);

      // Check for active session
      const active = data.find((log: ImpersonationLog) => log.is_active);
      setActiveSession(active || null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStart() {
    if (!userId.trim()) {
      setError("L'ID utilisateur est requis");
      return;
    }

    if (!reason.trim()) {
      setError("La raison est requise");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await adminApi.startImpersonation?.(parseInt(userId, 10), reason);
      setUserId("");
      setReason("");
      loadLogs();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStop() {
    if (!activeSession) return;

    try {
      setSubmitting(true);
      setError(null);
      await adminApi.endImpersonation?.(activeSession.id);
      loadLogs();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <PageWrapper title="Emprunt d'identité utilisateur" subtitle="Démarrer/arrêter les sessions d'emprunt d'identité">
      {error && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 mb-6 text-red-400">
          {error}
        </div>
      )}

      {/* Active Session Alert */}
      {activeSession && (
        <Card className="p-4 mb-6 border-l-4 border-orange-500 bg-orange-500/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-semibold text-sm">Session active</p>
              <p className="text-xs text-gray-400 mt-1">
                Emprunter l'identité de l'utilisateur <span className="text-orange-400">{activeSession.user_id}</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Raison: {activeSession.reason}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Démarré: {new Date(activeSession.started_at).toLocaleString("fr-FR")}
              </p>
            </div>
            <Btn
              variant="danger"
              icon={StopCircle}
              onClick={handleStop}
              loading={submitting}
            >
              Arrêter
            </Btn>
          </div>
        </Card>
      )}

      {/* Start Session Form */}
      <Card className="p-6 mb-6">
        <h3 className="text-white font-semibold mb-4">Démarrer une session</h3>

        <div className="space-y-4">
          <Input
            label="ID utilisateur"
            value={userId}
            onChange={setUserId}
            placeholder="user_12345"
            hint="L'identifiant unique de l'utilisateur à emprunter"
          />

          <Input
            label="Raison"
            value={reason}
            onChange={setReason}
            placeholder="Support client - résoudre le problème X"
            multiline
            rows={3}
            hint="Expliquez pourquoi vous empruntez l'identité de cet utilisateur"
          />

          <Btn
            variant="primary"
            icon={Play}
            onClick={handleStart}
            loading={submitting}
            className="w-full"
            disabled={!userId.trim() || !reason.trim()}
          >
            Démarrer la session
          </Btn>
        </div>
      </Card>

      {/* Logs Table */}
      <Card className="p-6">
        <h3 className="text-white font-semibold mb-4">Historique des sessions</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-2 text-gray-400 font-semibold text-xs">Admin</th>
                <th className="text-left py-3 px-2 text-gray-400 font-semibold text-xs">Utilisateur</th>
                <th className="text-left py-3 px-2 text-gray-400 font-semibold text-xs">Raison</th>
                <th className="text-left py-3 px-2 text-gray-400 font-semibold text-xs">Début</th>
                <th className="text-left py-3 px-2 text-gray-400 font-semibold text-xs">Fin</th>
                <th className="text-center py-3 px-2 text-gray-400 font-semibold text-xs">Statut</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    Aucune session enregistrée
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-900 hover:bg-[#0a0a1a] transition">
                    <td className="py-3 px-2 text-gray-300 font-mono text-xs">
                      {log.admin_id}
                    </td>
                    <td className="py-3 px-2 text-gray-300 font-semibold text-xs">
                      {log.user_id}
                    </td>
                    <td className="py-3 px-2 text-gray-400 text-xs max-w-xs truncate">
                      {log.reason}
                    </td>
                    <td className="py-3 px-2 text-gray-500 text-xs">
                      {new Date(log.started_at).toLocaleString("fr-FR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="py-3 px-2 text-gray-500 text-xs">
                      {log.ended_at ? (
                        new Date(log.ended_at).toLocaleString("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-center">
                      {log.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                          Actif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-500/20 text-gray-400 text-[10px] font-semibold">
                          Terminé
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {logs.length > 0 && (
          <div className="text-center py-3 text-gray-500 text-xs">
            Total: {logs.length} session(s)
          </div>
        )}
      </Card>

      {/* Security Warning */}
      <Card className="p-4 mt-6 border-l-4 border-red-500 bg-red-500/5">
        <p className="text-red-400 text-xs font-semibold">⚠️ Avertissement de sécurité</p>
        <p className="text-gray-400 text-xs mt-2">
          L'emprunt d'identité est enregistré pour l'audit. Utilisez uniquement pour le support client légitime.
          Toutes les actions sont tracées.
        </p>
      </Card>
    </PageWrapper>
  );
}
