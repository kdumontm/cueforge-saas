'use client';

import { useState, useEffect } from 'react';
import { User, Mail, Calendar, Crown, Shield, ArrowLeft, Loader2, Music2 } from 'lucide-react';
import Link from 'next/link';
import { getCurrentUser, type User as UserType } from '@/lib/api';

export default function ProfilePage() {
  const [user, setUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-[var(--text-muted)]">
        <Loader2 size={20} className="animate-spin mr-2" /> Chargement...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 text-[var(--text-muted)]">Utilisateur introuvable.</div>
    );
  }

  const initials = (user.username || 'U').slice(0, 2).toUpperCase();
  const plan = (user as any).subscription_plan || 'free';
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Back */}
      <Link
        href="/dashboard"
        className="flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <ArrowLeft size={14} /> Retour au dashboard
      </Link>

      {/* Header */}
      <div className="flex items-center gap-5">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-2xl font-bold text-white flex-shrink-0">
          {initials}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{user.username}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">{user.email}</p>
          <div className="flex items-center gap-2 mt-2">
            {plan === 'pro' ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-xs font-semibold">
                <Crown size={11} /> Pro
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-500/15 text-gray-400 text-xs font-semibold">
                Free
              </span>
            )}
            {(user as any).is_admin && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-xs font-semibold">
                <Shield size={11} /> Admin
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider mb-2">
            <User size={12} /> Identifiant
          </div>
          <div className="text-[var(--text-primary)] font-medium">{user.username}</div>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider mb-2">
            <Mail size={12} /> Email
          </div>
          <div className="text-[var(--text-primary)] font-medium">{user.email}</div>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider mb-2">
            <Calendar size={12} /> Membre depuis
          </div>
          <div className="text-[var(--text-primary)] font-medium">{memberSince}</div>
        </div>

        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider mb-2">
            <Music2 size={12} /> Plan
          </div>
          <div className="text-[var(--text-primary)] font-medium capitalize">{plan}</div>
        </div>
      </div>
    </div>
  );
}
