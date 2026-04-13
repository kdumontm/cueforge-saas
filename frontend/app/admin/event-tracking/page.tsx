"use client";

import { useEffect, useState } from "react";
import { DownloadCloud, Trash2, Plus } from "lucide-react";
import { Card, PageWrapper, LoadingScreen, Btn, Input, Modal } from "../_components/shared";
import { adminApi } from "../_components/api";

interface TrackedEvent {
  name: string;
  category: string;
  count: number;
  last_seen: string;
}

interface EventStats {
  total_events: number;
  unique_events: number;
  events_today: number;
  events_week: number;
}

interface EventDefinition {
  id: number;
  name: string;
  category: string;
  description: string;
  properties_schema: Record<string, any>;
  created_at: string;
}

export default function AdminEventTracking() {
  const [tab, setTab] = useState<"events" | "definitions">("events");
  const [events, setEvents] = useState<TrackedEvent[]>([]);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [definitions, setDefinitions] = useState<EventDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [skip, setSkip] = useState(0);
  const limit = 20;

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    description: "",
    properties_schema: "{}",
  });

  useEffect(() => {
    loadData();
  }, [tab, skip]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      if (tab === "events") {
        const [eventsRes, statsRes] = await Promise.all([
          adminApi.getTrackedEvents?.() ?? Promise.resolve([]),
          adminApi.getEventStats?.() ?? Promise.resolve(null),
        ]);
        setEvents(eventsRes);
        setStats(statsRes);
      } else {
        const defsRes = await adminApi.getEventDefinitions?.() ?? [];
        setDefinitions(defsRes);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateDefinition() {
    if (!formData.name.trim() || !formData.category.trim()) {
      setError("Le nom et la catégorie sont requis");
      return;
    }

    try {
      const schema = JSON.parse(formData.properties_schema);
      await adminApi.createEventDefinition?.({
        name: formData.name,
        category: formData.category,
        description: formData.description,
        properties_schema: schema,
      });
      setShowModal(false);
      setFormData({
        name: "",
        category: "",
        description: "",
        properties_schema: "{}",
      });
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDeleteDefinition(id: number) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette définition ?")) return;
    try {
      await adminApi.deleteEventDefinition?.(id);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleExport() {
    try {
      await adminApi.exportEvents?.();
      // In real implementation, this would trigger a download
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <PageWrapper title="Suivi des événements" subtitle="Gérer les événements et leurs définitions">
      {error && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 mb-6 text-red-400">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-800">
        <button
          onClick={() => setTab("events")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
            tab === "events"
              ? "border-purple-600 text-white"
              : "border-transparent text-gray-400 hover:text-gray-300"
          }`}
        >
          Événements
        </button>
        <button
          onClick={() => setTab("definitions")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
            tab === "definitions"
              ? "border-purple-600 text-white"
              : "border-transparent text-gray-400 hover:text-gray-300"
          }`}
        >
          Définitions
        </button>
      </div>

      {/* Events Tab */}
      {tab === "events" && (
        <>
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card className="p-4">
                <p className="text-xs text-gray-400 mb-1">Total d'événements</p>
                <p className="text-2xl font-bold text-white">{stats.total_events}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-gray-400 mb-1">Événements uniques</p>
                <p className="text-2xl font-bold text-white">{stats.unique_events}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-gray-400 mb-1">Aujourd'hui</p>
                <p className="text-2xl font-bold text-white">{stats.events_today}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-gray-400 mb-1">Cette semaine</p>
                <p className="text-2xl font-bold text-white">{stats.events_week}</p>
              </Card>
            </div>
          )}

          <div className="flex gap-3 mb-6">
            <Btn variant="default" icon={DownloadCloud} onClick={handleExport}>
              Exporter
            </Btn>
          </div>

          <Card className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-3 px-2 text-gray-400 font-semibold text-xs">Événement</th>
                    <th className="text-left py-3 px-2 text-gray-400 font-semibold text-xs">Catégorie</th>
                    <th className="text-right py-3 px-2 text-gray-400 font-semibold text-xs">Nombre</th>
                    <th className="text-left py-3 px-2 text-gray-400 font-semibold text-xs">Dernièrement vu</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-gray-400">
                        Aucun événement
                      </td>
                    </tr>
                  ) : (
                    events.slice(skip, skip + limit).map((event, idx) => (
                      <tr key={idx} className="border-b border-gray-900 hover:bg-[#0a0a1a] transition">
                        <td className="py-3 px-2 text-gray-300 font-semibold">{event.name}</td>
                        <td className="py-3 px-2 text-gray-400 text-xs">
                          <span className="bg-purple-600/20 text-purple-400 px-2 py-1 rounded">
                            {event.category}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-gray-300 text-right font-mono">{event.count}</td>
                        <td className="py-3 px-2 text-gray-500 text-xs">
                          {new Date(event.last_seen).toLocaleString("fr-FR")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {events.length > limit && (
              <div className="flex justify-between items-center mt-4 text-xs text-gray-400">
                <span>
                  Affichage {skip + 1}-{Math.min(skip + limit, events.length)} sur {events.length}
                </span>
                <div className="flex gap-2">
                  <Btn
                    variant="ghost"
                    small
                    onClick={() => setSkip(Math.max(0, skip - limit))}
                    disabled={skip === 0}
                  >
                    Précédent
                  </Btn>
                  <Btn
                    variant="ghost"
                    small
                    onClick={() => setSkip(skip + limit)}
                    disabled={skip + limit >= events.length}
                  >
                    Suivant
                  </Btn>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Definitions Tab */}
      {tab === "definitions" && (
        <>
          <div className="flex gap-3 mb-6">
            <Btn variant="primary" icon={Plus} onClick={() => setShowModal(true)}>
              Créer une définition
            </Btn>
          </div>

          <div className="grid gap-4">
            {definitions.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                Aucune définition créée
              </div>
            ) : (
              definitions.map((def) => (
                <Card key={def.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-white font-semibold text-sm">{def.name}</h4>
                      <div className="flex gap-2 mt-2">
                        <span className="bg-purple-600/20 text-purple-400 text-[10px] px-2 py-1 rounded">
                          {def.category}
                        </span>
                      </div>
                      {def.description && (
                        <p className="text-gray-400 text-xs mt-2">{def.description}</p>
                      )}
                      <div className="text-xs text-gray-500 mt-2">
                        {new Date(def.created_at).toLocaleDateString("fr-FR")}
                      </div>
                    </div>
                    <Btn
                      variant="danger"
                      small
                      icon={Trash2}
                      onClick={() => handleDeleteDefinition(def.id)}
                      title="Supprimer"
                    />
                  </div>
                </Card>
              ))
            )}
          </div>
        </>
      )}

      {/* Create Definition Modal */}
      {showModal && (
        <Modal title="Créer une définition d'événement" onClose={() => setShowModal(false)}>
          <Input
            label="Nom"
            value={formData.name}
            onChange={(v) => setFormData({ ...formData, name: v })}
            placeholder="user_signup"
          />

          <Input
            label="Catégorie"
            value={formData.category}
            onChange={(v) => setFormData({ ...formData, category: v })}
            placeholder="user"
          />

          <Input
            label="Description"
            value={formData.description}
            onChange={(v) => setFormData({ ...formData, description: v })}
            placeholder="Décrivez cet événement"
            multiline
          />

          <Input
            label="Schéma des propriétés (JSON)"
            value={formData.properties_schema}
            onChange={(v) => setFormData({ ...formData, properties_schema: v })}
            multiline
            rows={4}
            placeholder='{"email": "string", "plan": "string"}'
            hint="Format: objet JSON décrivant les propriétés"
          />

          <div className="flex gap-3 mt-6">
            <Btn variant="primary" onClick={handleCreateDefinition} className="flex-1">
              Créer
            </Btn>
            <Btn variant="default" onClick={() => setShowModal(false)} className="flex-1">
              Annuler
            </Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
