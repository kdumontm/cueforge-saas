"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Play, RotateCcw, RefreshCw, Eye, Plus, Trash2, X, Check, AlertCircle,
} from "lucide-react";
import {
  Input, Select, Btn, Card, Badge, PageWrapper,
  SectionHeader, LoadingScreen, EmptyState, useToast,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface Environment {
  id: number;
  name: string;
  type: "dev" | "staging" | "production";
  status: "healthy" | "degraded" | "offline";
  last_check: string;
  url: string;
}

interface EnvVariable {
  key: string;
  value: string;
  is_secret: boolean;
}

interface CompareResult {
  different_vars: { key: string; env1: string; env2: string }[];
  only_in_env1: string[];
  only_in_env2: string[];
}

export default function EnvironmentsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [environments, setEnvironments] = useState<Environment[]>([]);

  // Modal states
  const [createModal, setCreateModal] = useState(false);
  const [envVarsModal, setEnvVarsModal] = useState<Environment | null>(null);
  const [compareModal, setCompareModal] = useState(false);
  const [selectedEnv1, setSelectedEnv1] = useState<number | null>(null);
  const [selectedEnv2, setSelectedEnv2] = useState<number | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);

  // Form states
  const [newEnvName, setNewEnvName] = useState("");
  const [newEnvType, setNewEnvType] = useState<"dev" | "staging" | "production">("dev");
  const [envVars, setEnvVars] = useState<EnvVariable[]>([]);
  const [envVarsLoading, setEnvVarsLoading] = useState(false);
  const [deployLoading, setDeployLoading] = useState<number | null>(null);

  // Load environments
  const loadEnvironments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminApi.getEnvironments();
      setEnvironments(data.environments || []);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadEnvironments();
  }, [loadEnvironments]);

  // Handle create environment
  const handleCreateEnvironment = async () => {
    if (!newEnvName.trim()) {
      toast("Veuillez entrer un nom", "error");
      return;
    }
    try {
      await adminApi.createEnvironment({
        name: newEnvName,
        type: newEnvType,
      });
      toast("Environnement créé", "success");
      setNewEnvName("");
      setCreateModal(false);
      loadEnvironments();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  // Handle delete environment
  const handleDeleteEnvironment = async (envId: number) => {
    if (!confirm("Êtes-vous sûr?")) return;
    try {
      await adminApi.deleteEnvironment(envId);
      toast("Environnement supprimé", "success");
      loadEnvironments();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  // Handle check status
  const handleCheckStatus = async (envId: number) => {
    try {
      const data = await adminApi.getEnvironmentStatus(envId);
      toast(`Statut: ${data.status}`, "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  // Handle sync environment
  const handleSyncEnvironment = async (envId: number, sourceEnvId: number) => {
    try {
      await adminApi.syncEnvironment(envId, { source_env_id: sourceEnvId });
      toast("Synchronisation en cours", "success");
      loadEnvironments();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  // Handle deploy
  const handleDeploy = async (envId: number) => {
    try {
      setDeployLoading(envId);
      await adminApi.deployEnvironment(envId);
      toast("Déploiement lancé", "success");
      loadEnvironments();
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setDeployLoading(null);
    }
  };

  // Load env variables
  const handleOpenEnvVars = async (env: Environment) => {
    try {
      setEnvVarsLoading(true);
      const data = await adminApi.getEnvVariables(env.id);
      setEnvVars(data.variables || []);
      setEnvVarsModal(env);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setEnvVarsLoading(false);
    }
  };

  // Save env variables
  const handleSaveEnvVars = async () => {
    if (!envVarsModal) return;
    try {
      await adminApi.updateEnvVariables(envVarsModal.id, {
        variables: envVars,
      });
      toast("Variables mises à jour", "success");
      setEnvVarsModal(null);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  // Handle compare
  const handleCompare = async () => {
    if (!selectedEnv1 || !selectedEnv2) {
      toast("Veuillez sélectionner 2 environnements", "error");
      return;
    }
    try {
      const data = await adminApi.compareEnvironments({
        env1_id: selectedEnv1,
        env2_id: selectedEnv2,
      });
      setCompareResult(data);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <PageWrapper>
      <div className="flex items-center justify-between mb-8">
        <div>
          <SectionHeader
            title="Multi-environnements"
            desc="Gestion dev, staging, production"
          />
        </div>
        <Btn variant="primary" onClick={() => setCreateModal(true)}>
          <Plus className="w-4 h-4" /> Nouvel environnement
        </Btn>
      </div>

      {/* Environments List */}
      <Card>
        <div className="p-6">
          {environments.length === 0 ? (
            <EmptyState title="Aucun environnement" desc="Créez un environnement pour commencer" />
          ) : (
            <div className="space-y-4">
              {environments.map((env) => (
                <div
                  key={env.id}
                  className="flex items-center justify-between bg-[#0a0a1a] p-4 rounded border border-gray-700"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-white font-semibold">{env.name}</h4>
                      <Badge
                        variant={
                          env.status === "healthy"
                            ? "success"
                            : env.status === "degraded"
                              ? "warning"
                              : "error"
                        }
                      >
                        {env.status === "healthy"
                          ? "Sain"
                          : env.status === "degraded"
                            ? "Dégradé"
                            : "Hors ligne"}
                      </Badge>
                    </div>
                    <p className="text-gray-400 text-sm mt-1">{env.url}</p>
                    <p className="text-gray-500 text-xs mt-1">
                      Type: {env.type} • Contrôlé:{" "}
                      {new Date(env.last_check).toLocaleDateString("fr-FR")}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Btn
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCheckStatus(env.id)}
                      title="Vérifier le statut"
                    >
                      <AlertCircle className="w-4 h-4" />
                    </Btn>
                    <Btn
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenEnvVars(env)}
                      title="Variables d'environnement"
                    >
                      <Eye className="w-4 h-4" />
                    </Btn>
                    <Btn
                      variant="success"
                      size="sm"
                      onClick={() => handleDeploy(env.id)}
                      disabled={deployLoading === env.id}
                      title="Déployer"
                    >
                      <Play className="w-4 h-4" />
                    </Btn>
                    <Btn
                      variant="error"
                      size="sm"
                      onClick={() => handleDeleteEnvironment(env.id)}
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Compare Button */}
      <div className="mt-6">
        <Btn variant="secondary" onClick={() => setCompareModal(true)}>
          <RefreshCw className="w-4 h-4" /> Comparer les environnements
        </Btn>
      </div>

      {/* Create Environment Modal */}
      {createModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <Card className="w-96">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold">Nouvel environnement</h3>
                <button
                  onClick={() => setCreateModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm font-medium mb-2">
                    Nom
                  </label>
                  <Input
                    type="text"
                    value={newEnvName}
                    onChange={(e) => setNewEnvName(e.target.value)}
                    placeholder="ex: production-2"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm font-medium mb-2">
                    Type
                  </label>
                  <Select
                    value={newEnvType}
                    onChange={(e) => setNewEnvType(e.target.value as any)}
                  >
                    <option value="dev">Développement</option>
                    <option value="staging">Staging</option>
                    <option value="production">Production</option>
                  </Select>
                </div>
                <div className="flex gap-2 pt-4">
                  <Btn
                    variant="secondary"
                    onClick={() => setCreateModal(false)}
                    className="flex-1"
                  >
                    Annuler
                  </Btn>
                  <Btn
                    variant="primary"
                    onClick={handleCreateEnvironment}
                    className="flex-1"
                  >
                    Créer
                  </Btn>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Environment Variables Modal */}
      {envVarsModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-96 overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold">
                  Variables: {envVarsModal.name}
                </h3>
                <button
                  onClick={() => setEnvVarsModal(null)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {envVarsLoading ? (
                <div className="text-gray-400 text-center py-4">Chargement...</div>
              ) : (
                <>
                  <div className="space-y-3 mb-4">
                    {envVars.map((variable, idx) => (
                      <div key={idx} className="grid grid-cols-3 gap-2">
                        <Input
                          type="text"
                          value={variable.key}
                          onChange={(e) => {
                            const newVars = [...envVars];
                            newVars[idx].key = e.target.value;
                            setEnvVars(newVars);
                          }}
                          placeholder="Clé"
                        />
                        <Input
                          type={variable.is_secret ? "password" : "text"}
                          value={variable.value}
                          onChange={(e) => {
                            const newVars = [...envVars];
                            newVars[idx].value = e.target.value;
                            setEnvVars(newVars);
                          }}
                          placeholder="Valeur"
                          className="col-span-2"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Btn
                      variant="secondary"
                      onClick={() => setEnvVarsModal(null)}
                      className="flex-1"
                    >
                      Annuler
                    </Btn>
                    <Btn
                      variant="primary"
                      onClick={handleSaveEnvVars}
                      className="flex-1"
                    >
                      <Check className="w-4 h-4" /> Enregistrer
                    </Btn>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Compare Environments Modal */}
      {compareModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-3xl">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold">Comparer les environnements</h3>
                <button
                  onClick={() => {
                    setCompareModal(false);
                    setCompareResult(null);
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!compareResult ? (
                <div className="space-y-4 mb-4">
                  <div>
                    <label className="block text-gray-400 text-sm font-medium mb-2">
                      Environnement 1
                    </label>
                    <Select
                      value={selectedEnv1 || ""}
                      onChange={(e) => setSelectedEnv1(parseInt(e.target.value) || null)}
                    >
                      <option value="">Sélectionner...</option>
                      {environments.map((env) => (
                        <option key={env.id} value={env.id}>
                          {env.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm font-medium mb-2">
                      Environnement 2
                    </label>
                    <Select
                      value={selectedEnv2 || ""}
                      onChange={(e) => setSelectedEnv2(parseInt(e.target.value) || null)}
                    >
                      <option value="">Sélectionner...</option>
                      {environments.map((env) => (
                        <option key={env.id} value={env.id}>
                          {env.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Btn
                      variant="secondary"
                      onClick={() => setCompareModal(false)}
                      className="flex-1"
                    >
                      Annuler
                    </Btn>
                    <Btn
                      variant="primary"
                      onClick={handleCompare}
                      className="flex-1"
                    >
                      Comparer
                    </Btn>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {compareResult.different_vars.length > 0 && (
                    <div>
                      <h4 className="text-white font-semibold mb-2">
                        Différences
                      </h4>
                      {compareResult.different_vars.map((v, idx) => (
                        <p key={idx} className="text-gray-400 text-sm">
                          {v.key}: {v.env1} → {v.env2}
                        </p>
                      ))}
                    </div>
                  )}
                  {compareResult.only_in_env1.length > 0 && (
                    <div>
                      <h4 className="text-white font-semibold mb-2">
                        Seulement dans Env 1
                      </h4>
                      {compareResult.only_in_env1.map((k, idx) => (
                        <p key={idx} className="text-gray-400 text-sm">
                          {k}
                        </p>
                      ))}
                    </div>
                  )}
                  {compareResult.only_in_env2.length > 0 && (
                    <div>
                      <h4 className="text-white font-semibold mb-2">
                        Seulement dans Env 2
                      </h4>
                      {compareResult.only_in_env2.map((k, idx) => (
                        <p key={idx} className="text-gray-400 text-sm">
                          {k}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </PageWrapper>
  );
}
