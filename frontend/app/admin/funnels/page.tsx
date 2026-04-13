"use client";

import { useEffect, useState } from "react";
import { Copy, Trash2, Plus, ChevronDown } from "lucide-react";
import { Card, PageWrapper, LoadingScreen, Btn, Input, Modal } from "../_components/shared";
import { adminApi } from "../_components/api";

interface Funnel {
  id: number;
  name: string;
  steps: string[];
  created_at: string;
}

interface FunnelResults {
  step: string;
  users: number;
  conversion_percent: number;
}

interface FunnelTemplate {
  id: number;
  name: string;
  steps: string[];
  description: string;
}

export default function AdminFunnels() {
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedFunnel, setSelectedFunnel] = useState<Funnel | null>(null);
  const [results, setResults] = useState<FunnelResults[] | null>(null);
  const [templates, setTemplates] = useState<FunnelTemplate[]>([]);

  // Form state
  const [formData, setFormData] = useState({ name: "", steps: "[]" });

  useEffect(() => {
    loadFunnels();
  }, []);

  async function loadFunnels() {
    try {
      setLoading(true);
      setError(null);
      const data = await adminApi.getFunnels?.() ?? [];
      setFunnels(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadTemplates() {
    try {
      const data = await adminApi.getFunnelTemplates?.() ?? [];
      setTemplates(data);
      setShowTemplates(true);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleCreate() {
    if (!formData.name.trim()) {
      setError("Le nom est requis");
      return;
    }

    try {
      const steps = JSON.parse(formData.steps);
      await adminApi.createFunnel?.({ name: formData.name, steps });
      setShowModal(false);
      setFormData({ name: "", steps: "[]" });
      loadFunnels();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cet entonnoir ?")) return;
    try {
      await adminApi.deleteFunnel?.(id);
      loadFunnels();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDuplicate(funnel: Funnel) {
    try {
      await adminApi.duplicateFunnel?.(funnel.id);
      loadFunnels();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleViewResults(funnel: Funnel) {
    try {
      const data = await adminApi.getFunnelResults?.(funnel.id) ?? [];
      setResults(data);
      setSelectedFunnel(funnel);
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <PageWrapper title="Analyse des entonnoirs" subtitle="Créer et analyser les entonnoirs de conversion">
      {error && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 mb-6 text-red-400">
          {error}
        </div>
      )}

      <div className="flex gap-3 mb-6">
        <Btn variant="primary" icon={Plus} onClick={() => setShowModal(true)}>
          Créer un entonnoir
        </Btn>
        <Btn variant="default" icon={ChevronDown} onClick={loadTemplates}>
          Modèles
        </Btn>
      </div>

      {/* Results View */}
      {selectedFunnel && results && (
        <Card className="p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-semibold">{selectedFunnel.name}</h3>
            <Btn variant="ghost" small onClick={() => setSelectedFunnel(null)}>
              Fermer
            </Btn>
          </div>

          <div className="space-y-4">
            {results.map((result, idx) => (
              <div key={idx}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-300">{result.step}</span>
                  <span className="text-xs text-gray-400">{result.users} utilisateurs</span>
                </div>
                <div className="w-full bg-[#0a0a1a] rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-purple-600 to-purple-400 h-full transition-all"
                    style={{ width: `${result.conversion_percent}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {result.conversion_percent.toFixed(1)}% conversion
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Funnels List */}
      <div className="grid gap-4">
        {funnels.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            Aucun entonnoir créé
          </div>
        ) : (
          funnels.map((funnel) => (
            <Card key={funnel.id} className="p-4 hover:bg-[#0a0a1a] transition">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="text-white font-semibold text-sm">{funnel.name}</h4>
                  <div className="text-xs text-gray-400 mt-1">
                    {funnel.steps.length} étapes • {new Date(funnel.created_at).toLocaleDateString("fr-FR")}
                  </div>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {funnel.steps.map((step, idx) => (
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
                    onClick={() => handleViewResults(funnel)}
                  >
                    Résultats
                  </Btn>
                  <Btn
                    variant="default"
                    small
                    icon={Copy}
                    onClick={() => handleDuplicate(funnel)}
                    title="Dupliquer"
                  />
                  <Btn
                    variant="danger"
                    small
                    icon={Trash2}
                    onClick={() => handleDelete(funnel.id)}
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
        <Modal title="Créer un entonnoir" onClose={() => setShowModal(false)}>
          <Input
            label="Nom"
            value={formData.name}
            onChange={(v) => setFormData({ ...formData, name: v })}
            placeholder="Mon entonnoir"
          />
          <Input
            label="Étapes (JSON)"
            value={formData.steps}
            onChange={(v) => setFormData({ ...formData, steps: v })}
            multiline
            rows={4}
            placeholder='["signup", "verify", "complete"]'
            hint="Format: tableau JSON d'étapes"
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

      {/* Templates Drawer */}
      {showTemplates && (
        <Modal title="Modèles d'entonnoir" onClose={() => setShowTemplates(false)}>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {templates.length === 0 ? (
              <div className="text-center py-8 text-gray-400">Aucun modèle disponible</div>
            ) : (
              templates.map((template) => (
                <Card key={template.id} className="p-3">
                  <h4 className="text-white font-semibold text-sm">{template.name}</h4>
                  <p className="text-gray-400 text-xs mt-1">{template.description}</p>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {template.steps.map((step, idx) => (
                      <span key={idx} className="bg-purple-600/20 text-purple-400 text-[10px] px-2 py-1 rounded">
                        {step}
                      </span>
                    ))}
                  </div>
                </Card>
              ))
            )}
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
