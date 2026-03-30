'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3, Upload, Download, Settings, Shield,
  Disc3, LogOut, Crown, ChevronLeft, ChevronRight, Plus,
  Music, Clock, Zap, LayoutGrid, X, Trash2,
} from 'lucide-react';
import { useDashboardContext } from '@/app/dashboard/DashboardContext';
import { listPlaylists, createPlaylist, deletePlaylist, listCrates, type Playlist, type SmartCrate } from '@/lib/api';

interface SidebarProps {
  isAdmin?: boolean;
  username?: string;
  plan?: string;
  onLogout?: () => void;
}

const navItems = [
  { href: '/dashboard', icon: BarChart3, label: 'Dashboard' },
  { href: '/dashboard/set-builder', icon: LayoutGrid, label: 'Set Builder' },
  { href: '/dashboard/upload', icon: Upload, label: 'Importer' },
  { href: '/dashboard/export', icon: Download, label: 'Exporter' },
];

const DEFAULT_CRATES = [
  { id: 'crate_peak', label: 'Peak Hour', color: '#ef4444' },
  { id: 'crate_warmup', label: 'Warm-Up', color: '#f97316' },
  { id: 'crate_vocal', label: 'Avec voix', color: '#8b5cf6' },
];

export default function Sidebar({ isAdmin, username = 'User', plan = 'free', onLogout }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggleCollapsed, activeSection, setActiveSection } = useDashboardContext();
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [playlists, setPlaylists] = useState<{ id: string; label: string; count: number }[]>([]);
  const [smartCrates, setSmartCrates] = useState(DEFAULT_CRATES);

  // Load playlists and crates from backend
  useEffect(() => {
    listPlaylists()
      .then(pls => setPlaylists(pls.map(p => ({ id: `playlist_${p.id}`, label: p.name, count: p.track_count || 0 }))))
      .catch(() => {});
    listCrates()
      .then(crates => {
        if (crates.length > 0) {
          setSmartCrates(crates.map(c => ({ id: `crate_${c.id}`, label: c.name, color: c.color || '#3b82f6' })));
        }
      })
      .catch(() => {});
  }, []);

  // Navigate to dashboard when selecting a library section from a sub-page
  const handleSectionClick = useCallback((id: string) => {
    const newSection = activeSection === id && id !== 'all' ? 'all' : id;
    setActiveSection(newSection);
    if (pathname !== '/dashboard') {
      router.push('/dashboard');
    }
  }, [activeSection, pathname, router, setActiveSection]);

  const W = collapsed ? 56 : 220;
  const initials = username.slice(0, 2).toUpperCase();

  async function handleCreatePlaylist() {
    if (newPlaylistName.trim()) {
      try {
        const pl = await createPlaylist(newPlaylistName.trim());
        const id = `playlist_${pl.id}`;
        setPlaylists(prev => [...prev, { id, label: pl.name, count: 0 }]);
        setNewPlaylistName('');
        setShowNewPlaylist(false);
        handleSectionClick(id);
      } catch {
        // Fallback local
        const id = 'playlist_' + Date.now();
        setPlaylists(prev => [...prev, { id, label: newPlaylistName.trim(), count: 0 }]);
        setNewPlaylistName('');
        setShowNewPlaylist(false);
        handleSectionClick(id);
      }
    }
  }

  async function handleDeletePlaylist(playlistId: string) {
    const numericId = parseInt(playlistId.replace('playlist_', ''));
    try { await deletePlaylist(numericId); } catch {}
    setPlaylists(prev => prev.filter(p => p.id !== playlistId));
    if (activeSection === playlistId) setActiveSection('all');
  }

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
        <Icon size={15} className={isActive ? 'text-blue-500' : 'text-[var(--text-muted)]'} />
        {!collapsed && <span>{label}</span>}
        {!collapsed && isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500" />}
      </Link>
    );
  };

  const libraryItems = [
    { id: 'all', icon: Music, label: 'Toutes les tracks' },
    { id: 'recent', icon: Clock, label: 'Récemment ajoutés' },
    { id: 'unanalyzed', icon: Zap, label: 'Non analysés' },
  ];

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
          {!collapsed && <span className="text-base font-bold text-[var(--text-primary)]">CueForge</span>}
        </div>
        <button
          onClick={toggleCollapsed}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer bg-transparent border-none p-0.5"
          title={collapsed ? 'Déplier' : 'Replier'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <nav className="px-1.5 py-2 flex-1 overflow-y-auto custom-scrollbar">
        {!collapsed && <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-2.5 py-1">Navigation</div>}
        {navItems.map((item) => <NavLink key={item.href} {...item} />)}

        <div className="h-px bg-[var(--border-subtle)] mx-2 my-2" />

        {!collapsed && <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-2.5 py-1">Bibliothèque</div>}
        {libraryItems.map(({ id, icon: Icon, label }) => {
          const isActive = activeSection === id;
          return (
            <button
              key={id}
              onClick={() => handleSectionClick(id)}
              className={`w-full flex items-center gap-2.5 rounded-lg text-[13px] transition-all bg-transparent border-none cursor-pointer ${
                collapsed ? 'px-0 py-2 justify-center' : 'px-2.5 py-[7px]'
              } ${isActive ? 'font-semibold text-[var(--text-primary)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
              title={collapsed ? label : undefined}
            >
              <Icon size={14} className={isActive ? 'text-blue-400' : 'text-[var(--text-muted)]'} />
              {!collapsed && <span className="flex-1 text-left truncate">{label}</span>}
            </button>
          );
        })}

        {/* Smart Crates */}
        {!collapsed && (
          <>
            <div className="h-px bg-[var(--border-subtle)] mx-2 my-2" />
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-2.5 py-1">Smart Crates</div>
            {smartCrates.map((crate) => {
              const isActive = activeSection === crate.id;
              return (
                <button
                  key={crate.id}
                  onClick={() => handleSectionClick(crate.id)}
                  className="w-full flex items-center px-2.5 py-[6px] rounded-lg cursor-pointer transition-all bg-transparent border-none mb-px"
                  style={isActive ? { background: crate.color + '18' } : {}}
                >
                  <span className="w-[7px] h-[7px] rounded-full inline-block flex-shrink-0 mr-2" style={{ background: crate.color }} />
                  <span className="text-[13px]" style={{ color: isActive ? crate.color : 'var(--text-secondary)', fontWeight: isActive ? 600 : 400 }}>
                    {crate.label}
                  </span>
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
              <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Playlists</span>
              <button onClick={() => setShowNewPlaylist(true)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer bg-transparent border-none p-0" title="Nouvelle playlist">
                <Plus size={13} />
              </button>
            </div>
            {showNewPlaylist && (
              <div className="flex items-center gap-1 px-2.5 py-1">
                <input
                  autoFocus
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreatePlaylist(); if (e.key === 'Escape') setShowNewPlaylist(false); }}
                  placeholder="Nom…"
                  className="flex-1 px-2 py-1 rounded text-xs bg-[var(--bg-primary)] border border-[var(--border-default)] text-[var(--text-primary)] outline-none"
                />
                <button onClick={handleCreatePlaylist} className="text-blue-400 text-xs bg-transparent border-none cursor-pointer">OK</button>
                <button onClick={() => setShowNewPlaylist(false)} className="text-[var(--text-muted)] bg-transparent border-none cursor-pointer"><X size={12} /></button>
              </div>
            )}
            {playlists.map((pl) => {
              const isActive = activeSection === pl.id;
              return (
                <div
                  key={pl.id}
                  className={`w-full flex items-center justify-between px-2.5 py-[6px] rounded-lg cursor-pointer transition-all mb-px group ${isActive ? 'font-semibold bg-blue-600/10' : 'hover:bg-[var(--bg-hover)]'}`}
                >
                  <button
                    onClick={() => handleSectionClick(pl.id)}
                    className="flex items-center gap-2 flex-1 bg-transparent border-none cursor-pointer p-0"
                  >
                    <Disc3 size={12} className={isActive ? 'text-blue-400' : 'text-[var(--text-muted)]'} />
                    <span className="text-[13px]" style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: isActive ? 600 : 400 }}>{pl.label}</span>
                  </button>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">{pl.count}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(pl.id); }}
                      className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 bg-transparent border-none cursor-pointer p-0 transition-opacity"
                      title="Supprimer"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        <div className="h-px bg-[var(--border-subtle)] mx-2 my-2" />
        {!collapsed && <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-2.5 py-1">Compte</div>}
        <NavLink href="/settings" icon={Settings} label="Paramètres" />
        {isAdmin && <NavLink href="/admin" icon={Shield} label="Admin" />}
      </nav>

      {/* User section */}
      <div className="px-1.5 py-2 border-t border-[var(--border-subtle)]">
        <div className={`flex items-center gap-2 ${collapsed ? 'justify-center px-0 py-1.5' : 'px-2.5 py-1.5'}`}>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">{initials}</div>
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
            <button onClick={onLogout} className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer bg-transparent border-none" title="Déconnexion">
              <LogOut size={13} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
