'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, Sun, Moon, Bell, X, Upload, Download, Languages } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from './ThemeProvider';
import { useDashboardContext } from '@/app/dashboard/DashboardContext';

// ── Language context (simple, sans lib i18n) ──────────────────────────────────
import { createContext, useContext } from 'react';
export type Lang = 'fr' | 'en';
export const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'fr', setLang: () => {} });

interface TopBarProps {
  title: string;
  subtitle?: string;
}

const NOTIFICATIONS: { id: number; text: string; time: string; read: boolean }[] = [];

export default function TopBar({ title, subtitle }: TopBarProps) {
  const { mode, toggle, isDark } = useTheme();
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('cueforge_lang') as Lang) || 'fr';
    return 'fr';
  });
  const switchLang = (l: Lang) => {
    setLang(l);
    if (typeof window !== 'undefined') localStorage.setItem('cueforge_lang', l);
  };
  const {
    globalSearch, setGlobalSearch,
    showNotifications, setShowNotifications,
    unanalyzedCount, autoAnalyze, setAutoAnalyze, triggerAnalyzeAll,
  } = useDashboardContext();
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

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
    <header className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/90 backdrop-blur-xl sticky top-0 z-40 transition-colors duration-300">
      <div>
        <h1 className="text-[17px] font-bold text-[var(--text-primary)] m-0">{title}</h1>
        {subtitle && <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {/* Import / Export — accès rapide */}
        <Link
          href="/dashboard/upload"
          className="flex items-center gap-1.5 px-2.5 py-[5px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] text-[11px] whitespace-nowrap transition-colors flex-shrink-0"
          title="Importer des tracks"
        >
          <Upload size={12} />
          Import
        </Link>
        <Link
          href="/dashboard/export"
          className="flex items-center gap-1.5 px-2.5 py-[5px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] text-[11px] whitespace-nowrap transition-colors flex-shrink-0"
          title="Exporter"
        >
          <Download size={12} />
          Export
        </Link>

        {/* Auto-analyse toggle */}
        <button
          onClick={() => setAutoAnalyze(p => !p)}
          className={`flex items-center gap-1.5 px-2.5 py-[5px] rounded-lg border text-[11px] whitespace-nowrap cursor-pointer transition-all flex-shrink-0 ${
            autoAnalyze
              ? 'bg-emerald-600/15 border-emerald-500/40 text-emerald-400 font-semibold'
              : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)]'
          }`}
          title={autoAnalyze ? 'Auto-analyse activée — cliquer pour désactiver' : 'Auto-analyse désactivée — cliquer pour activer'}
        >
          <span className={`w-6 h-3 rounded-full relative inline-block flex-shrink-0 transition-colors ${autoAnalyze ? 'bg-emerald-500' : 'bg-[var(--bg-elevated)]'}`}>
            <span className={`absolute top-0.5 left-0.5 w-2 h-2 rounded-full bg-white shadow transition-transform ${autoAnalyze ? 'translate-x-3' : 'translate-x-0'}`} />
          </span>
          Auto
        </button>

        {/* Tracks à analyser */}
        {unanalyzedCount > 0 && (
          <button
            onClick={triggerAnalyzeAll}
            className="flex items-center gap-1.5 px-2.5 py-[5px] rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-400 text-[11px] font-semibold whitespace-nowrap cursor-pointer hover:bg-amber-500/20 transition-colors flex-shrink-0"
            title={`${unanalyzedCount} tracks non analysés — cliquer pour lancer l'analyse`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
            {unanalyzedCount} à analyser
          </button>
        )}

        <div className={`flex items-center gap-1.5 bg-[var(--bg-card)] border rounded-lg px-2.5 py-[5px] min-w-[200px] transition-colors ${searchFocused ? 'border-blue-500' : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'}`}>
          <Search size={13} className="text-[var(--text-muted)]" />
          <input
            ref={searchRef}
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Rechercher..."
            className="bg-transparent border-none outline-none text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] w-full"
          />
          {globalSearch ? (
            <button onClick={() => setGlobalSearch('')} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer p-0"><X size={12} /></button>
          ) : (
            <kbd className="text-[9px] font-mono px-1 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-default)]">⌘K</kbd>
          )}
        </div>
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative flex items-center justify-center w-[34px] h-[34px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] transition-colors cursor-pointer"
          >
            <Bell size={15} />
          </button>
          {showNotifications && (
            <div className="absolute right-0 top-10 w-80 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--text-primary)]">Notifications</span>
                <span className="text-[10px] text-blue-400 cursor-pointer">Tout marquer comme lu</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {NOTIFICATIONS.length === 0 && (
                  <div className="px-4 py-6 text-xs text-[var(--text-muted)] text-center">Aucune notification</div>
                )}
                {NOTIFICATIONS.map(n => (
                  <div key={n.id} className={`px-4 py-3 border-b border-[var(--border-subtle)] last:border-b-0 ${!n.read ? 'bg-blue-500/5' : ''} hover:bg-[var(--bg-hover)] cursor-pointer`}>
                    <div className="text-xs text-[var(--text-primary)]">{n.text}</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{n.time}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Language toggle FR / EN */}
        <div className="flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden">
          {(['fr', 'en'] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => switchLang(l)}
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

        <button
          onClick={toggle}
          title={isDark ? 'Mode clair' : 'Mode sombre'}
          className={`flex items-center justify-center w-[34px] h-[34px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] cursor-pointer transition-colors hover:border-[var(--border-default)] ${isDark ? 'text-amber-400 hover:text-amber-300' : 'text-blue-600 hover:text-blue-500'}`}
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
}
