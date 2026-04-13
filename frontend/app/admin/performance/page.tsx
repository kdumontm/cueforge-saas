'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '../_components/api';

interface PerformanceOverview {
  score: number;
  status: 'excellent' | 'good' | 'fair' | 'poor';
  recommendations: string[];
}

interface EndpointMetric {
  path: string;
  method: string;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  call_count: number;
}

interface SlowQuery {
  id: string;
  query: string;
  avg_duration_ms: number;
  call_count: number;
  affected_endpoints: string[];
}

interface ProfilerResult {
  id: string;
  duration_seconds: number;
  total_calls: number;
  slowest_functions: Array<{
    name: string;
    calls: number;
    total_time_ms: number;
  }>;
}

export default function PerformancePage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<PerformanceOverview | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointMetric[]>([]);
  const [slowQueries, setSlowQueries] = useState<SlowQuery[]>([]);
  const [profilerRunning, setProfilerRunning] = useState(false);
  const [profilerResults, setProfilerResults] = useState<ProfilerResult | null>(null);

  useEffect(() => {
    fetchPerformanceData();
  }, []);

  async function fetchPerformanceData() {
    try {
      const [overviewData, endpointsData, queriesData] = await Promise.all([
        adminApi.getPerformanceOverview(),
        adminApi.getEndpointPerformance(),
        adminApi.getSlowQueries(),
      ]);

      setOverview(overviewData);
      setEndpoints(endpointsData.endpoints || []);
      setSlowQueries(queriesData.queries || []);
    } catch (err) {
      console.error('Error loading performance data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function startProfiler() {
    setProfilerRunning(true);
    try {
      await adminApi.startProfiler();
      // Profiler runs in background, we'll poll for results
    } catch (err) {
      alert(`Erreur: ${err}`);
    }
  }

  async function stopProfiler() {
    setProfilerRunning(false);
    try {
      const results = await adminApi.stopProfiler();
      setProfilerResults(results);
    } catch (err) {
      alert(`Erreur: ${err}`);
    }
  }

  async function fetchProfilerResults() {
    try {
      const results = await adminApi.getProfilerResults();
      setProfilerResults(results);
    } catch (err) {
      console.error('Error loading profiler results:', err);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Chargement...</div>;
  }

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  const getStatusBg = (status: string): string => {
    if (status === 'excellent') return 'bg-green-900 text-green-200';
    if (status === 'good') return 'bg-blue-900 text-blue-200';
    if (status === 'fair') return 'bg-yellow-900 text-yellow-200';
    return 'bg-red-900 text-red-200';
  };

  return (
    <div className="min-h-screen bg-[#0a0a1a] p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Monitoring de Performance</h1>

        {/* Overview Score */}
        {overview && (
          <div className="bg-[#1a1a2e] rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-white mb-4">Score Global</h2>
            <div className="flex items-center gap-8 mb-6">
              <div>
                <p className={`text-6xl font-bold ${getScoreColor(overview.score)}`}>
                  {overview.score}
                </p>
                <p className="text-gray-400 mt-2">/ 100</p>
              </div>
              <div>
                <span className={`px-4 py-2 rounded-lg font-medium ${getStatusBg(overview.status)}`}>
                  {overview.status === 'excellent' ? 'Excellent' :
                   overview.status === 'good' ? 'Bon' :
                   overview.status === 'fair' ? 'Acceptable' :
                   'Mauvais'}
                </span>
              </div>
            </div>

            {overview.recommendations.length > 0 && (
              <>
                <h3 className="text-lg font-bold text-white mb-3">Recommandations</h3>
                <ul className="space-y-2">
                  {overview.recommendations.map((rec, i) => (
                    <li key={i} className="text-gray-400 text-sm flex items-start gap-2">
                      <span className="text-purple-400 mt-1">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Slowest Endpoints */}
          <div className="bg-[#1a1a2e] rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Endpoints Les Plus Lents</h2>
            {endpoints.length === 0 ? (
              <p className="text-gray-400">Aucune donnée.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-gray-400 pb-2">Endpoint</th>
                      <th className="text-right text-gray-400 pb-2">P50</th>
                      <th className="text-right text-gray-400 pb-2">P95</th>
                      <th className="text-right text-gray-400 pb-2">P99</th>
                    </tr>
                  </thead>
                  <tbody className="space-y-1">
                    {endpoints.sort((a, b) => b.p99_ms - a.p99_ms).slice(0, 10).map((ep, i) => (
                      <tr key={i} className="border-b border-gray-800">
                        <td className="text-white py-2 truncate">
                          <span className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400">{ep.method}</span>
                          <span className="ml-2 text-gray-300">{ep.path}</span>
                        </td>
                        <td className="text-right text-gray-400 py-2">{ep.p50_ms.toFixed(0)}ms</td>
                        <td className={`text-right py-2 ${ep.p95_ms > 1000 ? 'text-orange-400' : 'text-yellow-400'}`}>
                          {ep.p95_ms.toFixed(0)}ms
                        </td>
                        <td className={`text-right py-2 ${ep.p99_ms > 2000 ? 'text-red-400' : ep.p99_ms > 1000 ? 'text-orange-400' : 'text-yellow-400'}`}>
                          {ep.p99_ms.toFixed(0)}ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Slow Queries */}
          <div className="bg-[#1a1a2e] rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Requêtes SQL Lentes</h2>
            {slowQueries.length === 0 ? (
              <p className="text-gray-400">Aucune requête lente détectée.</p>
            ) : (
              <div className="space-y-3">
                {slowQueries.slice(0, 5).map(query => (
                  <div key={query.id} className="bg-[#0a0a1a] rounded p-3">
                    <p className="text-white text-sm font-mono mb-2 truncate">{query.query}</p>
                    <div className="flex justify-between items-center text-xs text-gray-400">
                      <span>{query.avg_duration_ms.toFixed(0)}ms en moyenne</span>
                      <span>{query.call_count} appels</span>
                    </div>
                    {query.affected_endpoints.length > 0 && (
                      <p className="text-gray-500 text-xs mt-2">
                        Endpoints: {query.affected_endpoints.slice(0, 2).join(', ')}
                        {query.affected_endpoints.length > 2 ? '...' : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Profiler */}
        <div className="bg-[#1a1a2e] rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Profiler</h2>
            <div className="flex gap-3">
              <button
                onClick={startProfiler}
                disabled={profilerRunning}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-bold px-4 py-2 rounded text-sm"
              >
                {profilerRunning ? 'Profilage...' : 'Démarrer'}
              </button>
              <button
                onClick={stopProfiler}
                disabled={!profilerRunning}
                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-bold px-4 py-2 rounded text-sm"
              >
                Arrêter
              </button>
              {profilerResults && (
                <button
                  onClick={fetchProfilerResults}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-bold px-4 py-2 rounded text-sm"
                >
                  Actualiser Résultats
                </button>
              )}
            </div>
          </div>

          {profilerResults && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-[#0a0a1a] rounded p-4">
                  <p className="text-gray-400 text-sm mb-1">Durée</p>
                  <p className="text-2xl font-bold text-white">{profilerResults.duration_seconds}s</p>
                </div>
                <div className="bg-[#0a0a1a] rounded p-4">
                  <p className="text-gray-400 text-sm mb-1">Appels Totaux</p>
                  <p className="text-2xl font-bold text-white">{profilerResults.total_calls}</p>
                </div>
                <div className="bg-[#0a0a1a] rounded p-4">
                  <p className="text-gray-400 text-sm mb-1">Fonctions Lentes</p>
                  <p className="text-2xl font-bold text-white">{profilerResults.slowest_functions.length}</p>
                </div>
              </div>

              <h3 className="text-lg font-bold text-white mb-3">Fonctions les Plus Lentes</h3>
              <div className="space-y-2">
                {profilerResults.slowest_functions.map((fn, i) => (
                  <div key={i} className="bg-[#0a0a1a] rounded p-3">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-white font-mono text-sm">{fn.name}</p>
                      <span className="text-orange-400 text-sm font-bold">{fn.total_time_ms.toFixed(0)}ms</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div
                        className="bg-orange-600 h-2 rounded-full"
                        style={{ width: `${Math.min((fn.total_time_ms / (profilerResults.slowest_functions[0]?.total_time_ms || 1)) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-gray-500 text-xs mt-2">{fn.calls} appels</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {!profilerResults && !profilerRunning && (
            <p className="text-gray-400">Aucun résultat. Lancez un profilage pour collecter les données.</p>
          )}
        </div>
      </div>
    </div>
  );
}
