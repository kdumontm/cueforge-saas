'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '../_components/api';

type ErrorLevel = 'error' | 'warning' | 'critical';
type ViewMode = 'list' | 'grouped';

interface ErrorStats {
  total_errors: number;
  unresolved: number;
  critical_count: number;
}

interface ErrorItem {
  id: string;
  level: ErrorLevel;
  message: string;
  source: string;
  stack_trace?: string;
  count: number;
  last_occurrence: string;
  resolved: boolean;
  ignored: boolean;
}

interface ErrorGroup {
  id: string;
  fingerprint: string;
  message: string;
  level: ErrorLevel;
  count: number;
  last_occurrence: string;
  affected_users: number;
}

export default function ErrorTrackingPage() {
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [groups, setGroups] = useState<ErrorGroup[]>([]);
  const [stats, setStats] = useState<ErrorStats | null>(null);
  const [filterLevel, setFilterLevel] = useState<ErrorLevel | 'all'>('all');
  const [filterSource, setFilterSource] = useState('all');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);

  useEffect(() => {
    fetchErrors();
    const interval = setInterval(fetchErrors, 10000);
    return () => clearInterval(interval);
  }, [filterLevel, filterSource, dateRange]);

  async function fetchErrors() {
    try {
      const [errorsData, statsData, groupsData] = await Promise.all([
        adminApi.getErrors({
          level: filterLevel === 'all' ? undefined : filterLevel,
          source: filterSource === 'all' ? undefined : filterSource,
          from_date: dateRange.from || undefined,
          to_date: dateRange.to || undefined,
        }),
        adminApi.getErrorStats(),
        adminApi.getErrorGroups({
          level: filterLevel === 'all' ? undefined : filterLevel,
        }),
      ]);

      setErrors(errorsData.errors || []);
      setStats(statsData);
      setGroups(groupsData.groups || []);

      const uniqueSources = [...new Set((errorsData.errors || []).map(e => e.source))];
      setSources(uniqueSources);
    } catch (err) {
      console.error('Error loading errors:', err);
    } finally {
      setLoading(false);
    }
  }

  async function resolveError(errorId: string) {
    try {
      await adminApi.resolveError(errorId);
      fetchErrors();
    } catch (err) {
      alert(`Erreur: ${err}`);
    }
  }

  async function ignoreError(errorId: string) {
    try {
      await adminApi.ignoreError(errorId);
      fetchErrors();
    } catch (err) {
      alert(`Erreur: ${err}`);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Chargement...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0a0a1a] p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Suivi des Erreurs</h1>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-[#1a1a2e] rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-2">Erreurs Totales</p>
              <p className="text-3xl font-bold text-white">{stats.total_errors}</p>
            </div>
            <div className="bg-[#1a1a2e] rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-2">Non Résolues</p>
              <p className="text-3xl font-bold text-orange-500">{stats.unresolved}</p>
            </div>
            <div className="bg-[#1a1a2e] rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-2">Critiques</p>
              <p className="text-3xl font-bold text-red-500">{stats.critical_count}</p>
            </div>
          </div>
        )}

        {/* Tab & Filter Controls */}
        <div className="bg-[#1a1a2e] rounded-lg p-4 mb-6">
          <div className="flex flex-wrap gap-3 mb-4">
            {(['list', 'grouped'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  viewMode === mode
                    ? 'bg-purple-600 text-white'
                    : 'bg-[#0a0a1a] text-gray-400 hover:bg-[#252540]'
                }`}
              >
                {mode === 'list' ? 'Liste' : 'Groupée'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-gray-400 text-xs mb-1">Niveau</label>
              <select
                value={filterLevel}
                onChange={e => setFilterLevel(e.target.value as any)}
                className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2 text-sm"
              >
                <option value="all">Tous</option>
                <option value="warning">Avertissement</option>
                <option value="error">Erreur</option>
                <option value="critical">Critique</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-400 text-xs mb-1">Source</label>
              <select
                value={filterSource}
                onChange={e => setFilterSource(e.target.value)}
                className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2 text-sm"
              >
                <option value="all">Tous</option>
                {sources.map(source => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-gray-400 text-xs mb-1">Du</label>
              <input
                type="date"
                value={dateRange.from}
                onChange={e => setDateRange({ ...dateRange, from: e.target.value })}
                className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-gray-400 text-xs mb-1">Au</label>
              <input
                type="date"
                value={dateRange.to}
                onChange={e => setDateRange({ ...dateRange, to: e.target.value })}
                className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* List View */}
        {viewMode === 'list' && (
          <div className="space-y-3">
            {errors.length === 0 ? (
              <div className="bg-[#1a1a2e] rounded-lg p-6 text-center">
                <p className="text-gray-400">Aucune erreur détectée.</p>
              </div>
            ) : (
              errors.map(error => (
                <div
                  key={error.id}
                  className="bg-[#1a1a2e] rounded-lg p-4 hover:bg-[#252540] transition"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          error.level === 'critical' ? 'bg-red-900 text-red-200' :
                          error.level === 'error' ? 'bg-orange-900 text-orange-200' :
                          'bg-yellow-900 text-yellow-200'
                        }`}>
                          {error.level === 'critical' ? 'CRITIQUE' : error.level === 'error' ? 'ERREUR' : 'AVERTISSEMENT'}
                        </span>
                        <span className="text-gray-500 text-xs font-mono">{error.source}</span>
                      </div>
                      <p className="text-white font-medium">{error.message}</p>
                      <p className="text-gray-500 text-sm mt-1">
                        Occurrences: {error.count} | Dernière: {new Date(error.last_occurrence).toLocaleString('fr-FR')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setExpandedError(expandedError === error.id ? null : error.id)}
                        className="text-gray-400 hover:text-purple-400 text-sm"
                      >
                        {expandedError === error.id ? 'Masquer' : 'Stack'}
                      </button>
                    </div>
                  </div>

                  {/* Stack Trace */}
                  {expandedError === error.id && error.stack_trace && (
                    <div className="bg-[#0a0a1a] rounded p-3 mb-3 max-h-48 overflow-y-auto">
                      <pre className="text-gray-400 text-xs font-mono whitespace-pre-wrap">{error.stack_trace}</pre>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => resolveError(error.id)}
                      disabled={error.resolved}
                      className="text-sm px-3 py-1 rounded bg-green-900 hover:bg-green-800 disabled:bg-gray-700 disabled:opacity-50 text-green-200"
                    >
                      {error.resolved ? 'Résolu' : 'Marquer Résolu'}
                    </button>
                    <button
                      onClick={() => ignoreError(error.id)}
                      disabled={error.ignored}
                      className="text-sm px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200"
                    >
                      {error.ignored ? 'Ignoré' : 'Ignorer'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Grouped View */}
        {viewMode === 'grouped' && (
          <div className="space-y-3">
            {groups.length === 0 ? (
              <div className="bg-[#1a1a2e] rounded-lg p-6 text-center">
                <p className="text-gray-400">Aucun groupe d'erreur.</p>
              </div>
            ) : (
              groups.map(group => (
                <div key={group.id} className="bg-[#1a1a2e] rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          group.level === 'critical' ? 'bg-red-900 text-red-200' :
                          group.level === 'error' ? 'bg-orange-900 text-orange-200' :
                          'bg-yellow-900 text-yellow-200'
                        }`}>
                          {group.level === 'critical' ? 'CRITIQUE' : group.level === 'error' ? 'ERREUR' : 'AVERTISSEMENT'}
                        </span>
                      </div>
                      <p className="text-white font-medium">{group.message}</p>
                      <p className="text-gray-500 text-sm mt-1">
                        {group.count} occurrences | {group.affected_users} utilisateurs affectés
                      </p>
                      <p className="text-gray-600 text-xs mt-1">Dernière: {new Date(group.last_occurrence).toLocaleString('fr-FR')}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
