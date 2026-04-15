'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, clearToken, getCurrentUser } from '@/lib/api';
import type { User } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import Breadcrumbs from '@/components/Breadcrumbs';
import { DashboardProvider, useDashboardContext } from './DashboardContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Menu, X } from 'lucide-react';
import { useKeyboardShortcuts } from '@/lib/keyboardShortcuts';
import { CommandPalette } from '@/components/CommandPalette';
import { OfflineIndicator } from '@/components/OfflineIndicator';

function DashboardInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const { collapsed, toggleCollapsed } = useDashboardContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const prevWidthRef = useRef(typeof window !== 'undefined' ? window.innerWidth : 1200);

  // Initialize global keyboard shortcuts
  useKeyboardShortcuts();

  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      const prev = prevWidthRef.current;
      setIsMobile(w < 768);
      // Auto-collapse sidebar when window shrinks below 1024px (not already collapsed)
      if (w < 1024 && prev >= 1024 && !collapsed) {
        toggleCollapsed();
      }
      prevWidthRef.current = w;
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [collapsed, toggleCollapsed]);

  // Close mobile menu on route change
  useEffect(() => { setMobileMenuOpen(false); }, [children]);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    getCurrentUser()
      .then((u) => {
        if (!u || !u.id) {
          clearToken();
          router.push('/login');
          return;
        }
        setUser(u);
      })
      .catch(() => {
        clearToken();
        router.push('/login');
      });
  }, [router]);

  function handleLogout() {
    clearToken();
    router.push('/');
  }

  const sidebarWidth = isMobile ? 0 : (collapsed ? 56 : 220);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex transition-colors duration-300">
      {/* Command Palette */}
      <CommandPalette />

      {/* Offline Indicator */}
      <OfflineIndicator />

      {/* Mobile hamburger */}
      {isMobile && (
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="fixed top-3 left-3 z-[60] p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] shadow-lg md:hidden"
          aria-label="Menu"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      )}

      {/* Sidebar — hidden on mobile, shown as overlay when open */}
      <div className={`
        ${isMobile ? 'fixed inset-0 z-50' : ''}
        ${isMobile && !mobileMenuOpen ? 'pointer-events-none' : ''}
      `}>
        {/* Backdrop */}
        {isMobile && mobileMenuOpen && (
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
        <div className={`
          ${isMobile ? 'absolute left-0 top-0 h-full transition-transform duration-300 z-10' : ''}
          ${isMobile && !mobileMenuOpen ? '-translate-x-full' : 'translate-x-0'}
        `}>
          <Sidebar
            isAdmin={user?.is_admin}
            username={user?.username || 'User'}
            plan={(user as any)?.subscription_plan || 'free'}
            onLogout={handleLogout}
          />
        </div>
      </div>

      <div
        className="flex-1 min-h-screen min-w-0 bg-[var(--bg-primary)] transition-all duration-250"
        style={{ marginLeft: sidebarWidth }}
      >
        <TopBar
          title="Dashboard"
          subtitle="Analyse et prépare tes sets"
        />
        <Breadcrumbs />
        <main className="flex-1 w-full overflow-x-hidden overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <DashboardProvider>
        <DashboardInner>{children}</DashboardInner>
      </DashboardProvider>
    </ErrorBoundary>
  );
}
