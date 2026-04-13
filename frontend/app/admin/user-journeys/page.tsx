"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { Card, PageWrapper, LoadingScreen, Btn, Input, Modal } from "../_components/shared";
import { adminApi } from "../_components/api";

interface Journey {
  id: number;
  name: string;
  trigger_event: string;
  steps: string[];
  conditions: Record<string, any>;
  created_at: string;
}

interface JourneyStats {
  total_users: number;
  completion_rate: number;
  avg_time_minutes: number;
  active_users: number;
}

interface JourneyUser {
  step: string;
  count: number;
  percent: number;
  dropoff: number;
}

export default function AdminUserJourneys() {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedJourney, setSelectedJourney] = useState<Journey | null>(null);
  const [journeyStats, setJourneyStats] = useState<JourneyStats | null>(null);
  const [journeyUsers, setJourneyUsers] = useState<JourneyUser[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    trigger_event: "",
    steps: "[]",
    conditions: "{}",
  });

  useEffect(() => {
    loadJourneys();
  }, []);

  async function loadJourneys() {
    try {
      setLoading(true);
      setError(null);
      const data = await adminApi.getJourneys?.() ?? [];
      setJourneys(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!formData.name.trim() || !formData.trigger_event.trim()) {
      setError("Le nom et l'événement déclencheur sont requis");
      return;
    }

    try {
      const steps = JSON.parse(formData.steps);
      const conditions = JSON.parse(formData.conditions);
      await adminApi.createJourney?.({
        name: formData.name,
        trigger_event: formData.trigger_event,
        steps,
        conditions,
      });
      setShowModal(false);
      setFormData({
        name: "",
        trigger_event: "",
        steps: "[]",
        conditions: "{}",
      });
      loadJourneys();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce parcours ?")) return;
    try {
      await adminApi.deleteJourney?.(id);
      loadJourneys();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleViewStats(journey: Journey) {
    try {
      const [stats, users] = await Promise.all([
        adminApi.getJourneyStats?.(journey.id) ?? Promise.resolve(null),
        adminApi.getJourneyUsers?.(journey.id) ?? Promise.resolve([]),
      ]);
      setSelectedJourney(journey);
      setJourneyStats(stats);
      setJourneyUsers(users);
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <PageWrapper title="Parcours utilisateurs" subtitle="Créer et analyser les parcours client">
      {error && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 mb-6 text-red-400">
          {error}
        </div>
      )}

      <div className="flex gap-3 mb-6">
        <Btn variant="primary" icon={Plus} onClick={() => setShowModal(true)}>
          Créer un parcours
        </Btn>
      </div>

      {/* Stats View */}
      {selectedJourney && journeyStats && (
        <Card className="p-6 mb-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-white font-semibold text-lg">{selectedJourney.name}</h3>
            <Btn variant="ghost" small onClick={() => setSelectedJourney(null)}>
              Fermer
            </Btn>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#0a0a1a] rounded-lg p-4 border border-gray-800">
              <p className="text-xs text-gray-400 mb-1">Utilisateurs totaux</p>
              <p className="text-2xl font-bold text-white">{journeyStats.total_users}</p>
            </div>
            <div className="bg-[#0a0a1a] rounded-lg p-4 border border-gray-800">
              <p className="text-xs text-gray-400 mb-1">Taux de complétion</p>
              <p className="text-2xl font-bold text-white">{journeyStats.completion_rate.toFixed(1)}%</p>
            </div>
            <div className="bg-[#0a0a1a] rounded-lg p-4 border border-gray-800">
              <p className="text-xs text-gray-400 mb-1">Temps moyen</p>
              <p className="text-2xl font-bold text-white">{journeyStats.avg_time_minutes} min</p>
            </div>
            <div className="bg-[#0a0a1a] rounded-lg p-4 border border-gray-800">
              <p className="text-xs text-gray-400 mb-1">Actifs maintenant</p>
              <p className="text-2xl font-bold text-white">{journeyStats.active_users}</p>
            </div>
          </div>

          {/* Users per step */}
          <div className="space-y-4">
            <h4 className="text-white font-semibold text-sm">Utilisateurs par étape</h4>
            {journeyUsers.map((user, idx) => (
              <div key={idx}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-300">{user.step}</span>
                  <div className="flex gap-4 text-xs">
                    <span className="text-gray-400">{user.count} utilisateurs</span>
                    <span className="text-gray-500">Abandon: {user.dropoff.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="w-full bg-[#0a0a1a] rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-purple-600 to-purple-400 h-full transition-all"
                    style={{ width: `${user.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Journeys List */}
      <div className="grid gap-4">
        {journeys.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            Aucun parcours créé
          </div>
        ) : (
          journeys.map((journey) => (
            <Card key={journey.id} className="p-4 hover:bg-[#0a0a1a] transition">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="text-white font-semibold text-sm">{journey.name}</h4>
                  <div className="text-xs text-gray-400 mt-1">
                    Déclenché par: <span className="text-purple-400">{journey.trigger_event}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    {journey.steps.length} étapes • {new Date(journey.created_at).toLocaleDateString("fr-FR")}
                  </div>
                  <div className="flex gap-1 mt-3 flex-wrap">
                    {journey.steps.map((step, idx) => (
                      <span key={idx} className="bg-purple-600/20 text-purple-400 text-[10px] px-2 py-1 rounded">
                        {step}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Btn
                    variant="default"
                    small
                    onClick={() => handleViewStats(journey)}
                  >
                    Statistiques
                  </Btn>
                  <Btn
                    variant="danger"
                    small
                    icon={Trash2}
                    onClick={() => handleDelete(journey.id)}
                    title="Supprimer"
                  />
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <Modal title="Créer un parcours" onClose={() => setShowModal(false)}>
          <Input
            label="Nom"
            value={formData.name}
            onChange={(v) => setFormData({ ...formData, name: v })}
            placeholder="Onboarding pro"
          />

          <Input
            label="Événement déclencheur"
            value={formData.trigger_event}
            onChange={(v) => setFormData({ ...formData, trigger_event: v })}
            placeholder="user_signup"
          />

          <Input
            label="Étapes (JSON)"
            value={formData.steps}
            onChange={(v) => setFormData({ ...formData, steps: v })}
            multiline
            rows={4}
            placeholder='["email_confirm", "profile_setup", "payment"]'
            hint="Format: tableau JSON d'étapes"
          />

          <Input
            label="Conditions (JSON)"
            value={formData.conditions}
            onChange={(v) => setFormData({ ...formData, conditions: v })}
            multiline
            rows={3}
            placeholder='{"plan": "pro", "country": "FR"}'
            hint="Format: objet JSON de conditions"
          />

          <div className="flex gap-3 mt-6">
            <Btn variant="primary" onClick={handleCreate} className="flex-1">
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
