"use client";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, FileText, Settings, Image, Users, Zap,
  Navigation, LayoutGrid, Shield, ChevronLeft, ChevronRight,
  LogOut, Sun, Moon, Menu, X, Bell,
} from "lucide-react";
import { ToastProvider } from "./_components/shared";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/admin/dashboard" },
  { id: "pages", label: "Pages CMS", icon: FileText, href: "/admin/pages" },
  { id: "navigation", label: "Navigation", icon: Navigation, href: "/admin/navigation" },
  { id: "settings", label: "Réglages Site", icon: Settings, href: "/admin/settings" },
  { id: "media", label: "Médias", icon: Image, href: "/admin/media" },
  { id: "users", label: "Utilisateurs", icon: Users, href: "/admin/users" },
  { id: "features", label: "Features / Plans", icon: Zap, href: "/admin/features" },
  { id: "modules", label: "Modules Dashboard", icon: LayoutGrid, href: "/admin/modules" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    const current = root.classList.contains("light") ? false : true;
    setIsDark(current);
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

  const activeItem = NAV_ITEMS.find((item) => pathname.startsWith(item.href));

  return (
    <ToastProvider>
      <div className="flex h-screen bg-bg-primary overflow-hidden">
        {/* Mobile overlay */}
        {mobileOpen && (
          <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed lg:relative z-50 h-full flex flex-col border-r border-border-subtle bg-bg-secondary transition-all duration-200
            ${collapsed ? "w-[68px]" : "w-[240px]"}
            ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        >
          {/* Logo */}
          <div className={`flex items-center h-14 border-b border-border-subtle px-4 ${collapsed ? "justify-center" : "gap-3"}`}>
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
              <Shield size={16} className="text-accent" />
            </div>
            {!collapsed && (
              <div className="overflow-hidden">
                <div className="text-sm font-bold text-text-primary truncate">CueForge</div>
                <div className="text-[10px] text-text-muted font-mono">Admin Panel</div>
              </div>
            )}
          </div>

          {/* Nav items */}
          <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-lg transition-all group
                    ${collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"}
                    ${isActive
                      ? "bg-accent/15 text-accent border border-accent/20"
                      : "text-text-muted hover:text-text-secondary hover:bg-bg-hover border border-transparent"
                    }`}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon size={18} className="flex-shrink-0" />
                  {!collapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          {/* Bottom actions */}
          <div className="border-t border-border-subtle p-2 space-y-1">
            <button
              onClick={toggleTheme}
              className={`flex items-center gap-3 w-full rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-all
                ${collapsed ? "justify-center px-2 py-2" : "px-3 py-2"}`}
              title={isDark ? "Mode clair" : "Mode sombre"}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
              {!collapsed && <span className="text-xs">{isDark ? "Mode clair" : "Mode sombre"}</span>}
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={`flex items-center gap-3 w-full rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-all
                ${collapsed ? "justify-center px-2 py-2" : "px-3 py-2"}`}
              title={collapsed ? "Déplier" : "Replier"}
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              {!collapsed && <span className="text-xs">Replier le menu</span>}
            </button>
            <Link
              href="/dashboard"
              className={`flex items-center gap-3 w-full rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-all
                ${collapsed ? "justify-center px-2 py-2" : "px-3 py-2"}`}
            >
              <LogOut size={16} />
              {!collapsed && <span className="text-xs">Retour au site</span>}
            </Link>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar */}
          <header className="h-14 border-b border-border-subtle bg-bg-secondary flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden p-1.5 rounded-lg hover:bg-bg-hover text-text-muted"
              >
                <Menu size={20} />
              </button>
              <div>
                <h1 className="text-sm font-bold text-text-primary">
                  {activeItem?.label || "Admin"}
                </h1>
                <div className="text-[10px] text-text-muted font-mono">
                  {pathname}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 rounded-lg hover:bg-bg-hover text-text-muted transition-colors relative">
                <Bell size={16} />
              </button>
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
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
