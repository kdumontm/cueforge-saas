'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, isAuthenticated } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://cueforge-saas-production.up.railway.app/api/v1';

interface DownloadInfo {
  has_access: boolean;
  user_plan: string;
  allowed_plans: string[];
  latest_version: string;
  release_notes: string;
  dmg_url: string | null;
  dmg_size: string | null;
  min_macos: string;
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  unlimited: 'Unlimited',
};

export default function DownloadPage() {
  const router = useRouter();
  const [info, setInfo] = useState<DownloadInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    fetchDownloadInfo();
  }, []);

  async function fetchDownloadInfo() {
    try {
      const res = await fetch(`${API_URL}/downloads`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Erreur serveur');
      const data = await res.json();
      setInfo(data);
    } catch (err: any) {
      setError(err.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}>
        <div className="animate-pulse text-purple-400 text-xl">Chargement...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}>
        <div className="text-red-400 text-center">
          <p className="text-xl mb-4">Erreur</p>
          <p className="text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0f' }}>
      {/* Header */}
      <header className="border-b border-zinc-800/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-zinc-400 hover:text-white transition-colors flex items-center gap-2"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M15 19l-7-7 7-7" />
            </svg>
            Retour au dashboard
          </button>
          <span className="text-xs px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
            Plan {PLAN_LABELS[info?.user_plan || 'free'] || info?.user_plan}
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm mb-8">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Application officielle
          </div>
          <h1 className="text-5xl font-bold mb-6">
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-600 bg-clip-text text-transparent">
              CueForge Desktop
            </span>
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            L&apos;app native macOS pour analyser, organiser et exporter tes tracks.
            Drag &amp; drop depuis le Finder, notifications système, et mode hors-ligne.
          </p>
        </div>

        {/* Download Card */}
        <div className="max-w-lg mx-auto">
          {info?.has_access ? (
            /* ── Accès autorisé ─────────────────────────── */
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 backdrop-blur p-8 text-center">
              {/* Icône macOS */}
              <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <svg width="48" height="48" fill="none" stroke="white" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path d="M9 3v18m6-18v18M3 9h18M3 15h18" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-white mb-2">
                CueForge pour macOS
              </h2>
              <p className="text-zinc-400 mb-1">
                Version {info.latest_version}
              </p>
              <p className="text-zinc-500 text-sm mb-8">
                macOS {info.min_macos}+ requis {info.dmg_size && `· ${info.dmg_size}`}
              </p>

              {info.dmg_url ? (
                <a
                  href={info.dmg_url}
                  className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 text-white font-semibold text-lg hover:from-purple-500 hover:to-purple-400 transition-all shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:-translate-y-0.5"
                >
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  Télécharger le .dmg
                </a>
              ) : (
                <div className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-zinc-800 text-zinc-400">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  Build en cours — bientôt disponible
                </div>
              )}

              {/* Release notes */}
              {info.release_notes && (
                <div className="mt-8 pt-6 border-t border-zinc-800">
                  <h3 className="text-sm font-medium text-zinc-400 mb-2">Notes de version</h3>
                  <p className="text-zinc-500 text-sm">{info.release_notes}</p>
                </div>
              )}

              {/* Instructions */}
              <div className="mt-6 pt-6 border-t border-zinc-800 text-left">
                <h3 className="text-sm font-medium text-zinc-400 mb-3">Installation</h3>
                <ol className="space-y-2 text-sm text-zinc-500">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 font-mono mt-0.5">1.</span>
                    Téléchargez le fichier .dmg
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 font-mono mt-0.5">2.</span>
                    Ouvrez-le et glissez CueForge dans Applications
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 font-mono mt-0.5">3.</span>
                    Si macOS bloque : Préférences Système → Sécurité → &quot;Ouvrir quand même&quot;
                  </li>
                </ol>
              </div>
            </div>
          ) : (
            /* ── Pas d'accès — upsell ──────────────────── */
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 backdrop-blur p-8 text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-zinc-800 flex items-center justify-center">
                <svg width="36" height="36" fill="none" stroke="#71717a" strokeWidth="1.5" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-white mb-3">
                Accès réservé
              </h2>
              <p className="text-zinc-400 mb-2">
                L&apos;app desktop est disponible pour les plans :
              </p>
              <div className="flex gap-2 justify-center mb-6">
                {info?.allowed_plans.map((plan) => (
                  <span
                    key={plan}
                    className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-sm border border-purple-500/30"
                  >
                    {PLAN_LABELS[plan] || plan}
                  </span>
                ))}
              </div>
              <p className="text-zinc-500 text-sm mb-8">
                Votre plan actuel : <strong className="text-zinc-300">{PLAN_LABELS[info?.user_plan || 'free']}</strong>
              </p>

              <button
                onClick={() => router.push('/pricing')}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white font-semibold text-lg hover:from-purple-500 hover:to-pink-400 transition-all shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:-translate-y-0.5"
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Passer à un plan supérieur
              </button>
            </div>
          )}
        </div>

        {/* Features */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: (
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              ),
              title: 'Drag & Drop',
              desc: 'Glissez vos fichiers audio depuis le Finder directement dans l\'app.',
            },
            {
              icon: (
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
                </svg>
              ),
              title: 'Notifications',
              desc: 'Alertes macOS natives quand l\'analyse d\'un track est terminée.',
            },
            {
              icon: (
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
              ),
              title: 'Mode hors-ligne',
              desc: 'Consultez vos tracks même sans connexion internet.',
            },
          ].map((feature, i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-6"
            >
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 mb-4">
                {feature.icon}
              </div>
              <h3 className="text-white font-semibold mb-2">{feature.title}</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
