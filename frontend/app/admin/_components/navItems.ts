/**
 * Structure de navigation admin — source unique de vérité.
 * Importé par le layout (sidebar) et la page admin-preferences (toggles modules).
 */
import {
  LayoutDashboard, FileText, Settings, Image, Users, Zap,
  Navigation, LayoutGrid, Shield, Bell,
  Palette, Database, Search, BarChart3,
  Lock, Music, ListMusic, Disc3, CreditCard, Building2, HeartPulse,
  Crosshair, Tag, Boxes, BookOpen, Heart, History, FlaskConical,
  MessageCircle, ScrollText, Key, Webhook, ExternalLink, UserPlus,
  Mail, Target, DollarSign, Receipt, TrendingUp, ShieldCheck, HardDrive,
  Import, Rocket, Layers, PaintBucket, Bot, Trophy,
  UsersRound, ClipboardList, Megaphone, Activity,
  Globe, Smartphone, Accessibility, Monitor, ToggleLeft,
  UserMinus, Trash2, Plug, SearchCheck, Scale,
  FlaskRound, MousePointerClick, Video, GitBranch,
  ShieldAlert, Languages, FolderOpen, Timer, Inbox, LayoutTemplate,
  BellRing, MessageSquare, FileBarChart, Eye, Gauge,
  Radio, Filter, Grid3X3, Footprints, FileSpreadsheet, UserCog,
  Package, Upload, SearchCode, Cpu, Bug, Zap as ZapIcon,
  BellDot, Wallet, Clock, Server, TestTube, Cog,
  ArrowUpDown, RefreshCw,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: any;
  href: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Général",
    items: [
      { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, href: "/admin/dashboard" },
      { id: "analytics", label: "Analytics", icon: BarChart3, href: "/admin/analytics" },
    ],
  },
  {
    label: "Contenu",
    items: [
      { id: "pages", label: "Pages CMS", icon: FileText, href: "/admin/pages" },
      { id: "navigation", label: "Navigation", icon: Navigation, href: "/admin/navigation" },
      { id: "media", label: "Médias", icon: Image, href: "/admin/media" },
      { id: "blog", label: "Blog", icon: BookOpen, href: "/admin/blog" },
    ],
  },
  {
    label: "Application",
    items: [
      { id: "tracks", label: "Pistes Musicales", icon: Music, href: "/admin/tracks" },
      { id: "playlists", label: "Listes de Lecture", icon: ListMusic, href: "/admin/playlists" },
      { id: "djsets", label: "DJ Sets", icon: Disc3, href: "/admin/djsets" },
      { id: "cuepoints", label: "Points de Repère", icon: Crosshair, href: "/admin/cuepoints" },
      { id: "tags", label: "Tags", icon: Tag, href: "/admin/tags" },
      { id: "smartcrates", label: "Smart Crates", icon: Boxes, href: "/admin/smart-crates" },
      { id: "modules", label: "Modules Dashboard", icon: LayoutGrid, href: "/admin/modules" },
      { id: "features", label: "Features & Plans", icon: Zap, href: "/admin/features" },
      { id: "locks", label: "Verrouillage Code", icon: Lock, href: "/admin/locks" },
    ],
  },
  {
    label: "Données",
    items: [
      { id: "subscriptions", label: "Abonnements", icon: CreditCard, href: "/admin/subscriptions" },
      { id: "organizations", label: "Organisations", icon: Building2, href: "/admin/organizations" },
      { id: "favorites", label: "Favoris", icon: Heart, href: "/admin/favorites" },
      { id: "playhistory", label: "Historique", icon: History, href: "/admin/play-history" },
      { id: "analyses", label: "Analyses", icon: FlaskConical, href: "/admin/analyses" },
      { id: "database", label: "Navigateur DB", icon: Database, href: "/admin/database" },
    ],
  },
  {
    label: "Email & Marketing",
    items: [
      { id: "email-templates", label: "Templates Email", icon: Mail, href: "/admin/email-templates" },
      { id: "drip-campaigns", label: "Campagnes Drip", icon: Target, href: "/admin/drip-campaigns" },
    ],
  },
  {
    label: "Revenue & Stripe",
    items: [
      { id: "pricing", label: "Plans & Coupons", icon: DollarSign, href: "/admin/pricing" },
      { id: "invoices", label: "Factures", icon: Receipt, href: "/admin/invoices" },
      { id: "revenue", label: "Dashboard Revenue", icon: TrendingUp, href: "/admin/revenue" },
    ],
  },
  {
    label: "Communication",
    items: [
      { id: "feedbacks", label: "Retours", icon: MessageCircle, href: "/admin/feedbacks" },
      { id: "notifications", label: "Notifications", icon: Bell, href: "/admin/notifications-admin" },
    ],
  },
  {
    label: "Sécurité & Config",
    items: [
      { id: "security", label: "Sécurité", icon: ShieldCheck, href: "/admin/security" },
      { id: "backups", label: "Sauvegardes", icon: HardDrive, href: "/admin/backups" },
      { id: "import-dj", label: "Import DJ", icon: Import, href: "/admin/import-dj" },
      { id: "onboarding", label: "Onboarding", icon: Rocket, href: "/admin/onboarding" },
    ],
  },
  {
    label: "CMS & Design",
    items: [
      { id: "cms-templates", label: "CMS Avancé", icon: Layers, href: "/admin/cms-templates" },
      { id: "theme-editor", label: "Éditeur Thème", icon: PaintBucket, href: "/admin/theme-editor" },
    ],
  },
  {
    label: "Automatisation",
    items: [
      { id: "automation", label: "Règles Auto", icon: Bot, href: "/admin/automation" },
      { id: "gamification", label: "Gamification", icon: Trophy, href: "/admin/gamification" },
    ],
  },
  {
    label: "Segments & Formulaires",
    items: [
      { id: "segments", label: "Segments", icon: UsersRound, href: "/admin/segments" },
      { id: "forms", label: "Formulaires", icon: ClipboardList, href: "/admin/forms" },
      { id: "changelog", label: "Changelog", icon: Megaphone, href: "/admin/changelog" },
      { id: "status-page", label: "Page de Statut", icon: Activity, href: "/admin/status-page" },
    ],
  },
  {
    label: "Configuration Avancée",
    items: [
      { id: "white-label", label: "White Label", icon: Globe, href: "/admin/white-label" },
      { id: "pwa-config", label: "PWA", icon: Smartphone, href: "/admin/pwa-config" },
      { id: "accessibility-config", label: "Accessibilité", icon: Accessibility, href: "/admin/accessibility-config" },
      { id: "desktop-config", label: "App Desktop", icon: Monitor, href: "/admin/desktop-config" },
      { id: "feature-flags", label: "Feature Flags", icon: ToggleLeft, href: "/admin/feature-flags" },
      { id: "integrations", label: "Intégrations", icon: Plug, href: "/admin/integrations" },
    ],
  },
  {
    label: "Rétention & Données",
    items: [
      { id: "churn", label: "Prévention Churn", icon: UserMinus, href: "/admin/churn" },
      { id: "data-cleanup", label: "Nettoyage Données", icon: Trash2, href: "/admin/data-cleanup" },
      { id: "seo-config", label: "SEO Global", icon: SearchCheck, href: "/admin/seo-config" },
      { id: "legal-config", label: "Conformité Légale", icon: Scale, href: "/admin/legal-config" },
    ],
  },
  {
    label: "A/B Testing & Analytics",
    items: [
      { id: "ab-testing", label: "A/B Tests", icon: FlaskRound, href: "/admin/ab-testing" },
      { id: "heatmaps", label: "Heatmaps", icon: MousePointerClick, href: "/admin/heatmaps" },
      { id: "session-recordings", label: "Session Replay", icon: Video, href: "/admin/session-recordings" },
      { id: "email-workflows", label: "Workflows Email", icon: GitBranch, href: "/admin/email-workflows" },
    ],
  },
  {
    label: "Permissions & i18n",
    items: [
      { id: "roles", label: "Rôles & Permissions", icon: ShieldAlert, href: "/admin/roles" },
      { id: "audit-logs", label: "Audit Trail", icon: Eye, href: "/admin/audit-logs" },
      { id: "translations", label: "Traductions", icon: Languages, href: "/admin/translations" },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { id: "file-manager", label: "Fichiers & CDN", icon: FolderOpen, href: "/admin/file-manager" },
      { id: "cron-jobs", label: "Cron Jobs", icon: Timer, href: "/admin/cron-jobs" },
      { id: "queues", label: "Files d'attente", icon: Inbox, href: "/admin/queues" },
      { id: "dashboard-widgets", label: "Widgets Dashboard", icon: LayoutTemplate, href: "/admin/dashboard-widgets" },
      { id: "api-usage", label: "Utilisation API", icon: Gauge, href: "/admin/api-usage" },
    ],
  },
  {
    label: "Notifications & Rapports",
    items: [
      { id: "push-notifications", label: "Push & SMS", icon: BellRing, href: "/admin/push-notifications" },
      { id: "sms-templates", label: "Templates SMS", icon: MessageSquare, href: "/admin/sms-templates" },
      { id: "scheduled-reports", label: "Rapports planifiés", icon: FileBarChart, href: "/admin/scheduled-reports" },
      { id: "in-app-notifications", label: "Notif In-App", icon: BellDot, href: "/admin/in-app-notifications" },
    ],
  },
  {
    label: "Analytics Avancés",
    items: [
      { id: "realtime", label: "Temps Réel", icon: Radio, href: "/admin/realtime" },
      { id: "funnels", label: "Entonnoirs", icon: Filter, href: "/admin/funnels" },
      { id: "cohorts", label: "Cohortes", icon: Grid3X3, href: "/admin/cohorts" },
      { id: "event-tracking", label: "Suivi Événements", icon: Footprints, href: "/admin/event-tracking" },
      { id: "user-journeys", label: "Parcours Utilisateur", icon: ArrowUpDown, href: "/admin/user-journeys" },
      { id: "custom-reports", label: "Rapports Custom", icon: FileSpreadsheet, href: "/admin/custom-reports" },
    ],
  },
  {
    label: "Opérations en Masse",
    items: [
      { id: "bulk-operations", label: "Actions en Masse", icon: Package, href: "/admin/bulk-operations" },
      { id: "import-export", label: "Import / Export", icon: Upload, href: "/admin/import-export" },
      { id: "global-search", label: "Recherche Globale", icon: SearchCode, href: "/admin/global-search" },
    ],
  },
  {
    label: "Monitoring Système",
    items: [
      { id: "system-monitoring", label: "Métriques Serveur", icon: Cpu, href: "/admin/system-monitoring" },
      { id: "error-tracking", label: "Suivi Erreurs", icon: Bug, href: "/admin/error-tracking" },
      { id: "performance", label: "Performance", icon: ZapIcon, href: "/admin/performance" },
    ],
  },
  {
    label: "Abonnements Avancés",
    items: [
      { id: "subscriptions-advanced", label: "Vue d'ensemble Abo", icon: Wallet, href: "/admin/subscriptions-advanced" },
      { id: "subscription-actions", label: "Actions Abonnement", icon: RefreshCw, href: "/admin/subscription-actions" },
      { id: "user-timeline", label: "Timeline Utilisateur", icon: Clock, href: "/admin/user-timeline" },
      { id: "impersonation", label: "Impersonation", icon: UserCog, href: "/admin/impersonation" },
    ],
  },
  {
    label: "DevOps & Config",
    items: [
      { id: "environments", label: "Environnements", icon: Server, href: "/admin/environments" },
      { id: "webhook-testing", label: "Test Webhooks", icon: TestTube, href: "/admin/webhook-testing" },
      { id: "admin-preferences", label: "Préférences Admin", icon: Cog, href: "/admin/admin-preferences" },
    ],
  },
  {
    label: "Système",
    items: [
      { id: "health", label: "Santé", icon: HeartPulse, href: "/admin/health" },
      { id: "logs", label: "Logs", icon: ScrollText, href: "/admin/logs" },
      { id: "apikeys", label: "Clés API", icon: Key, href: "/admin/apikeys" },
      { id: "webhooks", label: "Webhooks", icon: Webhook, href: "/admin/webhooks" },
      { id: "sharedlinks", label: "Liens Partagés", icon: ExternalLink, href: "/admin/shared-links" },
      { id: "referrals", label: "Parrainage", icon: UserPlus, href: "/admin/referrals" },
    ],
  },
  {
    label: "Administration",
    items: [
      { id: "users", label: "Utilisateurs", icon: Users, href: "/admin/users" },
      { id: "settings", label: "Réglages Site", icon: Settings, href: "/admin/settings" },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/** Modules essentiels — jamais masqués même si désactivés */
export const ESSENTIAL_MODULE_IDS = new Set([
  "dashboard", "settings", "users", "admin-preferences", "health",
]);
