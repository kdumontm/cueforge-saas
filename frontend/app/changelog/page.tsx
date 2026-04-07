'use client';
import Link from 'next/link';
import { Music2, Sparkles, Bug, Zap, Shield, Share2, Bell, Smartphone } from 'lucide-react';

const UPDATES = [
  {
    version: '2.4.0',
    date: '7 avril 2026',
    title: 'Social, notifications & sécurité',
    icon: Share2,
    color: 'text-blue-400',
    changes: [
      { type: 'new', text: 'Partage de playlists, sets et tracks via lien' },
      { type: 'new', text: 'Système de notifications en temps réel' },
      { type: 'new', text: 'Authentification 2FA (TOTP)' },
      { type: 'new', text: 'Connexion Google & Spotify (OAuth)' },
      { type: 'new', text: 'Page de gestion d\'abonnement et facturation' },
      { type: 'new', text: 'Export RGPD des données personnelles' },
      { type: 'new', text: 'Suppression de compte avec confirmation' },
      { type: 'improve', text: 'Accessibilité améliorée (ARIA, clavier, contraste)' },
      { type: 'improve', text: 'Responsive mobile optimisé (touch targets 44px)' },
    ],
  },
  {
    version: '2.3.0',
    date: '5 avril 2026',
    title: 'Enrichissement Spotify & Admin',
    icon: Sparkles,
    color: 'text-purple-400',
    changes: [
      { type: 'new', text: 'Enrichissement métadonnées via Spotify (pochette, genre, popularité)' },
      { type: 'new', text: 'Admin : navigation groupée, breadcrumbs, recherche ⌘K' },
      { type: 'new', text: 'Cache d\'identification audio + SSE pour suivi d\'analyse' },
      { type: 'improve', text: 'Performance backend et frontend optimisées' },
    ],
  },
  {
    version: '2.2.0',
    date: '3 avril 2026',
    title: 'Layout Builder & Desktop',
    icon: Zap,
    color: 'text-amber-400',
    changes: [
      { type: 'new', text: 'Layout Builder v2 — multi-sélection, alignement, layers, drag&drop' },
      { type: 'new', text: 'Analyse Demucs locale (stems) sur desktop' },
      { type: 'new', text: 'Export Serato/Traktor depuis les actions de track' },
      { type: 'improve', text: 'Uploads parallèles et analyses concurrentes' },
      { type: 'fix', text: 'Suppression batch + dépendances FK corrigées' },
    ],
  },
  {
    version: '2.1.0',
    date: '1 avril 2026',
    title: 'Mobile & UX',
    icon: Smartphone,
    color: 'text-emerald-400',
    changes: [
      { type: 'new', text: 'Dashboard responsive mobile' },
      { type: 'new', text: 'Playlists avec renommage inline' },
      { type: 'improve', text: 'TrackRow, BatchActionBar et TopBar responsifs' },
      { type: 'fix', text: 'Viewport meta et CSS mobile-first' },
    ],
  },
  {
    version: '2.0.0',
    date: '28 mars 2026',
    title: 'CueForge SaaS',
    icon: Music2,
    color: 'text-pink-400',
    changes: [
      { type: 'new', text: 'Plateforme SaaS complète avec auth JWT' },
      { type: 'new', text: 'Analyse audio IA : BPM, key, énergie, drops, phrases' },
      { type: 'new', text: 'Génération automatique de cue points' },
      { type: 'new', text: 'Export Rekordbox XML' },
      { type: 'new', text: 'Plans Free / Pro / Enterprise avec Stripe' },
      { type: 'new', text: 'Set Builder avec compatibilité harmonique' },
      { type: 'new', text: 'Smart Crates (playlists intelligentes par règles)' },
    ],
  },
];

const typeConfig = {
  new: { label: 'Nouveau', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  improve: { label: 'Amélioration', bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  fix: { label: 'Correction', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
};

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="border-b border-slate-800/60 bg-[#12121a]/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <Music2 size={16} />
            </div>
            <span className="text-lg font-bold">CueForge</span>
          </Link>
          <Link href="/dashboard" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold transition-colors">
            Dashboard
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold mb-3">Nouveautés</h1>
          <p className="text-slate-400">Toutes les mises à jour et améliorations de CueForge</p>
        </div>

        <div className="space-y-12">
          {UPDATES.map((update, i) => {
            const Icon = update.icon;
            return (
              <div key={i} className="relative">
                {/* Timeline line */}
                {i < UPDATES.length - 1 && (
                  <div className="absolute left-5 top-12 bottom-0 w-px bg-slate-800" />
                )}

                {/* Version header */}
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center ${update.color}`}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">{update.title}</span>
                      <span className="px-2 py-0.5 bg-slate-800 border border-slate-700/50 rounded text-[10px] font-mono text-slate-400">v{update.version}</span>
                    </div>
                    <span className="text-xs text-slate-500">{update.date}</span>
                  </div>
                </div>

                {/* Changes */}
                <div className="ml-14 space-y-2">
                  {update.changes.map((change, j) => {
                    const conf = typeConfig[change.type as keyof typeof typeConfig];
                    return (
                      <div key={j} className="flex items-start gap-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border mt-0.5 flex-shrink-0 ${conf.bg}`}>
                          {conf.label}
                        </span>
                        <span className="text-sm text-slate-300">{change.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
