"use client";

import { useState, useEffect } from "react";
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
import { Plus, Trash2, Package } from "lucide-react";

interface Feature {
  id: number;
  plan_name: string;
  feature_name: string;
  label: string;
  is_enabled: boolean;
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
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);

  // Form state for adding new feature
  const [newPlan, setNewPlan] = useState("free");
  const [newFeatureName, setNewFeatureName] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newEnabled, setNewEnabled] = useState(true);

  // Load features
  useEffect(() => {
    loadFeatures();
  }, []);

  async function loadFeatures() {
    try {
      setLoading(true);
      const data = await adminApi.listFeatures();
      setFeatures(Array.isArray(data) ? data : data.items || []);
    } catch (err: any) {
      toast(err.message || "Erreur lors du chargement des fonctionnalités", "error");
    } finally {
      setLoading(false);
    }
  }

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

  // Quick toggle
  async function toggleFeature(feature: Feature) {
    try {
      setSaving(true);
      await adminApi.updateFeature(feature.id, {
        is_enabled: !feature.is_enabled,
      });
      toast("Fonctionnalité mise à jour avec succès", "success");
      await loadFeatures();
    } catch (err: any) {
      toast(err.message || "Erreur lors de la mise à jour", "error");
    } finally {
      setSaving(false);
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
      setSaving(true);
      await adminApi.createFeature({
        plan_name: newPlan,
        feature_name: newFeatureName,
        label: newLabel,
        is_enabled: newEnabled,
      });
      toast("Fonctionnalité ajoutée avec succès", "success");
      setShowAddModal(false);
      resetForm();
      await loadFeatures();
    } catch (err: any) {
      toast(err.message || "Erreur lors de l'ajout", "error");
    } finally {
      setSaving(false);
    }
  }

  // Delete feature
  async function deleteFeature() {
    if (!selectedFeature) return;
    try {
      setSaving(true);
      await adminApi.deleteFeature(selectedFeature.id);
      toast("Fonctionnalité supprimée avec succès", "success");
      setShowDeleteConfirm(false);
      setSelectedFeature(null);
      await loadFeatures();
    } catch (err: any) {
      toast(err.message || "Erreur lors de la suppression", "error");
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setNewPlan("free");
    setNewFeatureName("");
    setNewLabel("");
    setNewEnabled(true);
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
            const badgeVariant = plan.color as "default" | "success" | "warning" | "error" | "info" | "purple" | "pink";
            return (
              <Card key={plan.id} className="p-6">
                {/* Plan Header */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-border-subtle">
                  <h3 className="text-lg font-bold text-text-primary">
                    {plan.name}
                  </h3>
                  <Badge variant={badgeVariant}>
                    {planFeatures.length}
                  </Badge>
                </div>

                {/* Features List */}
                {planFeatures.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-8">
                    Aucune fonctionnalité pour ce plan
                  </p>
                ) : (
                  <div className="space-y-3">
                    {planFeatures.map((feature) => (
                      <div
                        key={feature.id}
                        className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg border border-border-subtle hover:border-accent/30 transition-colors"
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
                            onToggle={() => toggleFeature(feature)}
                            disabled={saving}
                          />
                          <Btn
                            variant="danger"
                            icon={Trash2}
                            small
                            onClick={() => openDeleteConfirm(feature)}
                            disabled={saving}
                          />
                        </div>
                      </div>
                    ))}
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
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Btn
                variant="default"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                disabled={saving}
              >
                Annuler
              </Btn>
              <Btn
                variant="primary"
                onClick={addFeature}
                loading={saving}
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
