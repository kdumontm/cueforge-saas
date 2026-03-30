'use client';

import { Search, Sun, Moon, Bell, Zap } from 'lucide-react';
import { useTheme } from './ThemeProvider';

interface TopBarProps {
  title: string;
  subtitle?: string;
  unanalyzedCount?: number;
}

export default function TopBar({ title, subtitle, unanalyzedCount = 0 }: TopBarProps) {
  const { mode, toggle, isDark } = useTheme();

  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/90 backdrop-blur-xl sticky top-0 z-40 transition-colors duration-300">
      {/* Title */}
      <div>
        <h1 className="text-[17px] font-bold text-[var(--text-primary)] m-0">{title}</h1>
        {subtitle && (
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="flex items-center gap-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-[5px] min-w-[200px] cursor-pointer hover:border-[var(--border-default)] transition-colors">
          <Search size={13} className="text-[var(--text-muted)]" />
          <span className="text-xs text-[var(--text-muted)]">Rechercher...</span>
          <kbd className="ml-auto text-[9px] font-mono px-1 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-default)]">
            ⌘K
          </kbd>
        </div>

        {/* Analyze all button */}
        {unanalyzedCount > 0 && (
          <button className="flex items-center gap-1.5 px-3 py-[6px] rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/25 text-xs font-semibold cursor-pointer hover:bg-amber-500/25 transition-colors">
            <Zap size={13} />
            Analyser tout ({unanalyzedCount})
          </button>
        )}

        {/* Notifications */}
        <button className="relative flex items-center justify-center w-[34px] h-[34px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] transition-colors cursor-pointer">
          <Bell size={15} />
          <span className="absolute top-1.5 right-1.5 w-[6px] h-[6px] rounded-full bg-red-500" />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={isDark ? 'Mode clair' : 'Mode sombre'}
          className={`flex items-center justify-center w-[34px] h-[34px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] cursor-pointer transition-colors hover:border-[var(--border-default)] ${
            isDark ? 'text-amber-400 hover:text-amber-300' : 'text-blue-600 hover:text-blue-500'
          }`}
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
}
