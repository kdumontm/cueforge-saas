"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Send, RotateCcw, ChevronDown, ChevronUp, X, Copy, Check,
} from "lucide-react";
import {
  Input, Select, Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, useToast,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface WebhookEndpoint {
  id: number;
  url: string;
  event_types: string[];
  is_active: boolean;
}

interface WebhookEvent {
  id: string;
  name: string;
  description: string;
}

interface WebhookLog {
  id: number;
  endpoint_id: number;
  endpoint_url: string;
  event_type: string;
  status_code: number;
  status: "success" | "failed" | "pending";
  sent_at: string;
  request_size: number;
  response_time_ms: number;
}

interface WebhookLogDetail {
  id: number;
  endpoint_url: string;
  event_type: string;
  request_body: string;
  response_body: string;
  response_code: number;
  headers: Record<string, string>;
  created_at: string;
}

export default function WebhookTestingPage() {
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<"test" | "logs">("test");
  const [loading, setLoading] = useState(true);

  // Data
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [logs, setLogs] = useState<WebhookLog[]>([]);

  // Form
  const [selectedEndpoint, setSelectedEndpoint] = useState<number | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const [testLoading, setTestLoading] = useState(false);

  // Logs
  const [logsLoading, setLogsLoading] = useState(false);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const [logDetail, setLogDetail] = useState<WebhookLogDetail | null>(null);
  const [logDetailLoading, setLogDetailLoading] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [endpointsRes, eventsRes] = await Promise.all([
          adminApi.getWebhookEndpoints(),
          adminApi.getWebhookEvents(),
        ]);
        setEndpoints(endpointsRes.endpoints || []);
        setEvents(eventsRes.events || []);
      } catch (err: any) {
        toast(`Erreur: ${err.message}`, "error");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [toast]);

  // Load logs
  const loadLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const data = await adminApi.getWebhookLogs({ skip: 0, limit: 50 });
      setLogs(data.logs || []);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLogsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (activeView === "logs") {
      loadLogs();
    }
  }, [activeView, loadLogs]);

  // Handle test webhook
  const handleTestWebhook = async () => {
    if (!selectedEndpoint || !selectedEvent) {
      toast("Veuillez sélectionner un endpoint et un événement", "error");
      return;
    }
    try {
      setTestLoading(true);
      await adminApi.testWebhook({
        endpoint_id: selectedEndpoint,
        event_type: selectedEvent,
      });
      toast("Test envoyé avec succès", "success");
      // Reload logs
      loadLogs();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setTestLoading(false);
    }
  };

  // Load log detail
  const handleExpandLog = async (logId: number) => {
    if (expandedLog === logId) {
      setExpandedLog(null);
      setLogDetail(null);
      return;
    }
    try {
      setLogDetailLoading(true);
      const data = await adminApi.getWebhookLogDetail(logId);
      setLogDetail(data);
      setExpandedLog(logId);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLogDetailLoading(false);
    }
  };

  // Handle replay
  const handleReplay = async (logId: number) => {
    try {
      await adminApi.replayWebhook(logId);
      toast("Rejeu lancé", "success");
      loadLogs();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  // Copy to clipboard
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <PageWrapper>
      <SectionHeader
        title="Tests de webhooks"
        desc="Testez vos endpoints webhook"
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-700">
        {["test", "logs"].map((view) => (
          <button
            key={view}
            onClick={() => setActiveView(view as any)}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeView === view
                ? "text-purple-400 border-b-2 border-purple-600"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            {view === "test" && "Tester"}
            {view === "logs" && "Historique"}
          </button>
        ))}
      </div>

      {/* Test View */}
      {activeView === "test" && (
        <Card>
          <div className="p-6">
            <h3 className="text-white font-semibold mb-4">Envoyer un test</h3>
            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-gray-400 text-sm font-medium mb-2">
                  Endpoint
                </label>
                <Select
                  value={selectedEndpoint || ""}
                  onChange={(e) => setSelectedEndpoint(parseInt(e.target.value) || null)}
                >
                  <option value="">Sélectionner un endpoint...</option>
                  {endpoints.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.url}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-gray-400 text-sm font-medium mb-2">
                  Type d'événement
                </label>
                <Select
                  value={selectedEvent}
                  onChange={(e) => setSelectedEvent(e.target.value)}
                >
                  <option value="">Sélectionner un événement...</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </Select>
              </div>

              <Btn
                variant="primary"
                onClick={handleTestWebhook}
                disabled={testLoading || !selectedEndpoint || !selectedEvent}
                className="w-full"
              >
                <Send className="w-4 h-4" /> Envoyer le test
              </Btn>
            </div>
          </div>
        </Card>
      )}

      {/* Logs View */}
      {activeView === "logs" && (
        <Card>
          <div className="p-6">
            <h3 className="text-white font-semibold mb-4">Historique des envois</h3>
            {logsLoading ? (
              <div className="text-gray-400 text-center py-4">Chargement...</div>
            ) : logs.length === 0 ? (
              <EmptyState title="Aucun historique" desc="Aucun test n'a été envoyé" />
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id}>
                    <button
                      onClick={() => handleExpandLog(log.id)}
                      className="w-full flex items-center justify-between bg-[#0a0a1a] p-4 rounded border border-gray-700 hover:border-gray-600 transition-colors"
                    >
                      <div className="text-left flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-white font-medium">
                            {log.endpoint_url}
                          </p>
                          <Badge
                            variant={
                              log.status === "success"
                                ? "success"
                                : log.status === "failed"
                                  ? "error"
                                  : "warning"
                            }
                          >
                            {log.status_code}
                          </Badge>
                        </div>
                        <p className="text-gray-400 text-sm mt-1">
                          {log.event_type} • {log.response_time_ms}ms
                        </p>
                        <p className="text-gray-500 text-xs">
                          {new Date(log.sent_at).toLocaleString("fr-FR")}
                        </p>
                      </div>
                      {expandedLog === log.id ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </button>

                    {expandedLog === log.id && (
                      <div className="bg-[#0a0a1a] p-4 border border-gray-700 border-t-0 rounded-b space-y-4">
                        {logDetailLoading ? (
                          <p className="text-gray-400 text-sm">Chargement...</p>
                        ) : logDetail ? (
                          <>
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-gray-400 text-sm font-medium">
                                  Request
                                </p>
                                <button
                                  onClick={() =>
                                    handleCopy(
                                      logDetail.request_body,
                                      "request"
                                    )
                                  }
                                  className="text-gray-400 hover:text-white text-xs"
                                >
                                  {copiedText === "request" ? (
                                    <Check className="w-4 h-4" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                              <pre className="bg-black/40 p-2 rounded text-gray-300 text-xs overflow-x-auto">
                                {logDetail.request_body}
                              </pre>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-gray-400 text-sm font-medium">
                                  Response
                                </p>
                                <button
                                  onClick={() =>
                                    handleCopy(
                                      logDetail.response_body,
                                      "response"
                                    )
                                  }
                                  className="text-gray-400 hover:text-white text-xs"
                                >
                                  {copiedText === "response" ? (
                                    <Check className="w-4 h-4" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                              <pre className="bg-black/40 p-2 rounded text-gray-300 text-xs overflow-x-auto">
                                {logDetail.response_body}
                              </pre>
                            </div>

                            <Btn
                              variant="primary"
                              onClick={() => handleReplay(log.id)}
                              className="w-full"
                            >
                              <RotateCcw className="w-4 h-4" /> Rejouer
                            </Btn>
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}
    </PageWrapper>
  );
}
