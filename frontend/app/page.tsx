'use client';
import Link from 'next/link';
import { Music2, Zap, Download, ChevronRight, Check, Disc3, Headphones, BarChart3, Layers, Palette, Wand2, Shield, Globe, ArrowRight, Play, Star, Users, Clock, Target, Sparkles, Radio, Library } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-primary overflow-hidden">
      {/* Hero glow effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent-purple opacity-10 blur-[120px] rounded-full" />
        <div className="absolute top-[60vh] right-0 w-[600px] h-[300px] bg-accent-pink opacity-5 blur-[100px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[300px] bg-accent-cyan opacity-5 blur-[100px] rounded-full" />
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
          <Link href="/pricing" className="px-4 py-2 text-slate-300 hover:text-white text-sm font-medium transition-colors">
            Tarifs
          </Link>
          <Link href="/login" className="px-4 py-2 text-slate-300 hover:text-white text-sm font-medium transition-colors">
            Connexion
          </Link>
          <Link href="/register" className="px-4 py-2 bg-accent-purple hover:bg-accent-purple-light text-white text-sm font-semibold rounded-lg transition-all hover:shadow-lg hover:shadow-purple-900/40">
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
            10&times; plus vite
          </span>
        </h1>

        <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Upload ton audio, CueForge détecte automatiquement le BPM, les drops, les phrases
          et génère tes cue points prêts pour Rekordbox, Serato et Traktor.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/register" className="flex items-center gap-2 px-6 py-3.5 bg-accent-purple hover:bg-accent-purple-light text-white font-semibold rounded-xl transition-all hover:shadow-xl hover:shadow-purple-900/50 glow-purple">
            Analyser un morceau <ChevronRight size={18} />
          </Link>
          <Link href="/login" className="flex items-center gap-2 px-6 py-3.5 bg-bg-elevated hover:bg-bg-card text-slate-300 font-medium rounded-xl border border-slate-700/50 transition-all">
            J&apos;ai déjà un compte
          </Link>
        </div>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-6 mt-12 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><Shield size={13} className="text-green-500" /> Gratuit pour commencer</span>
          <span className="flex items-center gap-1.5"><Clock size={13} className="text-blue-400" /> Setup en 30 secondes</span>
          <span className="flex items-center gap-1.5"><Globe size={13} className="text-purple-400" /> Aucune installation</span>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section className="relative z-10 px-6 max-w-5xl mx-auto pb-20">
        <div className="bg-gradient-to-b from-bg-secondary to-bg-card rounded-2xl border border-slate-700/50 p-1 shadow-2xl shadow-purple-900/10">
          <div className="bg-bg-primary rounded-xl p-4 space-y-3">
            {/* Fake topbar */}
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                <div className="w-3 h-3 rounded-full bg-green-500/50" />
              </div>
              <div className="flex-1 text-center">
                <span className="text-[10px] text-slate-500 font-mono">cueforge.app/dashboard</span>
              </div>
            </div>
            {/* Fake waveform */}
            <div className="bg-bg-elevated rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-accent-purple/20 rounded-lg flex items-center justify-center">
                  <Play size={16} className="text-accent-purple" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Shed My Skin — Ben Böhmer</div>
                  <div className="text-[11px] text-slate-500">124 BPM &bull; 6A &bull; Melodic House</div>
                </div>
              </div>
              {/* Fake waveform bars */}
              <div className="flex items-center gap-px h-16">
                {Array.from({ length: 80 }, (_, i) => {
                  const h = Math.sin(i * 0.15) * 30 + Math.random() * 20 + 10;
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-sm"
                      style={{
                        height: `${h}%`,
                        background: i < 25 ? 'linear-gradient(to top, #6366f1, #a855f7)' : 'rgba(99, 102, 241, 0.2)',
                      }}
                    />
                  );
                })}
              </div>
              {/* Fake cue points */}
              <div className="flex gap-2 mt-2">
                {['Intro', 'Build', 'Drop', 'Break', 'Drop 2', 'Outro'].map((name, i) => (
                  <span key={i} className={`px-2 py-0.5 rounded text-[9px] font-semibold ${
                    ['bg-green-500/20 text-green-400', 'bg-blue-500/20 text-blue-400', 'bg-red-500/20 text-red-400',
                     'bg-yellow-500/20 text-yellow-400', 'bg-red-500/20 text-red-400', 'bg-orange-500/20 text-orange-400'][i]
                  }`}>
                    {name}
                  </span>
                ))}
              </div>
            </div>
            {/* Fake track list */}
            <div className="space-y-1">
              {[
                { title: 'Lost Highway', artist: 'Stephan Bodzin', bpm: 134, key: '10B', energy: 88 },
                { title: 'Equinox', artist: 'Solomun', bpm: 122, key: '3A', energy: 65 },
                { title: 'Disco Volante', artist: 'ANNA', bpm: 136, key: '8A', energy: 91 },
              ].map((t, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-elevated/50 text-xs">
                  <span className="text-slate-500 w-4 text-right font-mono">{i + 2}</span>
                  <div className="flex-1">
                    <span className="text-white font-medium">{t.title}</span>
                    <span className="text-slate-500 ml-2">{t.artist}</span>
                  </div>
                  <span className="text-slate-400 font-mono">{t.bpm}</span>
                  <span className="px-1.5 py-0.5 rounded bg-accent-purple/20 text-accent-purple text-[10px] font-medium">{t.key}</span>
                  <div className="w-12 h-1.5 bg-bg-primary rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500" style={{ width: `${t.energy}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="relative z-10 px-6 max-w-6xl mx-auto pb-24">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Tout ce dont un DJ a besoin</h2>
          <p className="text-slate-400 max-w-xl mx-auto">Des outils professionnels pour analyser, organiser et préparer tes morceaux comme un pro.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          <FeatureCard icon={<Zap size={22} className="text-yellow-400" />} title="Analyse IA ultra-rapide" desc="BPM précis, tonalité, énergie, détection des drops et des phrases musicales. Tout en automatique." />
          <FeatureCard icon={<Target size={22} className="text-red-400" />} title="Hot Cues intelligents" desc="8 hot cues colorés placés automatiquement sur les drops, intros, breaks et transitions clés." />
          <FeatureCard icon={<Download size={22} className="text-green-400" />} title="Export multi-format" desc="Rekordbox XML, Serato, Traktor, M3U — compatible avec tous les logiciels DJ du marché." />
          <FeatureCard icon={<Radio size={22} className="text-purple-400" />} title="Roue de Camelot" desc="Visualise les compatibilités harmoniques entre tes morceaux pour des transitions parfaites." />
          <FeatureCard icon={<Layers size={22} className="text-blue-400" />} title="Set Builder" desc="Construis tes sets avec scoring de compatibilité BPM/Key et suggestions IA pour le prochain morceau." />
          <FeatureCard icon={<Library size={22} className="text-cyan-400" />} title="Smart Crates" desc="Organise automatiquement tes tracks par énergie, genre, tags avec des crates dynamiques." />
          <FeatureCard icon={<BarChart3 size={22} className="text-orange-400" />} title="Statistiques DJ" desc="Distribution BPM, tonalités, énergie, genres — comprends ta collection en un coup d'oeil." />
          <FeatureCard icon={<Palette size={22} className="text-pink-400" />} title="Tags & Couleurs" desc="Catégorise, tague et colore tes morceaux comme dans Rekordbox. Batch edit pour aller vite." />
          <FeatureCard icon={<Wand2 size={22} className="text-indigo-400" />} title="Metadata enrichie" desc="Titre, artiste, label, album — édite toutes les infos depuis l'interface. Fini les fichiers mal tagués." />
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 px-6 max-w-4xl mx-auto pb-24">
        <h2 className="text-3xl font-bold text-white text-center mb-12">Comment ça marche</h2>
        <div className="grid md:grid-cols-4 gap-6">
          {[
            { n: '01', title: 'Upload', desc: 'MP3, WAV, FLAC, AIFF — glisse tes fichiers.', icon: <Music2 size={20} /> },
            { n: '02', title: 'Analyse IA', desc: 'BPM, tonalité, structure, drops et beats.', icon: <Zap size={20} /> },
            { n: '03', title: 'Organise', desc: 'Tags, couleurs, playlists, smart crates.', icon: <Layers size={20} /> },
            { n: '04', title: 'Exporte', desc: 'Un clic pour Rekordbox, Serato ou Traktor.', icon: <Download size={20} /> },
          ].map((step, i) => (
            <div key={i} className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-purple/20 to-accent-pink/10 border border-accent-purple/20 flex items-center justify-center mx-auto mb-4 text-accent-purple">
                {step.icon}
              </div>
              <span className="text-accent-purple font-mono text-xs font-bold">{step.n}</span>
              <h3 className="text-white font-semibold mt-1 mb-1">{step.title}</h3>
              <p className="text-slate-400 text-sm">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative z-10 px-6 max-w-4xl mx-auto pb-24">
        <div className="bg-gradient-to-br from-accent-purple/10 to-accent-pink/5 rounded-2xl border border-accent-purple/20 p-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { value: '10+', label: 'Formats supportés', icon: <Music2 size={18} /> },
              { value: '< 30s', label: 'Temps d\'analyse', icon: <Clock size={18} /> },
              { value: '8', label: 'Hot Cues auto', icon: <Target size={18} /> },
              { value: '3', label: 'Export DJ software', icon: <Download size={18} /> },
            ].map((stat, i) => (
              <div key={i}>
                <div className="text-accent-purple mb-2 flex justify-center">{stat.icon}</div>
                <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                <div className="text-sm text-slate-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial / Use case section */}
      <section className="relative z-10 px-6 max-w-6xl mx-auto pb-24">
        <h2 className="text-3xl font-bold text-white text-center mb-12">Conçu pour chaque DJ</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              title: 'DJ Club',
              desc: 'Prépare tes sets du week-end en quelques minutes. Analyse toute ta collection, organise par énergie, et exporte pour Rekordbox.',
              icon: <Headphones size={24} />,
              color: 'from-purple-600 to-pink-600',
            },
            {
              title: 'DJ Mobile',
              desc: 'Reçois des demandes de dernière minute ? Upload, analyse et ajoute à ton set en temps réel. Compatibilité BPM/Key garantie.',
              icon: <Radio size={24} />,
              color: 'from-blue-600 to-cyan-600',
            },
            {
              title: 'DJ Producer',
              desc: 'Analyse tes propres productions pour vérifier le BPM, la tonalité et la structure. Exporte avec des cue points pour le live.',
              icon: <Sparkles size={24} />,
              color: 'from-orange-600 to-red-600',
            },
          ].map((useCase, i) => (
            <div key={i} className="bg-bg-secondary border border-slate-800/50 rounded-2xl p-6 hover:border-accent-purple/30 transition-all group">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${useCase.color} flex items-center justify-center mb-4 text-white shadow-lg`}>
                {useCase.icon}
              </div>
              <h3 className="text-white font-bold text-lg mb-2">{useCase.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{useCase.desc}</p>
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
            {['BPM & Tonalité', 'Hot Cues auto', 'Export Rekordbox', 'Set Builder', 'Smart Crates'].map(f => (
              <div key={f} className="flex items-center gap-1.5 text-sm text-slate-300">
                <Check size={14} className="text-green-400" /> {f}
              </div>
            ))}
          </div>
          <Link href="/register" className="inline-flex items-center gap-2 px-8 py-3.5 bg-accent-purple hover:bg-accent-purple-light text-white font-semibold rounded-xl transition-all hover:shadow-xl hover:shadow-purple-900/50">
            Créer mon compte gratuit <ChevronRight size={18} />
          </Link>
        </div>
      </section>

      {/* Testimonials */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-accent-purple">Témoignages</span>
          <h2 className="text-3xl font-bold text-white mt-2">Les DJs adorent CueForge</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { name: 'DJ Marko', role: 'Résident Club', quote: 'CueForge a révolutionné ma préparation de sets. L\'analyse de tonalité est incroyablement précise et le Set Builder me fait gagner des heures.' },
            { name: 'Sarah B.', role: 'DJ Mobile & Mariages', quote: 'Le système de tags et de catégories est parfait pour organiser mes milliers de tracks. Je retrouve le bon morceau en secondes.' },
            { name: 'TechnoKid', role: 'DJ Producer', quote: 'L\'Energy Flow me permet de visualiser l\'énergie de mes sets avant de jouer. C\'est un game changer pour les festivals.' },
          ].map((t, i) => (
            <div key={i} className="bg-bg-secondary border border-slate-800/50 rounded-2xl p-6 hover:border-accent-purple/30 transition-all">
              <div className="flex items-center gap-1 mb-3">
                {[1,2,3,4,5].map(s => <Star key={s} size={14} className="fill-yellow-500 text-yellow-500" />)}
              </div>
              <p className="text-slate-300 text-sm leading-relaxed mb-4">&ldquo;{t.quote}&rdquo;</p>
              <div>
                <div className="text-sm font-semibold text-white">{t.name}</div>
                <div className="text-xs text-slate-500">{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-accent-cyan">FAQ</span>
          <h2 className="text-3xl font-bold text-white mt-2">Questions fréquentes</h2>
        </div>
        <div className="space-y-3">
          {[
            { q: 'CueForge est-il gratuit ?', a: 'Oui ! Le plan gratuit permet d\'analyser jusqu\'à 50 tracks par mois. Pour un usage intensif, le plan Pro offre des analyses illimitées et des fonctionnalités avancées.' },
            { q: 'Quels formats audio sont supportés ?', a: 'CueForge supporte MP3, WAV, FLAC, AIFF, AAC, OGG et M4A. Tes fichiers sont analysés dans le cloud et ne sont jamais partagés.' },
            { q: 'Puis-je exporter vers Rekordbox, Serato ou Traktor ?', a: 'Absolument ! CueForge exporte en XML Rekordbox, M3U, CSV, et prend aussi en charge l\'import depuis ces trois logiciels.' },
            { q: 'L\'analyse est-elle précise ?', a: 'Notre moteur d\'analyse utilise des algorithmes avancés pour détecter le BPM, la tonalité, l\'énergie et la structure des morceaux avec une précision professionnelle.' },
            { q: 'Mes fichiers sont-ils sécurisés ?', a: 'Tes fichiers audio sont chiffrés pendant le transfert et l\'analyse, puis supprimés de nos serveurs après traitement. Seules les métadonnées sont conservées.' },
          ].map((faq, i) => (
            <details key={i} className="group bg-bg-secondary border border-slate-800/50 rounded-xl overflow-hidden">
              <summary className="flex items-center justify-between px-5 py-4 cursor-pointer text-sm font-medium text-white hover:text-accent-purple transition-colors list-none">
                {faq.q}
                <ChevronRight size={16} className="text-slate-500 group-open:rotate-90 transition-transform" />
              </summary>
              <div className="px-5 pb-4 text-sm text-slate-400 leading-relaxed">
                {faq.a}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 bg-black/40 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-accent-purple rounded-lg flex items-center justify-center">
                  <Music2 size={18} className="text-white" />
                </div>
                <span className="text-xl font-bold text-white">CueForge</span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                L&apos;outil d&apos;analyse audio et de préparation de sets pour DJs professionnels.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3 uppercase tracking-wider">Produit</h4>
              <ul className="space-y-2">
                <li><Link href="/pricing" className="text-sm text-slate-400 hover:text-accent-purple transition-colors">Tarifs</Link></li>
                <li><Link href="/dashboard" className="text-sm text-slate-400 hover:text-accent-purple transition-colors">Dashboard</Link></li>
                <li><a href="#features" className="text-sm text-slate-400 hover:text-accent-purple transition-colors">Fonctionnalités</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3 uppercase tracking-wider">Légal</h4>
              <ul className="space-y-2">
                <li><Link href="/cgu" className="text-sm text-slate-400 hover:text-accent-purple transition-colors">CGU</Link></li>
                <li><a href="mailto:contact@cueforge.app" className="text-sm text-slate-400 hover:text-accent-purple transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3 uppercase tracking-wider">Communauté</h4>
              <ul className="space-y-2">
                <li><a href="https://twitter.com/cueforge" target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-accent-purple transition-colors">Twitter / X</a></li>
                <li><a href="https://discord.gg/cueforge" target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-accent-purple transition-colors">Discord</a></li>
                <li><a href="https://instagram.com/cueforge" target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-accent-purple transition-colors">Instagram</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-500">&copy; 2026 CueForge. Tous droits réservés.</p>
            <div className="flex items-center gap-4">
              <Link href="/cgu" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">CGU</Link>
              <Link href="/pricing" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Tarifs</Link>
              <a href="mailto:contact@cueforge.app" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Contact</a>
            </div>
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
