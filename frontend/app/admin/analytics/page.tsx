"use client";

import { useEffect, useState } from "react";
import {
  Users, TrendingUp, BarChart3, Zap, DollarSign, DownloadCloud,
} from "lucide-react";
import { Card, PageWrapper, LoadingScreen, PageGuide } from "../_components/shared";
import { api } from "../_components/api";

interface OverviewStats {
  total_users: number;
  new_users_7d: number;
  new_users_30d: number;
  total_tracks: number;
  tracks_analyzed: number;
  tracks_uploaded_7d: number;
  active_users_7d: number;
  revenue_metrics: {
    total_pro_users: number;
    total_unlimited_users: number;
    mrr_estimate: number;
  };
  top_genres: Array<{ genre: string; count: number }>;
  signup_trend: Array<{ date: string; count: number }>;
  storage_estimate_gb: number;
}

interface ActivityItem {
  date: string;
  active_users: number;
  new_signups: number;
  tracks_uploaded: number;
}

interface ActivityResponse {
  data: ActivityItem[];
}

function KpiCard({
  icon: Icon,
  label,
  value,
  trend,
  trendLabel,
}: {
  icon: any;
  label: string;
  value: string | number;
  trend?: number;
  trendLabel?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-text-muted mb-1">{label}</p>
          <p className="text-2xl font-bold text-text-primary">{value}</p>
          {trend !== undefined && (
            <p className={`text-xs mt-1 ${trend >= 0 ? "text-green-500" : "text-red-500"}`}>
              {trend >= 0 ? "+" : ""}{trend}% {trendLabel}
            </p>
          )}
        </div>
        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
          <Icon size={20} className="text-accent" />
        </div>
      </div>
    </Card>
  );
}

function SimpleLineChart({
  data,
  label,
  valueKey,
}: {
  data: ActivityItem[];
  label: string;
  valueKey: "active_users" | "new_signups" | "tracks_uploaded";
}) {
  if (!data || data.length === 0) return <div className="text-text-muted text-sm">Pas de données</div>;

  const values = data.map((d) => d[valueKey]);
  const maxValue = Math.max(...values, 1);
  const width = 100 / Math.max(data.length, 1);

  return (
    <div>
      <p className="text-sm font-semibold text-text-primary mb-4">{label}</p>
      <div className="flex items-end justify-between gap-1 h-40">
        {data.map((item, i) => {
          const height = (item[valueKey] / maxValue) * 100;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center"
              style={{ width: `${width}%` }}
            >
              <div
                className="w-full bg-accent/80 rounded-t transition-all hover:bg-accent"
                style={{ height: `${height}%`, minHeight: "2px" }}
                title={`${item.date}: ${item[valueKey]}`}
              />
              <p className="text-[10px] text-text-muted mt-2">{item.date.slice(5)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HorizontalBarsChart({
  data,
  maxValue,
}: {
  data: Array<{ genre: string; count: number }>;
  maxValue: number;
}) {
  return (
    <div className="space-y-2">
      {data.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <p className="text-xs font-medium text-text-primary w-20 truncate">{item.genre}</p>
          <div className="flex-1 bg-border-subtle rounded-full overflow-hidden h-6">
            <div
              className="h-full bg-gradient-to-r from-accent to-accent/80"
              style={{ width: `${(item.count / maxValue) * 100}%` }}
            />
          </div>
          <p className="text-xs font-semibold text-text-primary w-10 text-right">{item.count}</p>
        </div>
      ))}
    </div>
  );
}

export default function AdminAnalytics() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const [overviewRes, activityRes] = await Promise.all([
          api<OverviewStats>("/admin/stats/overview"),
          api<ActivityResponse>("/admin/stats/users-activity"),
        ]);

        setOverview(overviewRes);
        setActivity(activityRes.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors du chargement");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) return <LoadingScreen />;

  if (error) {
    return (
      <PageWrapper>
        <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500">
          {error}
        </div>
      </PageWrapper>
    );
  }

  if (!overview) return null;

  const mrrLast = overview.revenue_metrics.mrr_estimate;
  const mrrTarget = 10000; // Objectif exemple
  const mrrProgress = (mrrLast / mrrTarget) * 100;

  return (
    <PageWrapper>
      <PageGuide
        id="analytics"
        icon={BarChart3}
        title="Analytiques & Métriques"
        description="Suivez la croissance de votre plateforme : inscriptions, utilisateurs actifs, revenus et stockage. Les données sont calculées en temps réel depuis la base de données."
      />
      <div className="space-y-6">
        {/* ── Header ── */}
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Analytics</h1>
          <p className="text-sm text-text-muted mt-1">Dashboard d'administration — Métriques clés</p>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard
            icon={Users}
            label="Total Utilisateurs"
            value={overview.total_users.toLocaleString()}
            trend={Math.round((overview.new_users_7d / Math.max(overview.total_users - overview.new_users_7d, 1)) * 100)}
            trendLabel="cette semaine"
          />
          <KpiCard
            icon={Users}
            label="Inscrits (7j)"
            value={overview.new_users_7d}
            trend={Math.round((overview.new_users_7d / Math.max(overview.total_users - overview.new_users_7d, 1)) * 100) || 0}
            trendLabel="vs. avant"
          />
          <KpiCard
            icon={TrendingUp}
            label="Actifs (7j)"
            value={overview.active_users_7d}
            trendLabel="utilisateurs"
          />
          <KpiCard
            icon={BarChart3}
            label="Total Tracks"
            value={overview.total_tracks.toLocaleString()}
            trendLabel="analysés"
          />
          <KpiCard
            icon={DollarSign}
            label="MRR Estimé"
            value={`$${mrrLast.toFixed(0)}`}
            trendLabel={`/ $${mrrTarget.toFixed(0)}`}
          />
        </div>

        {/* ── Charts Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Activity Chart */}
          <Card className="p-6">
            <SimpleLineChart
              data={activity}
              label="Inscriptions (30j)"
              valueKey="new_signups"
            />
          </Card>

          {/* Active Users Chart */}
          <Card className="p-6">
            <SimpleLineChart
              data={activity}
              label="Utilisateurs Actifs (30j)"
              valueKey="active_users"
            />
          </Card>

          {/* Top Genres */}
          <Card className="p-6">
            <p className="text-sm font-semibold text-text-primary mb-4">Top 10 Genres</p>
            <HorizontalBarsChart
              data={overview.top_genres}
              maxValue={Math.max(...overview.top_genres.map((g) => g.count), 1)}
            />
          </Card>

          {/* Plan Breakdown */}
          <Card className="p-6">
            <p className="text-sm font-semibold text-text-primary mb-4">Breakdown Plans</p>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <p className="text-xs text-text-muted">Free</p>
                  <p className="text-xs font-semibold text-text-primary">
                    {overview.total_users - overview.revenue_metrics.total_pro_users - overview.revenue_metrics.total_unlimited_users}
                  </p>
                </div>
                <div className="h-2 bg-border-subtle rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-400"
                    style={{
                      width: `${((overview.total_users - overview.revenue_metrics.total_pro_users - overview.revenue_metrics.total_unlimited_users) / overview.total_users) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <p className="text-xs text-text-muted">Pro</p>
                  <p className="text-xs font-semibold text-text-primary">{overview.revenue_metrics.total_pro_users}</p>
                </div>
                <div className="h-2 bg-border-subtle rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{
                      width: `${(overview.revenue_metrics.total_pro_users / overview.total_users) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <p className="text-xs text-text-muted">Unlimited</p>
                  <p className="text-xs font-semibold text-text-primary">{overview.revenue_metrics.total_unlimited_users}</p>
                </div>
                <div className="h-2 bg-border-subtle rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500"
                    style={{
                      width: `${(overview.revenue_metrics.total_unlimited_users / overview.total_users) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* MRR Progress */}
          <Card className="p-6">
            <p className="text-sm font-semibold text-text-primary mb-4">Progression MRR</p>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between mb-2">
                  <p className="text-xs text-text-muted">Objectif</p>
                  <p className="text-sm font-bold text-text-primary">${mrrLast.toFixed(0)} / ${mrrTarget.toFixed(0)}</p>
                </div>
                <div className="h-3 bg-border-subtle rounded-full overflow-hidden">
                  <div
                    className={`h-full ${mrrProgress >= 100 ? "bg-green-500" : "bg-accent"}`}
                    style={{ width: `${Math.min(mrrProgress, 100)}%` }}
                  />
                </div>
              </div>
              <p className="text-xs text-text-muted">
                {mrrProgress.toFixed(0)}% de l'objectif
              </p>
            </div>
          </Card>

          {/* Storage Estimate */}
          <Card className="p-6">
            <p className="text-sm font-semibold text-text-primary mb-4">Stockage</p>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <DownloadCloud size={24} className="text-accent" />
                <div>
                  <p className="text-lg font-bold text-text-primary">{overview.storage_estimate_gb.toFixed(1)} GB</p>
                  <p className="text-xs text-text-muted">Estimé (100MB/track)</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <p className="text-xs text-text-muted">Tracks</p>
                  <p className="text-xs font-semibold">{overview.total_tracks}</p>
                </div>
                <div className="flex justify-between">
                  <p className="text-xs text-text-muted">Analysés</p>
                  <p className="text-xs font-semibold">{overview.tracks_analyzed}</p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Last Updated ── */}
        <p className="text-xs text-text-muted text-center">
          Dernière mise à jour : {new Date().toLocaleString("fr-FR")}
        </p>
      </div>
    </PageWrapper>
  );
}
