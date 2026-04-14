"use client";

import { useEffect, useState } from "react";
import {
  Users, CheckCircle2, Shield, Building2, FileText, Image,
  LayoutGrid, Zap, Navigation, Settings, ArrowRight, ArrowUpRight,
  TrendingUp, Eye, Plus, Clock, BarChart3,
} from "lucide-react";
import Link from "next/link";

import { Card, Badge, PageWrapper, LoadingScreen, PageGuide } from "../_components/shared";
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

/* ── Section card for quick nav ─────────────────────── */
function SectionCard({
  icon: Icon,
  label,
  description,
  href,
  color,
  stat,
  statLabel,
}: {
  icon: any;
  label: string;
  description: string;
  href: string;
  color: string;
  stat?: string | number;
  statLabel?: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="p-5 h-full hover:border-border-default hover:shadow-lg hover:shadow-black/5 transition-all duration-200 cursor-pointer relative overflow-hidden">
        {/* Decorative gradient */}
        <div
          className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-[0.06] -translate-y-8 translate-x-8"
          style={{ background: color }}
        />

        <div className="flex items-start justify-between mb-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: color + "18" }}
          >
            <Icon size={20} style={{ color }} />
          </div>
          <ArrowUpRight
            size={16}
            className="text-text-muted/0 group-hover:text-text-muted transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        </div>

        <h3 className="text-sm font-bold text-text-primary mb-1">{label}</h3>
        <p className="text-xs text-text-muted leading-relaxed mb-3">{description}</p>

        {stat !== undefined && (
          <div className="flex items-center gap-2 pt-3 border-t border-border-subtle">
            <span className="text-lg font-bold text-text-primary font-mono">{stat}</span>
            {statLabel && <span className="text-[11px] text-text-muted">{statLabel}</span>}
          </div>
        )}
      </Card>
    </Link>
  );
}

/* ── Stat mini card ─────────────────────────────────── */
function MiniStat({
  icon: Icon,
  label,
  value,
  color,
  sub,
}: {
  icon: any;
  label: string;
  value: string | number;
  color: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-bg-secondary/50 border border-border-subtle">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: color + "18" }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-base font-bold text-text-primary font-mono leading-tight">{value}</div>
        <div className="text-[11px] text-text-muted truncate">
          {label}
          {sub && <span className="ml-1 text-text-muted/60">· {sub}</span>}
        </div>
      </div>
    </div>
  );
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
        setError(err instanceof Error ? err.message : "Erreur lors du chargement");
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

  const users = stats.users || { total: 0, verified: 0, admins: 0, by_plan: {} };
  const plans = users.by_plan || {};
  const verifyPct = users.total > 0
    ? Math.round((users.verified / users.total) * 100)
    : 0;
  const pages = stats.pages || { total: 0, published: 0 };
  const organizations = stats.organizations || 0;
  const media = stats.media || 0;

  return (
    <PageWrapper>
      <PageGuide
        id="dashboard"
        icon={LayoutGrid}
        title="Tableau de bord administrateur"
        description="Vue d'ensemble de votre application TrackCue. Les statistiques se mettent à jour automatiquement. Cliquez sur les cartes pour accéder directement aux sections correspondantes."
      />
      {/* ── Welcome header ───────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-1">
          Bienvenue, Kevin 👋
        </h1>
        <p className="text-sm text-text-muted">
          Voici un aperçu de votre application TrackCue.
        </p>
      </div>

      {/* ── Stats overview bar ───────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
        <MiniStat icon={Users} label="Utilisateurs" value={users.total} color="#3b82f6" />
        <MiniStat icon={CheckCircle2} label="Vérifiés" value={users.verified} color="#10b981" sub={`${verifyPct}%`} />
        <MiniStat icon={Shield} label="Admins" value={users.admins} color="#f59e0b" />
        <MiniStat icon={Building2} label="Organisations" value={organizations} color="#8b5cf6" />
        <MiniStat icon={FileText} label="Pages publiées" value={`${pages.published}/${pages.total}`} color="#06b6d4" />
        <MiniStat icon={Image} label="Médias" value={media} color="#ec4899" />
      </div>

      {/* ── Section navigation ───────────────────────── */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-text-primary mb-1">Gérer votre application</h2>
        <p className="text-xs text-text-muted mb-5">Cliquez sur une section pour y accéder directement</p>

        {/* Contenu */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-cyan-500" />
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Contenu</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <SectionCard
              icon={FileText}
              label="Pages CMS"
              description="Créer, éditer et publier vos pages de contenu"
              href="/admin/pages"
              color="#06b6d4"
              stat={pages.total}
              statLabel="pages créées"
            />
            <SectionCard
              icon={Navigation}
              label="Navigation"
              description="Configurer les menus et la structure de navigation"
              href="/admin/navigation"
              color="#14b8a6"
            />
            <SectionCard
              icon={Image}
              label="Bibliothèque Médias"
              description="Gérer vos images, fichiers et ressources"
              href="/admin/media"
              color="#ec4899"
              stat={media}
              statLabel="fichiers"
            />
          </div>
        </div>

        {/* Application */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-purple-500" />
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Application</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <SectionCard
              icon={LayoutGrid}
              label="Modules Dashboard"
              description="Configurer le layout du dashboard utilisateur"
              href="/admin/modules"
              color="#8b5cf6"
            />
            <SectionCard
              icon={Zap}
              label="Features & Plans"
              description="Gérer les fonctionnalités et les abonnements"
              href="/admin/features"
              color="#f59e0b"
              stat={`${plans.pro || 0} pro · ${plans.unlimited || 0} illimité`}
              statLabel=""
            />
          </div>
        </div>

        {/* Administration */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-amber-500" />
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Administration</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <SectionCard
              icon={Users}
              label="Utilisateurs"
              description="Gérer les comptes, rôles et permissions"
              href="/admin/users"
              color="#3b82f6"
              stat={users.total}
              statLabel="comptes"
            />
            <SectionCard
              icon={Settings}
              label="Réglages du site"
              description="Logo, couleurs, thème et configuration générale"
              href="/admin/settings"
              color="#f97316"
            />
          </div>
        </div>
      </div>

      {/* ── Plans distribution (compact) ─────────────── */}
      <div className="mt-10">
        <h2 className="text-lg font-bold text-text-primary mb-4">Répartition des plans</h2>
        <Card className="p-5">
          <div className="flex items-center gap-6 flex-wrap">
            {[
              { label: "Gratuit", count: plans.free || 0, color: "#3b82f6" },
              { label: "Pro", count: plans.pro || 0, color: "#8b5cf6" },
              { label: "Illimité", count: plans.unlimited || 0, color: "#10b981" },
            ].map((plan) => {
              const total = (plans.free || 0) + (plans.pro || 0) + (plans.unlimited || 0);
              const pct = total > 0 ? Math.round((plan.count / total) * 100) : 0;
              return (
                <div key={plan.label} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ background: plan.color }} />
                  <div>
                    <span className="text-sm font-semibold text-text-primary">{plan.label}</span>
                    <span className="text-xs text-text-muted ml-2">{plan.count} ({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="mt-4 flex h-2 rounded-full overflow-hidden bg-bg-secondary">
            {(() => {
              const total = (plans.free || 0) + (plans.pro || 0) + (plans.unlimited || 0);
              if (total === 0) return <div className="w-full bg-bg-hover" />;
              return (
                <>
                  <div className="bg-blue-500" style={{ width: `${((plans.free || 0) / total) * 100}%` }} />
                  <div className="bg-purple-500" style={{ width: `${((plans.pro || 0) / total) * 100}%` }} />
                  <div className="bg-emerald-500" style={{ width: `${((plans.unlimited || 0) / total) * 100}%` }} />
                </>
              );
            })()}
          </div>
        </Card>
      </div>
    </PageWrapper>
  );
}
