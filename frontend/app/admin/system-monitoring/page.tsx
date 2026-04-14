'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '../_components/api';

interface SystemMetrics {
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
  uptime_seconds: number;
}

interface DatabaseMetrics {
  active_connections: number;
  queries_per_sec: number;
  database_size_mb: number;
  last_backup: string;
}

interface CacheMetrics {
  hit_rate: number;
  memory_used_mb: number;
  keys_count: number;
}

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  response_time_ms: number;
  last_check: string;
}

interface AlertRule {
  id: number;
  metric: string;
  threshold: number;
  condition: 'above' | 'below';
  enabled: boolean;
  created_at: string;
}

export default function SystemMonitoringPage() {
  const [loading, setLoading] = useState(true);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [dbMetrics, setDbMetrics] = useState<DatabaseMetrics | null>(null);
  const [cacheMetrics, setCacheMetrics] = useState<CacheMetrics | null>(null);
  const [servicesStatus, setServicesStatus] = useState<ServiceStatus[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [newAlert, setNewAlert] = useState<{
    metric: string;
    threshold: number;
    condition: 'above' | 'below';
  }>({
    metric: 'cpu_percent',
    threshold: 80,
    condition: 'above',
  });

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchMetrics() {
    try {
      const [sys, db, cache, services, alerts] = await Promise.all([
        adminApi.getSystemMetrics(),
        adminApi.getDatabaseMetrics(),
        adminApi.getCacheMetrics(),
        adminApi.getServicesStatus(),
        adminApi.getAlertRules(),
      ]);
      setSystemMetrics(sys);
      setDbMetrics(db);
      setCacheMetrics(cache);
      setServicesStatus(services.services || []);
      setAlertRules(alerts.rules || []);
    } catch (err) {
      console.error('Error fetching metrics:', err);
    } finally {
      setLoading(false);
    }
  }

  async function createAlertRule() {
    try {
      await adminApi.createAlertRule(newAlert);
      setShowAlertModal(false);
      setNewAlert({ metric: 'cpu_percent', threshold: 80, condition: 'above' });
      fetchMetrics();
    } catch (err) {
      alert(`Erreur: ${err}`);
    }
  }

  async function deleteAlertRule(id: number) {
    try {
      await adminApi.deleteAlertRule(id);
      fetchMetrics();
    } catch (err) {
      alert(`Erreur: ${err}`);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Chargement...</div>;
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days}j ${hours}h`;
  };

  return (
    <div className="min-h-screen bg-[#0a0a1a] p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Monitoring Système</h1>

        {/* System Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {systemMetrics && (
            <>
              <div className="bg-[#1a1a2e] rounded-lg p-4">
                <p className="text-gray-400 text-sm mb-2">CPU</p>
                <p className="text-3xl font-bold text-white">{systemMetrics.cpu_percent.toFixed(1)}%</p>
                <div className="w-full bg-gray-800 rounded-full h-2 mt-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      systemMetrics.cpu_percent > 80 ? 'bg-red-600' : 'bg-green-600'
                    }`}
                    style={{ width: `${systemMetrics.cpu_percent}%` }}
                  />
                </div>
              </div>

              <div className="bg-[#1a1a2e] rounded-lg p-4">
                <p className="text-gray-400 text-sm mb-2">Mémoire</p>
                <p className="text-3xl font-bold text-white">{systemMetrics.memory_percent.toFixed(1)}%</p>
                <div className="w-full bg-gray-800 rounded-full h-2 mt-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      systemMetrics.memory_percent > 85 ? 'bg-red-600' : 'bg-green-600'
                    }`}
                    style={{ width: `${systemMetrics.memory_percent}%` }}
                  />
                </div>
              </div>

              <div className="bg-[#1a1a2e] rounded-lg p-4">
                <p className="text-gray-400 text-sm mb-2">Disque</p>
                <p className="text-3xl font-bold text-white">{systemMetrics.disk_percent.toFixed(1)}%</p>
                <div className="w-full bg-gray-800 rounded-full h-2 mt-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      systemMetrics.disk_percent > 90 ? 'bg-red-600' : 'bg-green-600'
                    }`}
                    style={{ width: `${systemMetrics.disk_percent}%` }}
                  />
                </div>
              </div>

              <div className="bg-[#1a1a2e] rounded-lg p-4">
                <p className="text-gray-400 text-sm mb-2">Uptime</p>
                <p className="text-2xl font-bold text-white">{formatUptime(systemMetrics.uptime_seconds)}</p>
                <p className="text-gray-500 text-xs mt-2">{systemMetrics.uptime_seconds} sec</p>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Database Metrics */}
          {dbMetrics && (
            <div className="bg-[#1a1a2e] rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">Base de Données</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Connexions actives</span>
                  <span className="text-white font-bold">{dbMetrics.active_connections}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Requêtes/sec</span>
                  <span className="text-white font-bold">{dbMetrics.queries_per_sec.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Taille DB</span>
                  <span className="text-white font-bold">{dbMetrics.database_size_mb.toFixed(1)} MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Dernier backup</span>
                  <span className="text-white font-bold">{new Date(dbMetrics.last_backup).toLocaleString('fr-FR')}</span>
                </div>
              </div>
            </div>
          )}

          {/* Cache Metrics */}
          {cacheMetrics && (
            <div className="bg-[#1a1a2e] rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">Cache</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Hit Rate</span>
                  <span className="text-white font-bold">{(cacheMetrics.hit_rate * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full"
                    style={{ width: `${cacheMetrics.hit_rate * 100}%` }}
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Mémoire utilisée</span>
                  <span className="text-white font-bold">{cacheMetrics.memory_used_mb.toFixed(1)} MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Clés en cache</span>
                  <span className="text-white font-bold">{cacheMetrics.keys_count}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Services Status */}
        <div className="bg-[#1a1a2e] rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">Statut des Services</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {servicesStatus.map(service => (
              <div key={service.name} className="bg-[#0a0a1a] rounded p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-white font-medium">{service.name}</p>
                  <div className={`w-3 h-3 rounded-full ${
                    service.status === 'healthy' ? 'bg-green-500' :
                    service.status === 'degraded' ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`} />
                </div>
                <p className="text-gray-500 text-sm">{service.response_time_ms}ms</p>
                <p className="text-gray-600 text-xs mt-2">{new Date(service.last_check).toLocaleTimeString('fr-FR')}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Alert Rules */}
        <div className="bg-[#1a1a2e] rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">Règles d'Alerte</h2>
            <button
              onClick={() => setShowAlertModal(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded text-sm"
            >
              + Nouvelle Règle
            </button>
          </div>

          {alertRules.length === 0 ? (
            <p className="text-gray-400">Aucune règle d'alerte configurée.</p>
          ) : (
            <div className="space-y-3">
              {alertRules.map(rule => (
                <div key={rule.id} className="bg-[#0a0a1a] rounded p-4 flex justify-between items-start">
                  <div>
                    <p className="text-white font-medium">{rule.metric}</p>
                    <p className="text-gray-400 text-sm">
                      {rule.condition === 'above' ? 'Au-dessus' : 'Au-dessous'} de {rule.threshold}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      rule.enabled ? 'bg-green-900 text-green-200' : 'bg-gray-900 text-gray-200'
                    }`}>
                      {rule.enabled ? 'Activée' : 'Désactivée'}
                    </span>
                    <button
                      onClick={() => deleteAlertRule(rule.id)}
                      className="text-red-400 hover:text-red-500 text-sm"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alert Modal */}
        {showAlertModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-[#1a1a2e] rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-bold text-white mb-4">Nouvelle Règle d'Alerte</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Métrique</label>
                  <select
                    value={newAlert.metric}
                    onChange={e => setNewAlert({ ...newAlert, metric: e.target.value })}
                    className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                  >
                    <option value="cpu_percent">CPU %</option>
                    <option value="memory_percent">Mémoire %</option>
                    <option value="disk_percent">Disque %</option>
                    <option value="db_connections">Connexions DB</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-400 text-sm mb-2">Condition</label>
                  <select
                    value={newAlert.condition}
                    onChange={e => setNewAlert({ ...newAlert, condition: e.target.value as 'above' | 'below' })}
                    className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                  >
                    <option value="above">Au-dessus</option>
                    <option value="below">Au-dessous</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-400 text-sm mb-2">Seuil</label>
                  <input
                    type="number"
                    value={newAlert.threshold}
                    onChange={e => setNewAlert({ ...newAlert, threshold: parseFloat(e.target.value) })}
                    className="w-full bg-[#0a0a1a] text-white border border-purple-600 rounded px-3 py-2"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowAlertModal(false)}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={createAlertRule}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded"
                  >
                    Créer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
