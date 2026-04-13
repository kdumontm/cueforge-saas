"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus, Play, Clock } from "lucide-react";
import { Card, PageWrapper, LoadingScreen, Btn, Input, Select, Modal } from "../_components/shared";
import { adminApi } from "../_components/api";

interface CustomReport {
  id: number;
  name: string;
  query: string;
  visualization_type: "table" | "bar" | "line" | "pie";
  filters: Record<string, any>;
  created_at: string;
  last_run: string;
}

interface ReportResult {
  columns: string[];
  rows: any[];
  total_rows: number;
}

export default function AdminCustomReports() {
  const [reports, setReports] = useState<CustomReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<CustomReport | null>(null);
  const [results, setResults] = useState<ReportResult | null>(null);
  const [running, setRunning] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    query: "",
    visualization_type: "table" as const,
    filters: "{}",
  });

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    try {
      setLoading(true);
      setError(null);
      const data = await adminApi.getCustomReports?.() ?? [];
      setReports(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!formData.name.trim() || !formData.query.trim()) {
      setError("Le nom et la requête sont requis");
      return;
    }

    try {
      const filters = JSON.parse(formData.filters);
      await adminApi.createCustomReport?.({
        name: formData.name,
        query: formData.query,
        visualization_type: formData.visualization_type,
        filters,
      });
      setShowModal(false);
      setFormData({
        name: "",
        query: "",
        visualization_type: "table",
        filters: "{}",
      });
      loadReports();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce rapport ?")) return;
    try {
      await adminApi.deleteCustomReport?.(id);
      loadReports();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleRun(report: CustomReport) {
    try {
      setRunning(true);
      const data = await adminApi.runCustomReport?.(report.id) ?? null;
      setResults(data);
      setSelectedReport(report);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function handleSchedule(report: CustomReport) {
    try {
      await adminApi.scheduleCustomReport?.(report.id);
      setError(null);
      // Show success message in real implementation
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <PageWrapper title="Rapports personnalisés" subtitle="Créer et exécuter des requêtes personnalisées">
      {error && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 mb-6 text-red-400">
          {error}
        </div>
      )}

      <div className="flex gap-3 mb-6">
        <Btn variant="primary" icon={Plus} onClick={() => setShowModal(true)}>
          Créer un rapport
        </Btn>
      </div>

      {/* Results View */}
      {selectedReport && results && (
        <Card className="p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-semibold">{selectedReport.name}</h3>
            <Btn variant="ghost" small onClick={() => setSelectedReport(null)}>
              Fermer
            </Btn>
          </div>

          {selectedReport.visualization_type === "table" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {results.columns.map((col) => (
                      <th key={col} className="text-left py-3 px-2 text-gray-400 font-semibold text-xs">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.rows.length === 0 ? (
                    <tr>
                      <td colSpan={results.columns.length} className="text-center py-8 text-gray-400">
                        Aucun résultat
                      </td>
                    </tr>
                  ) : (
                    results.rows.slice(0, 50).map((row, idx) => (
                      <tr key={idx} className="border-b border-gray-900 hover:bg-[#0a0a1a] transition">
                        {results.columns.map((col) => (
                          <td key={col} className="py-3 px-2 text-gray-300 text-xs">
                            {typeof row[col] === "object" ? JSON.stringify(row[col]) : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {results.total_rows > 50 && (
                <div className="text-center py-3 text-gray-500 text-xs">
                  Affichage 1-50 sur {results.total_rows} résultats
                </div>
              )}
            </div>
          )}

          {selectedReport.visualization_type === "bar" && (
            <div className="space-y-3">
              {results.rows.slice(0, 10).map((row, idx) => {
                const val = Object.values(row)[1] as number;
                const maxVal = Math.max(...results.rows.map((r) => Object.values(r)[1] as number), 1);
                const percent = (val / maxVal) * 100;
                return (
                  <div key={idx}>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{Object.values(row)[0]}</span>
                      <span>{val}</span>
                    </div>
                    <div className="w-full bg-[#0a0a1a] rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-purple-600 to-purple-400 h-full transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(selectedReport.visualization_type === "line" || selectedReport.visualization_type === "pie") && (
            <div className="text-center py-8 text-gray-400">
              {selectedReport.visualization_type === "line" && "Graphique linéaire - Implémentation nécessaire"}
              {selectedReport.visualization_type === "pie" && "Graphique circulaire - Implémentation nécessaire"}
            </div>
          )}
        </Card>
      )}

      {/* Reports List */}
      <div className="grid gap-4">
        {reports.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            Aucun rapport créé
          </div>
        ) : (
          reports.map((report) => (
            <Card key={report.id} className="p-4 hover:bg-[#0a0a1a] transition">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="text-white font-semibold text-sm">{report.name}</h4>
                  <div className="text-xs text-gray-400 mt-1">
                    Type: <span className="text-purple-400">{report.visualization_type}</span>
                  </div>
                  <div className="text-xs text-gray-500 font-mono mt-2 line-clamp-2">
                    {report.query}
                  </div>
                  <div className="text-xs text-gray-600 mt-2">
                    Créé: {new Date(report.created_at).toLocaleDateString("fr-FR")}
                    {report.last_run && (
                      <span className="ml-2">
                        • Dernier: {new Date(report.last_run).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-col md:flex-row">
                  <Btn
                    variant="primary"
                    small
                    icon={Play}
                    onClick={() => handleRun(report)}
                    loading={running}
                  >
                    Exécuter
                  </Btn>
                  <Btn
                    variant="default"
                    small
                    icon={Clock}
                    onClick={() => handleSchedule(report)}
                    title="Programmer"
                  />
                  <Btn
                    variant="danger"
                    small
                    icon={Trash2}
                    onClick={() => handleDelete(report.id)}
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
        <Modal title="Créer un rapport personnalisé" onClose={() => setShowModal(false)}>
          <Input
            label="Nom"
            value={formData.name}
            onChange={(v) => setFormData({ ...formData, name: v })}
            placeholder="Rapport mensuel des utilisateurs"
          />

          <Input
            label="Requête SQL"
            value={formData.query}
            onChange={(v) => setFormData({ ...formData, query: v })}
            multiline
            rows={6}
            placeholder="SELECT * FROM users WHERE created_at > NOW() - INTERVAL 30 DAY"
            hint="Écrivez votre requête SQL"
          />

          <Select
            label="Type de visualisation"
            value={formData.visualization_type}
            onChange={(v) => setFormData({ ...formData, visualization_type: v as any })}
            options={[
              { value: "table", label: "Tableau" },
              { value: "bar", label: "Diagramme en barres" },
              { value: "line", label: "Graphique linéaire" },
              { value: "pie", label: "Graphique circulaire" },
            ]}
          />

          <Input
            label="Filtres (JSON)"
            value={formData.filters}
            onChange={(v) => setFormData({ ...formData, filters: v })}
            multiline
            rows={3}
            placeholder='{"status": "active"}'
            hint="Filtres optionnels en JSON"
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
