"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Input,
  Select,
  Btn,
  Card,
  Badge,
  Toggle,
  PageWrapper,
  SectionHeader,
  LoadingScreen,
  EmptyState,
  ConfirmModal,
  useToast,
} from "../_components/shared";
import { adminApi } from "../_components/api";
import { Plus, Trash2, Package, ToggleLeft, ToggleRight, Eye, EyeOff, Lock } from "lucide-react";

interface Feature {
  id: number;
  plan_name: string;
  feature_name: string;
  label: string;
  is_enabled: boolean;
  display_mode: 'hidden' | 'locked';
}

const PLANS = [
  { id: "free", name: "Free", color: "emerald" },
  { id: "pro", name: "Pro", color: "purple" },
  { id: "unlimited", name: "Unlimited", color: "pink" },
];

export default function FeaturesPage() {
  const { toast } = useToast();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [busyPlans, setBusyPlans] = useState<Set<string>>(new Set());

  // Form state for adding new feature
  const [newPlan, setNewPlan] = useState("free");
  const [newFeatureName, setNewFeatureName] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newEnabled, setNewEnabled] = useState(true);
  const [newDisplayMode, setNewDisplayMode] = useState<'hidden' | 'locked'>('locked');

  // Load features
  const loadFeatures = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminApi.listFeatures();
      setFeatures(Array.isArray(data) ? data : (data as any).items || []);
    } catch (err: any) {
      toast(err.message || "Erreur lors du chargement des fonctionnalités", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadFeatures();
  }, [loadFeatures]);

  // Group features by plan
  function groupByPlan() {
    const grouped: Record<string, Feature[]> = {
      free: [],
      pro: [],
      unlimited: [],
    };
    features.forEach((f) => {
      if (grouped[f.plan_name]) {
        grouped[f.plan_name].push(f);
      }
    });
    return grouped;
  }

  // Toggle optimiste — mise à jour locale immédiate, pas de rechargement
  async function toggleFeature(feature: Feature) {
    const newVal = !feature.is_enabled;
    // Update local state immediately
    setFeatures((prev) =>
      prev.map((f) => (f.id === feature.id ? { ...f, is_enabled: newVal } : f))
    );
    setBusyIds((prev) => new Set([...prev, feature.id]));

    try {
      await adminApi.updateFeature(feature.id, { is_enabled: newVal });
      toast(
        `${feature.label || feature.feature_name} ${newVal ? "activée" : "désactivée"}`,
        "success"
      );
    } catch (err: any) {
      // Rollback on error
      setFeatures((prev) =>
        prev.map((f) =>
          f.id === feature.id ? { ...f, is_enabled: feature.is_enabled } : f
        )
      );
      toast(err.message || "Erreur lors de la mise à jour", "error");
    } finally {
      setBusyIds((prev) => {
        const s = new Set(prev);
        s.delete(feature.id);
        return s;
      });
    }
  }

  // Bulk toggle — active/désactive toutes les features d'un plan
  async function bulkToggle(planName: string, enable: boolean) {
    const planFeatures = features.filter((f) => f.plan_name === planName);
    const snapshot = planFeatures.map((f) => ({ id: f.id, is_enabled: f.is_enabled }));

    setFeatures((prev) =>
      prev.map((f) => (f.plan_name === planName ? { ...f, is_enabled: enable } : f))
    );
    setBusyPlans((prev) => new Set([...prev, planName]));

    try {
      await adminApi.bulkToggleFeatures(planName, enable);
      toast(
        `Toutes les features ${planName} ${enable ? "activées" : "désactivées"}`,
        "success"
      );
    } catch (err: any) {
      setFeatures((prev) => {
        const oldMap = new Map(snapshot.map((s) => [s.id, s.is_enabled]));
        return prev.map((f) =>
          f.plan_name === planName && oldMap.has(f.id)
            ? { ...f, is_enabled: oldMap.get(f.id)! }
            : f
        );
      });
      toast(err.message || "Erreur lors de la mise à jour en masse", "error");
    } finally {
      setBusyPlans((prev) => {
        const s = new Set(prev);
        s.delete(planName);
        return s;
      });
    }
  }

  // Bulk display mode — tout masquer ou tout griser d'un plan
  async function bulkDisplayMode(planName: string, mode: 'hidden' | 'locked') {
    const planFeatures = features.filter((f) => f.plan_name === planName);
    const snapshot = planFeatures.map((f) => ({ id: f.id, display_mode: f.display_mode }));

    setFeatures((prev) =>
      prev.map((f) => (f.plan_name === planName ? { ...f, display_mode: mode } : f))
    );
    setBusyPlans((prev) => new Set([...prev, planName]));

    try {
      await adminApi.bulkSetDisplayMode(planName, mode);
      toast(
        mode === 'hidden' ? 'Tout masqué (disparaît)' : 'Tout grisé (verrouillé)',
        "success"
      );
    } catch (err: any) {
      setFeatures((prev) => {
        const oldMap = new Map(snapshot.map((s) => [s.id, s.display_mode]));
        return prev.map((f) =>
          f.plan_name === planName && oldMap.has(f.id)
            ? { ...f, display_mode: (oldMap.get(f.id) as 'hidden' | 'locked') }
            : f
        );
      });
      toast(err.message || "Erreur", "error");
    } finally {
      setBusyPlans((prev) => {
        const s = new Set(prev);
        s.delete(planName);
        return s;
      });
    }
  }

  // Toggle display mode (hidden ↔ locked) — optimistic
  async function toggleDisplayMode(feature: Feature) {
    const newMode = feature.display_mode === 'hidden' ? 'locked' : 'hidden';
    setFeatures((prev) =>
      prev.map((f) => (f.id === feature.id ? { ...f, display_mode: newMode } : f))
    );
    try {
      await adminApi.updateFeature(feature.id, { display_mode: newMode });
      toast(
        `Mode: ${newMode === 'hidden' ? 'Masqué (disparaît)' : 'Verrouillé (grisé)'}`,
        "success"
      );
    } catch (err: any) {
      setFeatures((prev) =>
        prev.map((f) => (f.id === feature.id ? { ...f, display_mode: feature.display_mode } : f))
      );
      toast(err.message || "Erreur", "error");
    }
  }

  // Add new feature
  async function addFeature() {
    if (!newFeatureName.trim()) {
      toast("Entrez le nom de la fonctionnalité", "error");
      return;
    }
    if (!newLabel.trim()) {
      toast("Entrez le libellé", "error");
      return;
    }

    try {
      await adminApi.createFeature({
        plan_name: newPlan,
        feature_name: newFeatureName,
        label: newLabel,
        is_enabled: newEnabled,
        display_mode: newDisplayMode,
      });
      toast("Fonctionnalité ajoutée avec succès", "success");
      setShowAddModal(false);
      resetForm();
      await loadFeatures();
    } catch (err: any) {
      toast(err.message || "Erreur lors de l'ajout", "error");
    }
  }

  // Delete feature (optimistic)
  async function deleteFeature() {
    if (!selectedFeature) return;
    const toDelete = selectedFeature;
    // Optimistic remove
    setFeatures((prev) => prev.filter((f) => f.id !== toDelete.id));
    setShowDeleteConfirm(false);
    setSelectedFeature(null);

    try {
      await adminApi.deleteFeature(toDelete.id);
      toast("Fonctionnalité supprimée avec succès", "success");
    } catch (err: any) {
      // Rollback
      setFeatures((prev) => [...prev, toDelete]);
      toast(err.message || "Erreur lors de la suppression", "error");
    }
  }

  function resetForm() {
    setNewPlan("free");
    setNewFeatureName("");
    setNewLabel("");
    setNewEnabled(true);
    setNewDisplayMode('locked');
  }

  function openDeleteConfirm(feature: Feature) {
    setSelectedFeature(feature);
    setShowDeleteConfirm(true);
  }

  const grouped = groupByPlan();

  return (
    <PageWrapper>
      <SectionHeader
        title="Gestion des fonctionnalités"
        description="Gérez les fonctionnalités disponibles par plan"
        actions={
          <Btn
            variant="primary"
            icon={Plus}
            onClick={() => setShowAddModal(true)}
            small
          >
            Ajouter une fonctionnalité
          </Btn>
        }
      />

      {loading ? (
        <LoadingScreen />
      ) : features.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Aucune fonctionnalité"
          description="Aucune fonctionnalité définie. Commencez par en ajouter une."
          action={
            <Btn
              variant="primary"
              icon={Plus}
              onClick={() => setShowAddModal(true)}
              small
            >
              Ajouter une fonctionnalité
            </Btn>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const planFeatures = grouped[plan.id] || [];
            const allEnabled = planFeatures.length > 0 && planFeatures.every((f) => f.is_enabled);
            const allDisabled = planFeatures.length > 0 && planFeatures.every((f) => !f.is_enabled);
            const isBusyPlan = busyPlans.has(plan.id);
            const badgeVariant = plan.color as "default" | "success" | "warning" | "error" | "info" | "purple" | "pink";

            return (
              <Card key={plan.id} className="p-6">
                {/* Plan Header */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-border-subtle">
                  <h3 className="text-lg font-bold text-text-primary">
                    {plan.name}
                  </h3>
                  <Badge variant={badgeVariant}>
                    {planFeatures.length}
                  </Badge>
                </div>

                {/* Bulk Toggle Buttons */}
                {planFeatures.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <div className="flex gap-2">
                      <Btn
                        small
                        variant={allEnabled ? "danger" : "default"}
                        icon={ToggleLeft}
                        loading={isBusyPlan}
                        disabled={allDisabled || isBusyPlan}
                        onClick={() => bulkToggle(plan.id, false)}
                      >
                        Tout désactiver
                      </Btn>
                      <Btn
                        small
                        variant={allDisabled ? "success" : "default"}
                        icon={ToggleRight}
                        loading={isBusyPlan}
                        disabled={allEnabled || isBusyPlan}
                        onClick={() => bulkToggle(plan.id, true)}
                      >
                        Tout activer
                      </Btn>
                    </div>
                    <div className="flex gap-2">
                      <Btn
                        small
                        variant="warning"
                        icon={EyeOff}
                        loading={isBusyPlan}
                        disabled={isBusyPlan}
                        onClick={() => bulkDisplayMode(plan.id, 'hidden')}
                      >
                        Tout masquer
                      </Btn>
                      <Btn
                        small
                        variant="default"
                        icon={Lock}
                        loading={isBusyPlan}
                        disabled={isBusyPlan}
                        onClick={() => bulkDisplayMode(plan.id, 'locked')}
                      >
                        Tout griser
                      </Btn>
                    </div>
                  </div>
                )}

                {/* Features List */}
                {planFeatures.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-8">
                    Aucune fonctionnalité pour ce plan
                  </p>
                ) : (
                  <div className="space-y-3">
                    {planFeatures.map((feature) => {
                      const isBusy = busyIds.has(feature.id) || isBusyPlan;
                      return (
                        <div
                          key={feature.id}
                          className={`flex items-center justify-between p-3 bg-bg-secondary rounded-lg border border-border-subtle hover:border-accent/30 transition-all ${
                            isBusy ? "opacity-60" : ""
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary break-words">
                              {feature.label || feature.feature_name}
                            </p>
                            <p className="text-xs text-text-muted font-mono">
                              {feature.feature_name}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 ml-3">
                            <Toggle
                              on={feature.is_enabled}
                              onToggle={() => !isBusy && toggleFeature(feature)}
                              disabled={isBusy}
                            />
                            {/* Display mode : hidden (disparaît) ou locked (grisé) */}
                            {!feature.is_enabled && (
                              <Btn
                                small
                                variant={feature.display_mode === 'hidden' ? 'warning' : 'default'}
                                icon={feature.display_mode === 'hidden' ? EyeOff : Lock}
                                onClick={() => !isBusy && toggleDisplayMode(feature)}
                                disabled={isBusy}
                              >
                                {feature.display_mode === 'hidden' ? 'Masqué' : 'Grisé'}
                              </Btn>
                            )}
                            <Btn
                              variant="danger"
                              icon={Trash2}
                              small
                              onClick={() => openDeleteConfirm(feature)}
                              disabled={isBusy}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Feature Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-text-primary mb-4">
              Ajouter une fonctionnalité
            </h3>

            <div className="space-y-4 mb-6">
              <Select
                label="Plan"
                value={newPlan}
                onChange={setNewPlan}
                options={PLANS.map((p) => ({
                  value: p.id,
                  label: p.name,
                }))}
              />

              <Input
                label="Nom de la fonctionnalité"
                value={newFeatureName}
                onChange={setNewFeatureName}
                placeholder="ex: advanced_analytics"
                hint="Identifiant technique (snake_case)"
              />

              <Input
                label="Libellé"
                value={newLabel}
                onChange={setNewLabel}
                placeholder="ex: Analyses avancées"
                hint="Texte affiché aux utilisateurs"
              />

              <div className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg border border-border-subtle">
                <div>
                  <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Activé
                  </p>
                </div>
                <Toggle on={newEnabled} onToggle={() => setNewEnabled(!newEnabled)} />
              </div>

              <Select
                label="Si désactivée, affichage"
                value={newDisplayMode}
                onChange={(v) => setNewDisplayMode(v as 'hidden' | 'locked')}
                options={[
                  { value: 'locked', label: '🔒 Grisé (verrouillé avec CTA upgrade)' },
                  { value: 'hidden', label: '👁 Masqué (disparaît complètement)' },
                ]}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Btn
                variant="default"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
              >
                Annuler
              </Btn>
              <Btn
                variant="primary"
                onClick={addFeature}
              >
                Ajouter
              </Btn>
            </div>
          </Card>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        open={showDeleteConfirm}
        title="Supprimer la fonctionnalité"
        message={`Êtes-vous sûr de vouloir supprimer "${selectedFeature?.label || selectedFeature?.feature_name}" ? Cette action est irréversible.`}
        onConfirm={deleteFeature}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setSelectedFeature(null);
        }}
        variant="danger"
      />
    </PageWrapper>
  );
}
