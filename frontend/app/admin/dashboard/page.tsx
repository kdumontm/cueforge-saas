"use client";

import { useEffect, useState } from "react";
import {
  Users,
  CheckCircle2,
  Shield,
  Building2,
  FileText,
  Image,
  BarChart3,
  Settings,
  Users2,
  Database,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

import { StatCard, Card, Badge, PageWrapper, SectionHeader, LoadingScreen } from "../_components/shared";
import { adminApi } from "../_components/api";

interface DashboardStats {
  users: {
    total: number;
    verified: number;
    admins: number;
    by_plan: Record<string, number>;
  };
  organizations: number;
  pages: {
    total: number;
    published: number;
  };
  media: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await adminApi.dashboard();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors du chargement du tableau de bord");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) return <LoadingScreen />;

  if (error || !stats) {
    return (
      <PageWrapper>
        <div className="text-center py-16">
          <h2 className="text-lg font-semibold text-text-primary mb-2">Erreur</h2>
          <p className="text-text-muted">{error || "Impossible de charger les données"}</p>
        </div>
      </PageWrapper>
    );
  }

  const plans = stats.users.by_plan || {};
  const totalPlans = (plans.free || 0) + (plans.pro || 0) + (plans.unlimited || 0);
  const verifyPct = stats.users.total > 0 ? Math.round((stats.users.verified / stats.users.total) * 100) : 0;

  return (
    <PageWrapper>
      {/* Header */}
      <SectionHeader
        title="Tableau de bord administrateur"
        description="Vue d'ensemble de CueForge et gestion centralisée"
      />

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard
          icon={Users}
          label="Utilisateurs totaux"
          value={stats.users.total}
          color="#3b82f6"
        />
        <StatCard
          icon={CheckCircle2}
          label="Utilisateurs vérifiés"
          value={stats.users.verified}
          color="#10b981"
          sub={`${verifyPct}% de vérification`}
        />
        <StatCard
          icon={Shield}
          label="Administrateurs"
          value={stats.users.admins}
          color="#f59e0b"
        />
        <StatCard
          icon={Building2}
          label="Organisations"
          value={stats.organizations}
          color="#8b5cf6"
        />
        <StatCard
          icon={FileText}
          label="Pages publiées"
          value={stats.pages.published}
          color="#06b6d4"
          sub={`sur ${stats.pages.total} pages`}
        />
        <StatCard
          icon={Image}
          label="Médias"
          value={stats.media}
          color="#ec4899"
        />
      </div>

      {/* Plans Distribution */}
      <div className="mb-8">
        <SectionHeader
          title="Distribution des forfaits"
          description={`Total: ${totalPlans} utilisateurs avec plan`}
        />

        <Card className="p-6">
          <div className="space-y-4">
            {/* Free Plan */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-text-primary">Plan Gratuit</span>
                <Badge variant="info">{plans.free || 0} utilisateurs</Badge>
              </div>
              <div className="w-full bg-bg-secondary rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full"
                  style={{
                    width: totalPlans > 0 ? `${((plans.free || 0) / totalPlans) * 100}%` : "0%",
                  }}
                />
              </div>
              <p className="text-xs text-text-muted mt-1">
                {totalPlans > 0 ? `${Math.round(((plans.free || 0) / totalPlans) * 100)}%` : "0%"} du total
              </p>
            </div>

            {/* Pro Plan */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-text-primary">Plan Pro</span>
                <Badge variant="purple">{plans.pro || 0} utilisateurs</Badge>
              </div>
              <div className="w-full bg-bg-secondary rounded-full h-2 overflow-hidden">
                <div
                  className="bg-purple-500 h-full rounded-full"
                  style={{
                    width: totalPlans > 0 ? `${((plans.pro || 0) / totalPlans) * 100}%` : "0%",
                  }}
                />
              </div>
              <p className="text-xs text-text-muted mt-1">
                {totalPlans > 0 ? `${Math.round(((plans.pro || 0) / totalPlans) * 100)}%` : "0%"} du total
              </p>
            </div>

            {/* Unlimited Plan */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-text-primary">Plan Illimité</span>
                <Badge variant="success">{plans.unlimited || 0} utilisateurs</Badge>
              </div>
              <div className="w-full bg-bg-secondary rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full"
                  style={{
                    width: totalPlans > 0 ? `${((plans.unlimited || 0) / totalPlans) * 100}%` : "0%",
                  }}
                />
              </div>
              <p className="text-xs text-text-muted mt-1">
                {totalPlans > 0 ? `${Math.round(((plans.unlimited || 0) / totalPlans) * 100)}%` : "0%"} du total
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <SectionHeader
          title="Actions rapides"
          description="Accès direct aux sections principales"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Users Management */}
          <Link href="/admin/users">
            <Card className="p-5 hover:border-border-default transition-all cursor-pointer h-full">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <Users2 size={20} className="text-blue-400" />
                </div>
                <ArrowRight size={16} className="text-text-muted" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">Utilisateurs</h3>
              <p className="text-xs text-text-muted">Gérer et modérer les utilisateurs</p>
            </Card>
          </Link>

          {/* Pages Management */}
          <Link href="/admin/pages">
            <Card className="p-5 hover:border-border-default transition-all cursor-pointer h-full">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                  <FileText size={20} className="text-cyan-400" />
                </div>
                <ArrowRight size={16} className="text-text-muted" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">Pages</h3>
              <p className="text-xs text-text-muted">Créer et publier du contenu</p>
            </Card>
          </Link>

          {/* Media Library */}
          <Link href="/admin/media">
            <Card className="p-5 hover:border-border-default transition-all cursor-pointer h-full">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-pink-500/15 flex items-center justify-center">
                  <Image size={20} className="text-pink-400" />
                </div>
                <ArrowRight size={16} className="text-text-muted" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">Médias</h3>
              <p className="text-xs text-text-muted">Gérer la bibliothèque média</p>
            </Card>
          </Link>

          {/* Settings */}
          <Link href="/admin/settings">
            <Card className="p-5 hover:border-border-default transition-all cursor-pointer h-full">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <Settings size={20} className="text-amber-400" />
                </div>
                <ArrowRight size={16} className="text-text-muted" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">Paramètres</h3>
              <p className="text-xs text-text-muted">Configuration de l'application</p>
            </Card>
          </Link>
        </div>
      </div>
    </PageWrapper>
  );
}
