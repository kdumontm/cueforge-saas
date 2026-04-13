"use client";
import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, FileText, Settings, Image, Users, Zap,
  Navigation, LayoutGrid, Shield, ChevronLeft, ChevronRight,
  LogOut, Sun, Moon, Menu, X, Bell, ChevronDown,
  Home, Palette, Database, Search, PanelLeftClose, PanelLeft, BarChart3,
  Lock, Music, ListMusic, Disc3, CreditCard, Building2, HeartPulse,
  Crosshair, Tag, Boxes, BookOpen, Heart, History, FlaskConical,
  MessageCircle, ScrollText, Key, Webhook, ExternalLink, UserPlus,
} from "lucide-react";
import { ToastProvider } from "./_components/shared";

/* ── Nav structure with groups ──────────────────────── */
interface NavItem {
  id: string;
  label: string;
  icon: any;
  href: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
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
    label: "Communication",
    items: [
      { id: "feedbacks", label: "Retours", icon: MessageCircle, href: "/admin/feedbacks" },
      { id: "notifications", label: "Notifications", icon: Bell, href: "/admin/notifications-admin" },
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

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/* ── Breadcrumb helper ──────────────────────────────── */
function getBreadcrumbs(pathname: string) {
  const crumbs: { label: string; href?: string }[] = [{ label: "Admin", href: "/admin/dashboard" }];
  const item = ALL_NAV_ITEMS.find((i) => pathname.startsWith(i.href));
  if (item) {
    crumbs.push({ label: item.label, href: item.href });
  }
  // sub-pages
  if (pathname.includes("/editor")) {
    crumbs.push({ label: "Éditeur" });
  }
  return crumbs;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    setIsDark(!root.classList.contains("light"));
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Keyboard shortcut for search (Cmd+K)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 100);
      }
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("light");
      root.classList.remove("dark");
    } else {
      root.classList.remove("light");
      root.classList.add("dark");
    }
    setIsDark(!isDark);
  };

  const activeItem = ALL_NAV_ITEMS.find((item) => pathname.startsWith(item.href));
  const breadcrumbs = getBreadcrumbs(pathname);

  // Filtered search results
  const searchResults = searchQuery.trim()
    ? ALL_NAV_ITEMS.filter((i) =>
        i.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <ToastProvider>
      <div className="flex h-screen bg-bg-primary overflow-hidden">

        {/* ── Search overlay (Cmd+K) ───────────────────── */}
        {searchOpen && (
          <div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[20vh]"
            onClick={() => setSearchOpen(false)}
          >
            <div
              className="bg-bg-card border border-border-subtle rounded-2xl w-full max-w-lg mx-4 overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
                <Search size={18} className="text-text-muted flex-shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher une section…"
                  className="flex-1 bg-transparent text-text-primary text-sm outline-none placeholder:text-text-muted"
                  autoFocus
                />
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-bg-secondary text-text-muted border border-border-subtle">
                  ESC
                </kbd>
              </div>
              <div className="max-h-64 overflow-y-auto p-2">
                {searchQuery.trim() === "" ? (
                  <div className="px-3 py-6 text-center text-sm text-text-muted">
                    Tapez pour rechercher…
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-text-muted">
                    Aucun résultat pour « {searchQuery} »
                  </div>
                ) : (
                  searchResults.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        router.push(item.href);
                        setSearchOpen(false);
                        setSearchQuery("");
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-bg-hover transition-colors"
                    >
                      <item.icon size={16} className="text-text-muted flex-shrink-0" />
                      <span className="text-sm text-text-primary font-medium">{item.label}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Mobile overlay ───────────────────────────── */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* ── Sidebar ──────────────────────────────────── */}
        <aside
          className={`fixed lg:relative z-50 h-full flex flex-col border-r border-border-subtle bg-bg-secondary transition-all duration-200 ease-out
            ${collapsed ? "w-[68px]" : "w-[260px]"}
            ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        >
          {/* Logo bar */}
          <div className={`flex items-center h-14 border-b border-border-subtle ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
            <Link href="/admin/dashboard" className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                <Shield size={16} className="text-accent" />
              </div>
              {!collapsed && (
                <div className="overflow-hidden">
                  <div className="text-sm font-bold text-text-primary truncate">CueForge</div>
                  <div className="text-[10px] text-text-muted font-mono">Admin Panel</div>
                </div>
              )}
            </Link>
            {/* Mobile close */}
            <button
              onClick={() => setMobileOpen(false)}
              className="lg:hidden p-1 rounded-lg hover:bg-bg-hover text-text-muted"
            >
              <X size={18} />
            </button>
          </div>

          {/* Quick search trigger */}
          {!collapsed && (
            <div className="px-3 pt-3 pb-1">
              <button
                onClick={() => {
                  setSearchOpen(true);
                  setTimeout(() => searchRef.current?.focus(), 100);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border-subtle bg-bg-primary/50 text-text-muted hover:border-border-default transition-colors text-left"
              >
                <Search size={14} />
                <span className="text-xs flex-1">Rechercher…</span>
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono bg-bg-secondary text-text-muted border border-border-subtle">
                  ⌘K
                </kbd>
              </button>
            </div>
          )}

          {/* Nav groups */}
          <nav className="flex-1 py-2 px-2 overflow-y-auto space-y-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                {/* Group label */}
                {!collapsed && (
                  <div className="px-3 mb-1.5">
                    <span className="text-[10px] font-bold text-text-muted/60 uppercase tracking-[0.12em]">
                      {group.label}
                    </span>
                  </div>
                )}
                {collapsed && <div className="h-px bg-border-subtle mx-2 mb-1.5" />}

                {/* Group items */}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        className={`flex items-center gap-2.5 rounded-lg transition-all group relative
                          ${collapsed ? "justify-center px-2 py-2.5 mx-1" : "px-3 py-2"}
                          ${isActive
                            ? "bg-accent/12 text-accent"
                            : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
                          }`}
                        title={collapsed ? item.label : undefined}
                      >
                        {/* Active indicator bar */}
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-accent" />
                        )}
                        <item.icon size={17} className="flex-shrink-0" />
                        {!collapsed && (
                          <span className="text-[13px] font-medium truncate">{item.label}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Bottom actions */}
          <div className="border-t border-border-subtle p-2 space-y-0.5">
            <button
              onClick={toggleTheme}
              className={`flex items-center gap-2.5 w-full rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-all
                ${collapsed ? "justify-center px-2 py-2" : "px-3 py-2"}`}
              title={isDark ? "Mode clair" : "Mode sombre"}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
              {!collapsed && <span className="text-xs">{isDark ? "Mode clair" : "Mode sombre"}</span>}
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={`flex items-center gap-2.5 w-full rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-all
                ${collapsed ? "justify-center px-2 py-2" : "px-3 py-2"}`}
              title={collapsed ? "Déplier" : "Replier"}
            >
              {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
              {!collapsed && <span className="text-xs">Replier le menu</span>}
            </button>
            <Link
              href="/dashboard"
              className={`flex items-center gap-2.5 w-full rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-all
                ${collapsed ? "justify-center px-2 py-2" : "px-3 py-2"}`}
            >
              <LogOut size={16} />
              {!collapsed && <span className="text-xs">Retour au site</span>}
            </Link>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Top bar */}
          <header className="h-14 border-b border-border-subtle bg-bg-secondary flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
            {/* Left: hamburger + breadcrumbs */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden p-1.5 rounded-lg hover:bg-bg-hover text-text-muted flex-shrink-0"
              >
                <Menu size={20} />
              </button>

              {/* Breadcrumbs */}
              <nav className="flex items-center gap-1.5 min-w-0">
                {breadcrumbs.map((crumb, i) => (
                  <div key={i} className="flex items-center gap-1.5 min-w-0">
                    {i > 0 && <ChevronRight size={12} className="text-text-muted/40 flex-shrink-0" />}
                    {crumb.href && i < breadcrumbs.length - 1 ? (
                      <Link
                        href={crumb.href}
                        className="text-xs text-text-muted hover:text-text-secondary transition-colors truncate"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-xs font-semibold text-text-primary truncate">
                        {crumb.label}
                      </span>
                    )}
                  </div>
                ))}
              </nav>
            </div>

            {/* Right: search + notif + avatar */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setSearchOpen(true);
                  setTimeout(() => searchRef.current?.focus(), 100);
                }}
                className="p-2 rounded-lg hover:bg-bg-hover text-text-muted transition-colors"
                title="Rechercher (⌘K)"
              >
                <Search size={16} />
              </button>
              <button className="p-2 rounded-lg hover:bg-bg-hover text-text-muted transition-colors relative">
                <Bell size={16} />
              </button>
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center ml-1">
                <span className="text-xs font-bold text-accent">K</span>
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
