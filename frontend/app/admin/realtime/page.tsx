"use client";

import { useEffect, useState } from "react";
import { Activity, Users, Zap, Database, Globe } from "lucide-react";
import { Card, PageWrapper, LoadingScreen, Btn, StatCard } from "../_components/shared";
import { adminApi } from "../_components/api";

interface RealtimeStats {
  active_users: number;
  requests_per_minute: number;
  cpu_load: number;
  memory_usage: number;
  timestamp: string;
}

interface RealtimeEvent {
  id: string;
  event_type: string;
  user_id: string;
  timestamp: string;
  details: Record<string, any>;
}

interface Connection {
  id: string;
  user_id: string;
  connected_at: string;
  ip: string;
  user_agent: string;
}

interface GeographicData {
  country: string;
  region: string;
  count: number;
}

export default function AdminRealtime() {
  const [stats, setStats] = useState<RealtimeStats | null>(null);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [geographic, setGeographic] = useState<GeographicData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const [statsRes, eventsRes, connectionsRes, geoRes] = await Promise.all([
          adminApi.getRealtimeStats?.() ?? Promise.resolve(null),
          adminApi.getRealtimeEvents?.() ?? Promise.resolve([]),
          adminApi.getRealtimeConnections?.() ?? Promise.resolve([]),
          adminApi.getRealtimeGeographic?.() ?? Promise.resolve([]),
        ]);

        setStats(statsRes);
        setEvents(eventsRes);
        setConnections(connectionsRes);
        setGeographic(geoRes);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();

    if (isLive) {
      const interval = setInterval(loadData, 5000);
      return () => clearInterval(interval);
    }
  }, [isLive]);

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <PageWrapper title="Tableau de bord temps réel" subtitle="Statistiques et événements en direct">
      {error && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 mb-6 text-red-400">
          Erreur: {error}
        </div>
      )}

      {/* Live Status */}
      <div className="mb-6 flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full animate-pulse ${isLive ? "bg-green-500" : "bg-gray-500"}`} />
        <span className="text-sm text-gray-400">
          {isLive ? "En direct" : "Arrêté"}
        </span>
        <Btn variant="ghost" small onClick={() => setIsLive(!isLive)}>
          {isLive ? "Arrêter" : "Redémarrer"}
        </Btn>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={Users}
            label="Utilisateurs actifs"
            value={stats.active_users}
            color="#3b82f6"
          />
          <StatCard
            icon={Zap}
            label="Requêtes/min"
            value={stats.requests_per_minute}
            color="#8b5cf6"
          />
          <StatCard
            icon={Activity}
            label="Charge CPU"
            value={`${stats.cpu_load.toFixed(1)}%`}
            color="#f59e0b"
          />
          <StatCard
            icon={Database}
            label="Mémoire"
            value={`${stats.memory_usage.toFixed(1)}%`}
            color="#ef4444"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Events Feed */}
        <Card className="p-6">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Activity size={18} className="text-purple-600" />
            Événements en direct
          </h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {events.length === 0 ? (
              <div className="text-gray-400 text-sm text-center py-8">Aucun événement</div>
            ) : (
              events.slice(0, 15).map((event) => (
                <div key={event.id} className="bg-[#0a0a1a] rounded-lg p-3 text-xs border border-gray-800">
                  <div className="flex justify-between items-start">
                    <span className="text-purple-400 font-semibold">{event.event_type}</span>
                    <span className="text-gray-500 text-[10px]">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-gray-400 mt-1">User: {event.user_id}</div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Geographic Distribution */}
        <Card className="p-6">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Globe size={18} className="text-purple-600" />
            Distribution géographique
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {geographic.length === 0 ? (
              <div className="text-gray-400 text-sm text-center py-8">Aucune donnée</div>
            ) : (
              geographic.map((geo, idx) => {
                const maxCount = Math.max(...geographic.map((g) => g.count), 1);
                const percent = (geo.count / maxCount) * 100;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>{geo.country} ({geo.region})</span>
                      <span className="text-white font-semibold">{geo.count}</span>
                    </div>
                    <div className="w-full bg-[#0a0a1a] rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-purple-600 to-purple-400 h-full transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Active Connections */}
      <Card className="p-6 mt-6">
        <h3 className="text-white font-semibold mb-4">Connexions actives</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-2 text-gray-400 font-semibold text-xs">ID Connexion</th>
                <th className="text-left py-3 px-2 text-gray-400 font-semibold text-xs">User ID</th>
                <th className="text-left py-3 px-2 text-gray-400 font-semibold text-xs">IP</th>
                <th className="text-left py-3 px-2 text-gray-400 font-semibold text-xs">Connecté</th>
              </tr>
            </thead>
            <tbody>
              {connections.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-400">
                    Aucune connexion active
                  </td>
                </tr>
              ) : (
                connections.slice(0, 10).map((conn) => (
                  <tr key={conn.id} className="border-b border-gray-900 hover:bg-[#0a0a1a] transition">
                    <td className="py-3 px-2 text-gray-300 font-mono text-[11px] truncate">
                      {conn.id}
                    </td>
                    <td className="py-3 px-2 text-gray-300">{conn.user_id}</td>
                    <td className="py-3 px-2 text-gray-300">{conn.ip}</td>
                    <td className="py-3 px-2 text-gray-500 text-xs">
                      {new Date(conn.connected_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {connections.length > 10 && (
            <div className="text-center py-3 text-gray-500 text-xs">
              +{connections.length - 10} autres connexions
            </div>
          )}
        </div>
      </Card>
    </PageWrapper>
  );
}
