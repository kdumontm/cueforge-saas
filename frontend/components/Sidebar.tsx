'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3, ListMusic, Upload, Download, Settings, Shield,
  Disc3, LogOut, Crown, ChevronLeft, ChevronRight, Plus,
  Music, Clock, Zap, Flame, Sunset, Mic, LayoutGrid,
} from 'lucide-react';

interface SidebarProps {
  isAdmin?: boolean;
  username?: string;
  plan?: string;
  onLogout?: () => void;
}

// Mock smart crates — sera remplacé par l'API
const SMART_CRATES = [
  { id: 'peak', label: 'Peak Hour', color: '#ef4444', count: 3 },
  { id: 'warmup', label: 'Warm-Up', color: '#f97316', count: 2 },
  { id: 'vocal', label: 'Avec voix', color: '#8b5cf6', count: 3 },
];

// Mock playlists — sera remplacé par l'API
const PLAYLISTS = [
  { id: 'playlist1', label: 'Set Berghain 2024', count: 12 },
  { id: 'playlist2', label: 'Outdoor Summer', count: 8 },
];

const navItems = [
  { href: '/dashboard', icon: BarChart3, label: 'Dashboard' },
  { href: '/dashboard/set-builder', icon: LayoutGrid, label: 'Set Builder' },
  { href: '/dashboard/upload', icon: Upload, label: 'Importer' },
  { href: '/dashboard/export', icon: Download, label: 'Exporter' },
];

const libraryItems = [
  { id: 'all', icon: Music, label: 'Toutes les tracks', count: 8 },
  { id: 'recent', icon: Clock, label: 'Récemment ajoutés', count: 3 },
  { id: 'unanalyzed', icon: Zap, label: 'Non analysés', count: 2 },
];

export default function Sidebar({ isAdmin, username = 'User', plan = 'free', onLogout }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [activeCrate, setActiveCrate] = useState<string | null>(null);

  const W = collapsed ? 56 : 220;
  const initials = username.slice(0, 2).toUpperCase();

  const NavLink = ({ href, icon: Icon, label }: { href: string; icon: any; label: string }) => {
    const isActive = pathname === href;
    return (
      <Link
        href={href}
        className={`w-full flex items-center gap-2.5 rounded-lg text-[13px] transition-all ${
          collapsed ? 'px-0 py-2 justify-center' : 'px-2.5 py-[7px]'
        } ${
          isActive
            ? 'font-semibold text-blue-400 bg-blue-600/10'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
        }`}
        title={collapsed ? label : undefined}
      >
        <Icon
          size={15}
          className={isActive ? 'text-blue-500' : 'text-[var(--text-muted)]'}
        />
        {!collapsed && <span>{label}</span>}
        {!collapsed && isActive && (
          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500" />
        )}
      </Link>
    );
  };

  const LibraryItem = ({ id, icon: Icon, label, count }: { id: string; icon: any; label: string; count: number }) => {
    const isActive = activeCrate === id;
    return (
      <button
        onClick={() => setActiveCrate(isActive ? null : id)}
        className={`w-full flex items-center gap-2.5 rounded-lg text-[13px] transition-all ${
          collapsed ? 'px-0 py-2 justify-center' : 'px-2.5 py-[7px]'
        } ${
          isActive
            ? 'font-semibold text-[var(--text-primary)] bg-[var(--bg-hover)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
        }`}
        title={collapsed ? label : undefined}
      >
        <Icon size={14} className={isActive ? 'text-blue-400' : 'text-[var(--text-muted)]'} />
        {!collapsed && (
          <>
            <span className="flex-1 text-left truncate">{label}</span>
            <span className="text-[10px] text-[var(--text-muted)] font-mono">{count}</span>
          </>
        )}
      </button>
    );
  };

  return (
    <aside
      className="h-screen bg-[var(--bg-secondary)] border-r border-[var(--border-subtle)] flex flex-col flex-shrink-0 fixed left-0 top-0 z-50 transition-all duration-250"
      style={{ width: W, minWidth: W, maxWidth: W }}
    >
      {/* Logo */}
      <div className={`flex items-center border-b border-[var(--border-subtle)] ${collapsed ? 'px-3 py-4 justify-center' : 'px-3.5 py-4 justify-between'}`}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-pink-500 flex items-center justify-center flex-shrink-0">
            <Disc3 size={14} className="text-white" />
          </div>
          {!collapsed && (
            <span className="text-base font-bold text-[var(--text-primary)]">CueForge</span>
          )}
          {!collapsed && plan === 'pro' && (
            <span className="text-[9px] font-semibold font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
              PRO
            </span>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer bg-transparent border-none p-0.5"
          title={collapsed ? 'Déplier' : 'Replier'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="px-1.5 py-2 flex-1 overflow-y-auto custom-scrollbar">
        {/* Main nav */}
        {!collapsed && (
          <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-2.5 py-1">
            Navigation
          </div>
        )}
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}

        <div className="h-px bg-[var(--border-subtle)] mx-2 my-2" />

        {/* Library */}
        {!collapsed && (
          <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-2.5 py-1">
            Bibliothèque
          </div>
        )}
        {libraryItems.map((item) => (
          <LibraryItem key={item.id} {...item} />
        ))}

        {/* Smart Crates */}
        {!collapsed && (
          <>
            <div className="h-px bg-[var(--border-subtle)] mx-2 my-2" />
            <div className="flex items-center justify-between px-2.5 py-1">
              <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Smart Crates
              </span>
              <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer bg-transparent border-none p-0" title="Nouveau crate">
                <Plus size={13} />
              </button>
            </div>
            {SMART_CRATES.map((crate) => {
              const isActive = activeCrate === crate.id;
              return (
                <button
                  key={crate.id}
                  onClick={() => setActiveCrate(isActive ? null : crate.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-[6px] rounded-lg cursor-pointer transition-all bg-transparent border-none mb-px ${
                    isActive ? 'font-semibold' : ''
                  }`}
                  style={isActive ? { background: crate.color + '18' } : {}}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-[7px] h-[7px] rounded-full inline-block flex-shrink-0"
                      style={{ background: crate.color }}
                    />
                    <span
                      className="text-[13px]"
                      style={{ color: isActive ? crate.color : 'var(--text-secondary)', fontWeight: isActive ? 600 : 400 }}
                    >
                      {crate.label}
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">{crate.count}</span>
                </button>
              );
            })}
          </>
        )}

        {/* Playlists */}
        {!collapsed && (
          <>
            <div className="h-px bg-[var(--border-subtle)] mx-2 my-2" />
            <div className="flex items-center justify-between px-2.5 py-1">
              <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Playlists
              </span>
              <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer bg-transparent border-none p-0" title="Nouvelle playlist">
                <Plus size={13} />
              </button>
            </div>
            {PLAYLISTS.map((pl) => {
              const isActive = activeCrate === pl.id;
              return (
                <button
                  key={pl.id}
                  onClick={() => setActiveCrate(isActive ? null : pl.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-[6px] rounded-lg cursor-pointer transition-all bg-transparent border-none mb-px ${
                    isActive ? 'font-semibold bg-blue-600/10' : 'hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Disc3 size={12} className={isActive ? 'text-blue-400' : 'text-[var(--text-muted)]'} />
                    <span
                      className="text-[13px]"
                      style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: isActive ? 600 : 400 }}
                    >
                      {pl.label}
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">{pl.count}</span>
                </button>
              );
            })}
          </>
        )}

        <div className="h-px bg-[var(--border-subtle)] mx-2 my-2" />

        {/* Compte */}
        {!collapsed && (
          <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-2.5 py-1">
            Compte
          </div>
        )}
        <NavLink href="/settings" icon={Settings} label="Paramètres" />
        {isAdmin && <NavLink href="/admin" icon={Shield} label="Admin" />}
      </nav>

      {/* User section */}
      <div className="px-1.5 py-2 border-t border-[var(--border-subtle)]">
        <div className={`flex items-center gap-2 ${collapsed ? 'justify-center px-0 py-1.5' : 'px-2.5 py-1.5'}`}>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-[var(--text-primary)] truncate">{username}</div>
              <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                {plan === 'pro' && <Crown size={9} className="text-amber-400" />}
                Plan {plan.charAt(0).toUpperCase() + plan.slice(1)}
              </div>
            </div>
          )}
          {!collapsed && onLogout && (
            <button
              onClick={onLogout}
              className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer bg-transparent border-none"
              title="Déconnexion"
            >
              <LogOut size={13} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
