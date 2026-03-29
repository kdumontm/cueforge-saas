'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3, ListMusic, Upload, Download, Settings, Shield,
  Disc3, LogOut, Crown,
} from 'lucide-react';

interface SidebarProps {
  isAdmin?: boolean;
  username?: string;
  plan?: string;
  onLogout?: () => void;
}

const navItems = [
  { href: '/dashboard', icon: BarChart3, label: 'Dashboard' },
  { href: '/dashboard#library', icon: ListMusic, label: 'Bibliothèque' },
  { href: '/dashboard#upload', icon: Upload, label: 'Upload' },
  { href: '/dashboard#export', icon: Download, label: 'Export' },
];

const accountItems = [
  { href: '/settings', icon: Settings, label: 'Paramètres' },
];

export default function Sidebar({ isAdmin, username = 'User', plan = 'free', onLogout }: SidebarProps) {
  const pathname = usePathname();

  const NavLink = ({ href, icon: Icon, label, color }: { href: string; icon: any; label: string; color?: string }) => {
    const isActive = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href));
    return (
      <Link
        href={href}
        className={`w-full flex items-center gap-2 px-2.5 py-[7px] rounded-lg text-[13px] transition-all ${
          isActive
            ? 'font-semibold text-[var(--text-primary)] bg-blue-600/10'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
        }`}
      >
        <Icon
          size={15}
          className={isActive ? (color || 'text-blue-500') : 'text-[var(--text-muted)]'}
        />
        {label}
        {isActive && (
          <div className={`ml-auto w-[3px] h-3 rounded-sm ${color ? '' : 'bg-blue-500'}`}
            style={color ? { background: color } : undefined}
          />
        )}
      </Link>
    );
  };

  const initials = username.slice(0, 2).toUpperCase();

  return (
    <aside className="w-[210px] h-screen bg-[var(--bg-secondary)] border-r border-[var(--border-subtle)] flex flex-col flex-shrink-0 fixed left-0 top-0 z-50 transition-colors duration-300">
      {/* Logo */}
      <div className="px-3.5 py-4 flex items-center gap-2 border-b border-[var(--border-subtle)]">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-pink-500 flex items-center justify-center">
          <Disc3 size={14} className="text-white" />
        </div>
        <span className="text-base font-bold text-[var(--text-primary)]">CueForge</span>
        {plan === 'pro' && (
          <span className="ml-auto text-[9px] font-semibold font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
            PRO
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="px-1.5 py-2 flex-1 overflow-y-auto">
        <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-2.5 py-1">
          Navigation
        </div>
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}

        <div className="h-px bg-[var(--border-subtle)] mx-2 my-2" />

        <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-2.5 py-1">
          Compte
        </div>
        {accountItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
        {isAdmin && (
          <NavLink href="/admin" icon={Shield} label="Admin" color="#f59e0b" />
        )}
      </nav>

      {/* User section */}
      <div className="px-1.5 py-2 border-t border-[var(--border-subtle)]">
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-[11px] font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-[var(--text-primary)] truncate">{username}</div>
            <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
              {plan === 'pro' && <Crown size={9} className="text-amber-400" />}
              Plan {plan.charAt(0).toUpperCase() + plan.slice(1)}
            </div>
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
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
