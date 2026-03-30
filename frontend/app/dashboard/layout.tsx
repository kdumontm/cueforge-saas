'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, clearToken, getCurrentUser } from '@/lib/api';
import type { User } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    getCurrentUser().then(setUser).catch(() => {});
  }, [router]);

  function handleLogout() {
    clearToken();
    router.push('/');
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex transition-colors duration-300">
      <Sidebar
        isAdmin={user?.is_admin}
        username={user?.username || 'User'}
        plan={(user as any)?.subscription_plan || 'free'}
        onLogout={handleLogout}
      />
      {/* ml-[210px] quand sidebar ouverte, ml-[56px] quand collapsed — géré par CSS peer ou JS */}
      <div className="ml-[210px] flex-1 min-h-screen bg-[var(--bg-primary)] transition-all duration-250">
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
