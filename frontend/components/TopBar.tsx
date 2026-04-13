'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, Sun, Moon, Bell, X, Upload, Download, RefreshCw } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useDashboardContext } from '@/app/dashboard/DashboardContext';
import { useLang } from './LangProvider';
import { tr } from '@/lib/i18n';
import { useAutoUpdate, useElectron } from '@/lib/electron';

interface TopBarProps {
  title: string;
  subtitle?: string;
}

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link?: string;
  created_at: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'à l\'instant';
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `il y a ${Math.floor(seconds / 3600)}h`;
  return `il y a ${Math.floor(seconds / 86400)}j`;
}

function TopBar({ title, subtitle }: TopBarProps) {
  const { toggle, isDark } = useTheme();
  const { lang, setLang } = useLang();
  const {
    globalSearch, setGlobalSearch,
    showNotifications, setShowNotifications,
    unanalyzedCount, autoAnalyze, setAutoAnalyze, triggerAnalyzeAll,
    triggerImport, triggerExport,
  } = useDashboardContext();
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const { isDesktop } = useElectron();
  const updateState = useAutoUpdate();

  // Notifications state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      setLoadingNotifications(true);
      const token = localStorage.getItem('cueforge_token');
      const response = await fetch(`${API_URL}/notifications?limit=20&offset=0`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoadingNotifications(false);
    }
  };

  // Fetch unread count
  const fetchUnreadCount = async () => {
    try {
      const token = localStorage.getItem('cueforge_token');
      const response = await fetch(`${API_URL}/notifications/unread-count`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.count || 0);
      }
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  };

  // Mark notification as read
  const markAsRead = async (id: number) => {
    try {
      const token = localStorage.getItem('cueforge_token');
      const response = await fetch(`${API_URL}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        setNotifications(prev =>
          prev.map(n => n.id === id ? { ...n, read: true } : n)
        );
        await fetchUnreadCount();
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem('cueforge_token');
      const response = await fetch(`${API_URL}/notifications/read-all`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  // Fetch unread count on mount and every 60 seconds (respects tab visibility)
  useEffect(() => {
    fetchUnreadCount();
    let interval: NodeJS.Timeout;

    const startPolling = () => {
      interval = setInterval(fetchUnreadCount, 60000); // 60s instead of 30s
    };
    const stopPolling = () => clearInterval(interval);

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        fetchUnreadCount();
        startPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (showNotifications) {
      fetchNotifications();
    }
  }, [showNotifications]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    if (showNotifications) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showNotifications, setShowNotifications]);

  return (
    <header className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/90 backdrop-blur-xl sticky top-0 z-40 transition-colors duration-300">
      <div className="pl-10 md:pl-0">
        <h1 className="text-[15px] sm:text-[17px] font-bold text-[var(--text-primary)] m-0">{title}</h1>
        {subtitle && <p className="text-[11px] text-[var(--text-muted)] mt-0.5 hidden sm:block">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Import / Export — hidden text on mobile, icon only */}
        <button
          onClick={triggerImport}
          className="flex items-center gap-1.5 px-2 sm:px-2.5 py-[5px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] text-[11px] whitespace-nowrap transition-colors flex-shrink-0 cursor-pointer"
          title={lang === 'en' ? 'Import tracks' : 'Importer des tracks'}
        >
          <Upload size={12} />
          <span className="hidden sm:inline">{tr('topbar.import', lang)}</span>
        </button>
        <button
          onClick={triggerExport}
          className="flex items-center gap-1.5 px-2 sm:px-2.5 py-[5px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] text-[11px] whitespace-nowrap transition-colors flex-shrink-0 cursor-pointer"
          title={lang === 'en' ? 'Export' : 'Exporter'}
        >
          <Download size={12} />
          <span className="hidden sm:inline">{tr('topbar.export', lang)}</span>
        </button>

        {/* Auto-analyse toggle — hide text on mobile */}
        <button
          onClick={() => setAutoAnalyze(p => !p)}
          className={`hidden sm:flex items-center gap-1.5 px-2.5 py-[5px] rounded-lg border text-[11px] whitespace-nowrap cursor-pointer transition-all flex-shrink-0 ${
            autoAnalyze
              ? 'bg-emerald-600/15 border-emerald-500/40 text-emerald-400 font-semibold'
              : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)]'
          }`}
          title={autoAnalyze
            ? (lang === 'en' ? 'Auto-analyze ON — click to disable' : 'Auto-analyse activée — cliquer pour désactiver')
            : (lang === 'en' ? 'Auto-analyze OFF — click to enable' : 'Auto-analyse désactivée — cliquer pour activer')}
        >
          <span className={`w-6 h-3 rounded-full relative inline-block flex-shrink-0 transition-colors ${autoAnalyze ? 'bg-emerald-500' : 'bg-[var(--bg-elevated)]'}`}>
            <span className={`absolute top-0.5 left-0.5 w-2 h-2 rounded-full bg-white shadow transition-transform ${autoAnalyze ? 'translate-x-3' : 'translate-x-0'}`} />
          </span>
          {tr('topbar.auto', lang)}
        </button>

        {/* Tracks à analyser — compact on mobile */}
        {unanalyzedCount > 0 && (
          <button
            onClick={triggerAnalyzeAll}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-[5px] rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-400 text-[11px] font-semibold whitespace-nowrap cursor-pointer hover:bg-amber-500/20 transition-colors flex-shrink-0"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
            {unanalyzedCount} {tr('topbar.to_analyze', lang)}
          </button>
        )}

        {/* Search — responsive width */}
        <div className={`flex items-center gap-1.5 bg-[var(--bg-card)] border rounded-lg px-2 sm:px-2.5 py-[5px] min-w-[120px] sm:min-w-[200px] transition-colors ${searchFocused ? 'border-blue-500' : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'}`}>
          <Search size={13} className="text-[var(--text-muted)]" />
          <input
            ref={searchRef}
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={tr('topbar.search', lang)}
            className="bg-transparent border-none outline-none text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] w-full"
          />
          {globalSearch ? (
            <button onClick={() => setGlobalSearch('')} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer p-0"><X size={12} /></button>
          ) : (
            <kbd className="hidden sm:inline text-[9px] font-mono px-1 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-default)]">⌘K</kbd>
          )}
        </div>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative flex items-center justify-center w-[30px] h-[30px] sm:w-[34px] sm:h-[34px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] transition-colors cursor-pointer"
          >
            <Bell size={15} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          {showNotifications && (
            <div className="absolute right-0 top-10 w-80 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {lang === 'en' ? 'Notifications' : 'Notifications'}
                </span>
                {unreadCount > 0 && (
                  <span
                    onClick={markAllAsRead}
                    className="text-[10px] text-blue-400 cursor-pointer hover:text-blue-300 transition-colors"
                  >
                    {lang === 'en' ? 'Mark all as read' : 'Tout marquer comme lu'}
                  </span>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {loadingNotifications && (
                  <div className="px-4 py-6 text-xs text-[var(--text-muted)] text-center">
                    {lang === 'en' ? 'Loading...' : 'Chargement...'}
                  </div>
                )}
                {!loadingNotifications && notifications.length === 0 && (
                  <div className="px-4 py-6 text-xs text-[var(--text-muted)] text-center">
                    {lang === 'en' ? 'No notifications' : 'Aucune notification'}
                  </div>
                )}
                {notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.read) {
                        markAsRead(n.id);
                      }
                      if (n.link) {
                        window.location.href = n.link;
                      }
                    }}
                    className={`px-4 py-3 border-b border-[var(--border-subtle)] last:border-b-0 ${!n.read ? 'bg-blue-500/5' : ''} hover:bg-[var(--bg-hover)] cursor-pointer transition-colors`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-[var(--text-primary)]">{n.title}</div>
                        <div className="text-xs text-[var(--text-muted)] mt-0.5">{n.message}</div>
                      </div>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0 mt-1.5" />}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-1.5">{timeAgo(n.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Language toggle FR / EN */}
        <div className="hidden sm:flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden">
          {(['fr', 'en'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              title={l === 'fr' ? 'Français' : 'English'}
              className={`px-2.5 py-[7px] text-[11px] font-bold uppercase cursor-pointer transition-all ${
                lang === l
                  ? 'bg-blue-600 text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Reload pour appliquer les MAJ du frontend */}
        <button
          onClick={() => {
            if ('caches' in window) {
              caches.keys().then(names => names.forEach(n => caches.delete(n)));
            }
            window.location.reload();
          }}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-[5px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] text-[11px] whitespace-nowrap transition-colors flex-shrink-0 cursor-pointer"
          title={lang === 'en' ? 'Reload to apply updates' : 'Recharger pour appliquer les mises à jour'}
        >
          <RefreshCw size={12} />
          {lang === 'en' ? 'Reload' : 'MAJ'}
        </button>

        {/* Desktop only : mise à jour disponible / cliquable pour installer */}
        {isDesktop && updateState.available && (
          <button
            onClick={() => {
              if (updateState.downloaded) {
                const bridge = (window as any).cueforge;
                bridge?.updater?.install?.();
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-[5px] rounded-lg border text-[11px] font-semibold whitespace-nowrap flex-shrink-0 transition-all ${
              updateState.downloaded
                ? 'border-green-500/40 bg-green-500/10 text-green-400 cursor-pointer hover:bg-green-500/20'
                : 'border-blue-500/40 bg-blue-500/10 text-blue-400 animate-pulse cursor-default'
            }`}
          >
            <RefreshCw size={12} className={!updateState.downloaded ? 'animate-spin' : ''} />
            {updateState.downloaded
              ? (lang === 'en' ? 'Click to restart & update' : 'Cliquer pour redémarrer')
              : `${lang === 'en' ? 'Downloading' : 'Téléchargement'}… ${Math.round(updateState.progress)}%`}
          </button>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={isDark ? (lang === 'en' ? 'Light mode' : 'Mode clair') : (lang === 'en' ? 'Dark mode' : 'Mode sombre')}
          className={`flex items-center justify-center w-[30px] h-[30px] sm:w-[34px] sm:h-[34px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] cursor-pointer transition-colors hover:border-[var(--border-default)] ${isDark ? 'text-amber-400 hover:text-amber-300' : 'text-blue-600 hover:text-blue-500'}`}
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
}

export default React.memo(TopBar);
