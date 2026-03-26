'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Music2, LogOut, LayoutDashboard, Shield, DollarSign, FileText, Settings } from 'lucide-react';
import { isAuthenticated, clearToken, getCurrentUser } from '@/lib/api';
import type { User } from '@/lib/api';

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
    <div className="min-h-screen bg-bg-primary flex flex-col">
      {/* Top nav */}
      <header className="border-b border-slate-800/60 bg-bg-secondary/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-accent-purple rounded-lg flex items-center justify-center">
              <Music2 size={15} className="text-white" />
            </div>
            <span className="text-base font-bold text-white">CueForge</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link href="/dashboard" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-bg-elevated text-sm transition-all">
              <LayoutDashboard size={15} />
              Dashboard
            </Link>
            {user?.is_admin && (
              <Link href="/admin" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-purple-400 hover:text-purple-200 hover:bg-purple-900/30 text-sm transition-all">
                <Shield size={15} />
                Admin
              </Link>
            )}
          <Link href="/pricing" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
            <DollarSign size={15} />
            Prix
          </Link>
          <Link href="/cgu" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
            <FileText size={15} />
            CGU
          </Link>
          <Link href="/settings" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
            <Settings size={15} />
            Paramètres
          </Link>
            <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-bg-elevated text-sm transition-all">
              <LogOut size={15} />
              Déconnexion
            </button>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {children}
      </main>
    </div>
  );
}
