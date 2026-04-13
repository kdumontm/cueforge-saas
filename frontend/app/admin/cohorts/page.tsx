"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { Card, PageWrapper, LoadingScreen, Btn, Input, Select, Modal } from "../_components/shared";
import { adminApi } from "../_components/api";

interface Cohort {
  id: number;
  name: string;
  metric: string;
  period: "daily" | "weekly" | "monthly";
  group_by: string;
  created_at: string;
}

interface CohortResult {
  cohort: string;
  week_0: number;
  week_1: number;
  week_2: number;
  week_3: number;
  week_4: number;
  retention: number;
}

interface CohortPreset {
  id: number;
  name: string;
  metric: string;
  period: string;
  group_by: string;
}

export default function AdminCohorts() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedCohort, setSelectedCohort] = useState<Cohort | null>(null);
  const [results, setResults] = useState<CohortResult[] | null>(null);
  const [presets, setPresets] = useState<CohortPreset[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    metric: "active_users",
    period: "weekly" as const,
    group_by: "signup_date",
  });

  useEffect(() => {
    loadCohorts();
    loadPresets();
  }, []);

  async function loadCohorts() {
    try {
      setLoading(true);
      setError(null);
      const data = await adminApi.getCohorts?.() ?? [];
      setCohorts(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadPresets() {
    try {
      const data = await adminApi.getCohortPresets?.() ?? [];
      setPresets(data);
    } catch (err: any) {
      console.error("Failed to load presets:", err);
    }
  }

  async function handleCreate() {
    if (!formData.name.trim()) {
      setError("Le nom est requis");
      return;
    }

    try {
      await adminApi.createCohort?.(formData);
      setShowModal(false);
      setFormData({
        name: "",
        metric: "active_users",
        period: "weekly",
        group_by: "signup_date",
      });
      loadCohorts();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette cohorte ?")) return;
    try {
      await adminApi.deleteCohort?.(id);
      loadCohorts();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleViewResults(cohort: Cohort) {
    try {
      const data = await adminApi.getCohortResults?.(cohort.id) ?? [];
      setResults(data);
      setSelectedCohort(cohort);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function applyPreset(preset: CohortPreset) {
    setFormData({
      name: preset.name,
      metric: preset.metric,
      period: (preset.period as "daily" | "weekly" | "monthly"),
      group_by: preset.group_by,
    });
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <PageWrapper title="Analyse des cohortes" subtitle="Analyser la rétention par groupes d'utilisateurs">
      {error && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 mb-6 text-red-400">
          {error}
        </div>
      )}

      <div className="flex gap-3 mb-6">
        <Btn variant="primary" icon={Plus} onClick={() => setShowModal(true)}>
          Créer une cohorte
        </Btn>
      </div>

      {/* Results Grid */}
      {selectedCohort && results && (
        <Card className="p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-semibold">{selectedCohort.name}</h3>
            <Btn variant="ghost" small onClick={() => setSelectedCohort(null)}>
              Fermer
            </Btn>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-3 px-2 text-gray-400 font-semibold text-xs">Cohorte</th>
                  <th className="text-center py-3 px-2 text-gray-400 font-semibold text-xs">S0</th>
                  <th className="text-center py-3 px-2 text-gray-400 font-semibold text-xs">S1</th>
                  <th className="text-center py-3 px-2 text-gray-400 font-semibold text-xs">S2</th>
                  <th className="text-center py-3 px-2 text-gray-400 font-semibold text-xs">S3</th>
                  <th className="text-center py-3 px-2 text-gray-400 font-semibold text-xs">S4</th>
                  <th className="text-center py-3 px-2 text-gray-400 font-semibold text-xs">Rétention</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, idx) => (
                  <tr key={idx} className="border-b border-gray-900 hover:bg-[#0a0a1a] transition">
                    <td className="py-3 px-2 text-gray-300 text-xs">{result.cohort}</td>
                    <td className="py-3 px-2 text-center text-gray-300 text-xs">{result.week_0}</td>
                    <td className="py-3 px-2 text-center text-gray-300 text-xs">{result.week_1}</td>
                    <td className="py-3 px-2 text-center text-gray-300 text-xs">{result.week_2}</td>
                    <td className="py-3 px-2 text-center text-gray-300 text-xs">{result.week_3}</td>
                    <td className="py-3 px-2 text-center text-gray-300 text-xs">{result.week_4}</td>
                    <td className="py-3 px-2 text-center text-gray-300 text-xs font-semibold">
                      {result.retention.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Cohorts List */}
      <div className="grid gap-4">
        {cohorts.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            Aucune cohorte créée
          </div>
        ) : (
          cohorts.map((cohort) => (
            <Card key={cohort.id} className="p-4 hover:bg-[#0a0a1a] transition">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="text-white font-semibold text-sm">{cohort.name}</h4>
                  <div className="text-xs text-gray-400 mt-1">
                    Métrique: {cohort.metric} • Période: {cohort.period} • Groupé par: {cohort.group_by}
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    {new Date(cohort.created_at).toLocaleDateString("fr-FR")}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Btn
                    variant="default"
                    small
                    onClick={() => handleViewResults(cohort)}
                  >
                    Résultats
                  </Btn>
                  <Btn
                    variant="danger"
                    small
                    icon={Trash2}
                    onClick={() => handleDelete(cohort.id)}
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
        <Modal title="Créer une cohorte" onClose={() => setShowModal(false)}>
          <Input
            label="Nom"
            value={formData.name}
            onChange={(v) => setFormData({ ...formData, name: v })}
            placeholder="Ma cohorte"
          />

          <Select
            label="Métrique"
            value={formData.metric}
            onChange={(v) => setFormData({ ...formData, metric: v })}
            options={[
              { value: "active_users", label: "Utilisateurs actifs" },
              { value: "revenue", label: "Revenu" },
              { value: "engagement", label: "Engagement" },
            ]}
          />

          <Select
            label="Période"
            value={formData.period}
            onChange={(v) => setFormData({ ...formData, period: v as any })}
            options={[
              { value: "daily", label: "Quotidien" },
              { value: "weekly", label: "Hebdomadaire" },
              { value: "monthly", label: "Mensuel" },
            ]}
          />

          <Select
            label="Grouper par"
            value={formData.group_by}
            onChange={(v) => setFormData({ ...formData, group_by: v })}
            options={[
              { value: "signup_date", label: "Date d'inscription" },
              { value: "plan", label: "Plan" },
              { value: "source", label: "Source" },
            ]}
          />

          {presets.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-xs text-gray-400 mb-2 font-semibold">Présets rapides:</p>
              <div className="flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <Btn
                    key={preset.id}
                    variant="ghost"
                    small
                    onClick={() => applyPreset(preset)}
                  >
                    {preset.name}
                  </Btn>
                ))}
              </div>
            </div>
          )}

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
