'use client';
import Link from 'next/link';
import { Music2, Zap, Download, ChevronRight, Check, Disc3 } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-primary overflow-hidden">
      {/* Hero glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent-purple opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-accent-purple rounded-lg flex items-center justify-center">
            <Music2 size={18} className="text-white" />
          </div>
          <span className="text-xl font-bold text-white">CueForge</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/pricing"
            className="px-4 py-2 text-slate-300 hover:text-white text-sm font-medium transition-colors"
          >
            Tarifs
          </Link>
          <Link
            href="/login"
            className="px-4 py-2 text-slate-300 hover:text-white text-sm font-medium transition-colors"
          >
            Connexion
          </Link>
          <Link
            href="/register"
            className="px-4 py-2 bg-accent-purple hover:bg-accent-purple-light text-white text-sm font-semibold rounded-lg transition-all hover:shadow-lg hover:shadow-purple-900/40"
          >
            Commencer gratuitement
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 text-center px-6 pt-20 pb-24 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-purple/10 border border-accent-purple/30 text-accent-purple-light text-xs font-medium mb-8">
          <Disc3 size={12} className="animate-spin-slow" />
          Analyse audio propulsée par IA
        </div>

        <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight mb-6">
          Prépare tes sets{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-purple to-accent-pink glow-text">
            10× plus vite
          </span>
        </h1>

        <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Upload ton audio, CueForge détecte automatiquement le BPM, les drops, les phrases
          et génère tes cue points prêts pour Rekordbox.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/register"
            className="flex items-center gap-2 px-6 py-3.5 bg-accent-purple hover:bg-accent-purple-light text-white font-semibold rounded-xl transition-all hover:shadow-xl hover:shadow-purple-900/50 glow-purple"
          >
            Analyser un morceau
            <ChevronRight size={18} />
          </Link>
          <Link
            href="/login"
            className="flex items-center gap-2 px-6 py-3.5 bg-bg-elevated hover:bg-bg-card text-slate-300 font-medium rounded-xl border border-slate-700/50 transition-all"
          >
            J&apos;ai déjà un compte
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 px-6 max-w-6xl mx-auto pb-20">
        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<Zap size={22} className="text-accent-purple" />}
            title="Analyse en quelques secondes"
            desc="BPM précis, tonalité, énergie, détection des drops et des phrases musicales. Tout en automatique."
          />
          <FeatureCard
            icon={<Music2 size={22} className="text-accent-cyan" />}
            title="Cue points intelligents"
            desc="Intro, drops, phrases, fade-out — les cue points sont placés exactement où tu en as besoin."
          />
          <FeatureCard
            icon={<Download size={22} className="text-accent-pink" />}
            title="Export Rekordbox"
            desc="Télécharge le fichier XML et importe-le directement dans Rekordbox 6. Zéro saisie manuelle."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 px-6 max-w-4xl mx-auto pb-24">
        <h2 className="text-3xl font-bold text-white text-center mb-12">Comment ça marche</h2>
        <div className="space-y-0">
          {[
            { n: '01', title: 'Upload ton fichier audio', desc: 'MP3, WAV, FLAC, AIFF — tous les formats sont acceptés.' },
            { n: '02', title: 'L\'IA analyse le morceau', desc: 'Détection BPM, tonalité, structure, drops et beats.' },
            { n: '03', title: 'Vérifie les cue points', desc: 'Visualise et ajuste les marqueurs si besoin.' },
            { n: '04', title: 'Exporte vers Rekordbox', desc: 'Un clic pour télécharger le XML prêt à importer.' },
          ].map((step, i) => (
            <div key={i} className="flex gap-6 items-start py-6 border-b border-slate-800/50 last:border-0">
              <div className="w-12 h-12 rounded-xl bg-accent-purple/10 border border-accent-purple/20 flex items-center justify-center flex-shrink-0">
                <span className="text-accent-purple font-mono text-sm font-bold">{step.n}</span>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">{step.title}</h3>
                <p className="text-slate-400 text-sm">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 pb-24">
        <div className="max-w-2xl mx-auto bg-gradient-to-br from-bg-secondary to-bg-card rounded-2xl border border-accent-purple/20 p-10 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Prêt à accélérer ta préparation ?</h2>
          <p className="text-slate-400 mb-8">Gratuit pour commencer. Aucune carte bancaire requise.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
            {['BPM & Tonalité', 'Cue points auto', 'Export Rekordbox'].map(f => (
              <div key={f} className="flex items-center gap-1.5 text-sm text-slate-300">
                <Check size={14} className="text-green-400" /> {f}
              </div>
            ))}
          </div>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-accent-purple hover:bg-accent-purple-light text-white font-semibold rounded-xl transition-all hover:shadow-xl hover:shadow-purple-900/50"
          >
            Créer mon compte gratuit <ChevronRight size={18} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 mt-10">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <Disc3 size={20} className="text-accent-purple" />
              <span className="text-sm font-bold text-white">CueForge</span>
            </div>
            <div className="flex flex-wrap gap-6 text-sm text-slate-400">
              <Link href="/pricing" className="hover:text-white transition">Tarifs</Link>
              <Link href="/cgu" className="hover:text-white transition">CGU</Link>
              <a href="mailto:contact@cueforge.app" className="hover:text-white transition">Contact</a>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-white/10 text-center text-slate-500 text-xs">
            © 2026 CueForge. Tous droits réservés.
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-bg-secondary border border-slate-800/50 rounded-2xl p-6 hover:border-accent-purple/30 transition-all hover:bg-bg-card group">
      <div className="w-10 h-10 rounded-xl bg-bg-elevated flex items-center justify-center mb-4 group-hover:bg-accent-purple/10 transition-colors">
        {icon}
      </div>
      <h3 className="text-white font-semibold mb-2">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

