'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '../_components/api';

type ImportExportTab = 'import' | 'export';
type DataType = 'users' | 'tracks' | 'playlists';
type ExportFormat = 'csv' | 'json' | 'xlsx';

interface ImportJob {
  id: string;
  type: DataType;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  rows_processed: number;
  rows_failed: number;
  created_at: string;
}

interface FieldMapping {
  id: string;
  data_type: DataType;
  mappings: Record<string, string>;
  created_at: string;
}

export default function ImportExportPage() {
  const [tab, setTab] = useState<ImportExportTab>('import');
  const [loading, setLoading] = useState(false);

  // Import
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importType, setImportType] = useState<DataType>('users');
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [selectedMapping, setSelectedMapping] = useState<string>('');
  const [mappingPreview, setMappingPreview] = useState<string>('');

  // Export
  const [exportType, setExportType] = useState<DataType>('users');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [exportFilters, setExportFilters] = useState<string>('');

  useEffect(() => {
    fetchImportJobs();
    fetchFieldMappings();
  }, []);

  async function fetchImportJobs() {
    try {
      const data = await adminApi.getImportExportJobs();
      setImportJobs(data.jobs || []);
    } catch (err) {
      console.error('Error loading jobs:', err);
    }
  }

  async function fetchFieldMappings() {
    try {
      const data = await adminApi.getFieldMappings();
      setFieldMappings(data.mappings || []);
    } catch (err) {
      console.error('Error loading mappings:', err);
    }
  }

  async function handleImport() {
    if (!importFile) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('data_type', importType);
      if (selectedMapping) {
        formData.append('field_mapping_id', selectedMapping);
      }
      await adminApi.importData(formData);
      setImportFile(null);
      setMappingPreview('');
      fetchImportJobs();
    } catch (err) {
      alert(`Erreur d'import: ${err}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    setLoading(true);
    try {
      const url = new URL(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/admin/export`
      );
      url.searchParams.set('data_type', exportType);
      url.searchParams.set('format', exportFormat);
      if (exportFilters) {
        url.searchParams.set('filters', exportFilters);
      }

      const token = localStorage.getItem('trackcue_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(url, { headers });
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `export-${exportType}-${Date.now()}.${exportFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert(`Erreur d'export: ${err}`);
    } finally {
      setLoading(false);
    }
  }

  async function downloadTemplate() {
    try {
      const data = await adminApi.getImportTemplates();
      const templates = data.templates || {};

      const template = templates[importType] || '';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([template]));
      link.download = `template-${importType}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert(`Erreur: ${err}`);
    }
  }

  if (loading && importJobs.length === 0) {
    return <div className="p-8 text-center text-gray-400">Chargement...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0a0a1a] p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Import / Export</h1>

        {/* Tab buttons */}
        <div className="flex gap-3 mb-6">
          {(['import', 'export'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                tab === t
                  ? 'bg-purple-600 text-white'
                  : 'bg-[#1a1a2e] text-gray-400 hover:bg-[#252540]'
              }`}
            >
              {t === 'import' ? 'Importer' : 'Exporter'}
            </button>
          ))}
        </div>

        {/* Import Tab */}
        {tab === 'import' && (
          <div className="space-y-6">
            <div className="bg-[#1a1a2e] rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">Importer des Données</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Type de Données</label>
                  <select
                    value={importType}
                    onChange={e => setImportType(e.target.value as DataType)}
                    className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                  >
                    <option value="users">Utilisateurs</option>
                    <option value="tracks">Pistes</option>
                    <option value="playlists">Playlists</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-400 text-sm mb-2">Fichier</label>
                  <div className="border-2 border-dashed border-purple-600 rounded-lg p-6 text-center cursor-pointer hover:bg-[#1a1a2e] transition"
                    onClick={() => document.getElementById('file-input')?.click()}>
                    {importFile ? (
                      <>
                        <p className="text-white font-medium">{importFile.name}</p>
                        <p className="text-gray-400 text-sm">{(importFile.size / 1024).toFixed(2)} KB</p>
                      </>
                    ) : (
                      <>
                        <p className="text-white font-medium">Déposer le fichier ici ou cliquer</p>
                        <p className="text-gray-400 text-sm">CSV, JSON ou XLSX supportés</p>
                      </>
                    )}
                  </div>
                  <input
                    id="file-input"
                    type="file"
                    onChange={e => setImportFile(e.target.files?.[0] || null)}
                    accept=".csv,.json,.xlsx"
                    className="hidden"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 text-sm mb-2">Mapping des Champs</label>
                  <select
                    value={selectedMapping}
                    onChange={e => setSelectedMapping(e.target.value)}
                    className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                  >
                    <option value="">-- Défaut --</option>
                    {fieldMappings.map(m => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={downloadTemplate}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded"
                  >
                    Télécharger Template
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={!importFile}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-bold py-2 rounded"
                  >
                    Importer
                  </button>
                </div>
              </div>
            </div>

            {/* Import Jobs */}
            <div className="bg-[#1a1a2e] rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">Historique des Imports</h2>

              {importJobs.length === 0 ? (
                <p className="text-gray-400">Aucun import.</p>
              ) : (
                <div className="space-y-3">
                  {importJobs.map(job => (
                    <div key={job.id} className="bg-[#0a0a1a] rounded p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-white font-medium">{job.type}</p>
                          <p className="text-gray-500 text-sm">{new Date(job.created_at).toLocaleString('fr-FR')}</p>
                        </div>
                        <span className={`px-3 py-1 rounded text-sm font-medium ${
                          job.status === 'completed' ? 'bg-green-900 text-green-200' :
                          job.status === 'failed' ? 'bg-red-900 text-red-200' :
                          job.status === 'processing' ? 'bg-yellow-900 text-yellow-200' :
                          'bg-gray-900 text-gray-200'
                        }`}>
                          {job.status === 'processing' ? 'Traitement' : job.status === 'completed' ? 'Complété' : job.status === 'failed' ? 'Échoué' : 'En attente'}
                        </span>
                      </div>
                      <p className="text-gray-400 text-sm">Traité: {job.rows_processed} | Échoué: {job.rows_failed}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Export Tab */}
        {tab === 'export' && (
          <div className="bg-[#1a1a2e] rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Exporter des Données</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Type de Données</label>
                <select
                  value={exportType}
                  onChange={e => setExportType(e.target.value as DataType)}
                  className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                >
                  <option value="users">Utilisateurs</option>
                  <option value="tracks">Pistes</option>
                  <option value="playlists">Playlists</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Format</label>
                <select
                  value={exportFormat}
                  onChange={e => setExportFormat(e.target.value as ExportFormat)}
                  className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                >
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                  <option value="xlsx">XLSX</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Filtres JSON (optionnel)</label>
                <textarea
                  value={exportFilters}
                  onChange={e => setExportFilters(e.target.value)}
                  rows={4}
                  placeholder='{"status": "active"}'
                  className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2 font-mono text-sm"
                />
              </div>

              <button
                onClick={handleExport}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded"
              >
                Télécharger Export
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
