'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, clearToken, getCurrentUser } from '@/lib/api';
import type { User } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { DashboardProvider, useDashboardContext } from './DashboardContext';

function DashboardInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const { collapsed } = useDashboardContext();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    getCurrentUser()
      .then(setUser)
      .catch((err) => {
        console.warn('getCurrentUser failed:', err?.message);
        if (err?.message === 'Session expired' || err?.message === 'Not authenticated') {
          clearToken();
          router.push('/login');
        }
      });
  }, [router]);

  function handleLogout() {
    clearToken();
    router.push('/');
  }

  const sidebarWidth = collapsed ? 56 : 210;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex transition-colors duration-300">
      <Sidebar
        isAdmin={user?.is_admin}
        username={user?.username || 'User'}
        plan={(user as any)?.subscription_plan || 'free'}
        onLogout={handleLogout}
      />
      <div
        className="flex-1 min-h-screen bg-[var(--bg-primary)] transition-all duration-250"
        style={{ marginLeft: sidebarWidth }}
      >
        <TopBar
          title="Dashboard"
          subtitle="Analyse et prépare tes sets"
        />
        <main className="flex-1 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <DashboardInner>{children}</DashboardInner>
    </DashboardProvider>
  );
}
