'use client';
import Link from 'next/link';
import { Star, ChevronRight, Users, Disc3, TrendingUp } from 'lucide-react';

interface Testimonial {
  id: number;
  name: string;
  role: string;
  djType: string;
  quote: string;
  initials: string;
  color: string;
}

const testimonials: Testimonial[] = [
  {
    id: 1,
    name: 'DJ Marko',
    role: 'Résident Club',
    djType: 'Techno',
    quote: 'CueForge a révolutionné ma préparation de sets. L\'analyse de tonalité est incroyablement précise et le Set Builder me fait gagner des heures chaque semaine.',
    initials: 'DM',
    color: 'from-purple-600 to-pink-600',
  },
  {
    id: 2,
    name: 'Sarah B.',
    role: 'DJ Mobile & Mariages',
    djType: 'Variété',
    quote: 'Le système de tags et de catégories est parfait pour organiser mes milliers de tracks. Je retrouve le bon morceau en secondes, même sous pression en live.',
    initials: 'SB',
    color: 'from-blue-600 to-cyan-600',
  },
  {
    id: 3,
    name: 'TechnoKid',
    role: 'DJ Producer',
    djType: 'Drum & Bass',
    quote: 'L\'Energy Flow me permet de visualiser l\'énergie de mes sets avant de jouer. C\'est un game changer pour les festivals et les sets mixtes.',
    initials: 'TK',
    color: 'from-orange-600 to-red-600',
  },
  {
    id: 4,
    name: 'Michel L.',
    role: 'DJ Radio',
    djType: 'House',
    quote: 'J\'utilise CueForge pour ma show radioative de 3h tous les vendredis. Les statistiques me permettent de balancer le flow d\'énergie parfaitement.',
    initials: 'ML',
    color: 'from-green-600 to-emerald-600',
  },
  {
    id: 5,
    name: 'Luna',
    role: 'DJ Club Alternative',
    djType: 'Hip-Hop',
    quote: 'Les cue points auto-générés sont précis au point où je dois à peine les ajuster. Ça me permet de me concentrer sur l\'art du DJing plutôt que sur la prep.',
    initials: 'LU',
    color: 'from-pink-600 to-rose-600',
  },
  {
    id: 6,
    name: 'Alex Stones',
    role: 'DJ Festival',
    djType: 'Trance',
    quote: 'Avant CueForge, j\'étais bloqué dans Rekordbox pendant des heures. Maintenant, une playlist de 200 tracks est analysée et taggée en 10 minutes.',
    initials: 'AS',
    color: 'from-indigo-600 to-purple-600',
  },
  {
    id: 7,
    name: 'Jordan M.',
    role: 'DJ Mariage & Événements',
    djType: 'Funk',
    quote: 'La recherche par genre et énergie est un sauveur. Quand le client demande plus d\'énergie, je trouve exactement ce qu\'il faut en deux clics.',
    initials: 'JM',
    color: 'from-yellow-600 to-orange-600',
  },
  {
    id: 8,
    name: 'Stella',
    role: 'DJ Résidente Club',
    djType: 'Deep House',
    quote: 'L\'export PDF des analyses est parfait pour partager avec mon crew. Tout le monde sait exactement ce qu\'on va jouer et pourquoi.',
    initials: 'ST',
    color: 'from-teal-600 to-cyan-600',
  },
  {
    id: 9,
    name: 'Chris D.',
    role: 'DJ Producer & Live PA',
    djType: 'Experimental',
    quote: 'Je vends des tracks en ligne et CueForge m\'aide à déterminer le BPM et la tonalité de mes productions avec précision scientifique.',
    initials: 'CD',
    color: 'from-red-600 to-pink-600',
  },
  {
    id: 10,
    name: 'Maya Neon',
    role: 'DJ Club & Radio',
    djType: 'Électro',
    quote: 'La roue Camelot intégrée me change la vie. Je peux maintenant créer des transitions harmoniques que mes clients adorent.',
    initials: 'MN',
    color: 'from-violet-600 to-purple-600',
  },
  {
    id: 11,
    name: 'Roberto',
    role: 'DJ Mobile Multi-Genre',
    djType: 'Reggaeton',
    quote: 'CueForge comprend tous les genres, même les trucs obscurs. L\'API de reconnaissance est vraiment impressionnante, c\'est du pro level.',
    initials: 'RB',
    color: 'from-lime-600 to-green-600',
  },
  {
    id: 12,
    name: 'Emma Sky',
    role: 'DJ Festival & Club',
    djType: 'Techno Minimal',
    quote: 'Les statistiques de ma collection m\'ont permis de mieux comprendre mes préférences musicales. J\'ai diversifié ma collection et mes sets sont meilleurs.',
    initials: 'ES',
    color: 'from-sky-600 to-blue-600',
  },
];

export default function TestimonialsPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-accent-purple rounded-lg flex items-center justify-center">
            <Disc3 size={18} className="text-white" />
          </div>
          <span className="text-xl font-bold text-white">CueForge</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className="px-4 py-2 text-slate-300 hover:text-white text-sm font-medium transition-colors">
            Tarifs
          </Link>
          <Link href="/login" className="px-4 py-2 text-slate-300 hover:text-white text-sm font-medium transition-colors">
            Connexion
          </Link>
          <Link href="/register" className="px-4 py-2 bg-accent-purple hover:bg-accent-purple-light text-white text-sm font-semibold rounded-lg transition-all">
            Commencer gratuitement
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 text-center px-6 pt-20 pb-16 max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight mb-6">
          Ce que les DJs disent de{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-purple to-accent-pink">
            CueForge
          </span>
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto">
          Découvre comment des milliers de DJs du monde entier utilisent CueForge pour préparer leurs sets plus vite et mieux.
        </p>
      </section>

      {/* Testimonials Grid */}
      <section className="relative z-10 px-6 max-w-6xl mx-auto pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.id}
              className="bg-bg-secondary border border-slate-800/50 rounded-2xl p-6 hover:border-accent-purple/30 transition-all group"
            >
              {/* Stars */}
              <div className="flex items-center gap-1 mb-4">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={14}
                    className="fill-yellow-500 text-yellow-500"
                  />
                ))}
              </div>

              {/* Quote */}
              <p className="text-slate-300 text-sm leading-relaxed mb-6 line-clamp-4">
                &ldquo;{testimonial.quote}&rdquo;
              </p>

              {/* Author */}
              <div className="flex items-center gap-3 pt-4 border-t border-slate-700/50">
                <div
                  className={`w-12 h-12 rounded-full bg-gradient-to-br ${testimonial.color} flex items-center justify-center text-white font-bold text-sm`}
                >
                  {testimonial.initials}
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">
                    {testimonial.name}
                  </div>
                  <div className="text-xs text-slate-400">
                    {testimonial.role}
                  </div>
                  <div className="text-xs text-accent-purple font-medium">
                    {testimonial.djType}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative z-10 px-6 max-w-4xl mx-auto pb-24">
        <div className="bg-gradient-to-br from-accent-purple/10 to-accent-pink/5 rounded-2xl border border-accent-purple/20 p-8">
          <h2 className="text-2xl font-bold text-white text-center mb-12">
            Chiffres clés
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <div className="text-accent-purple mb-2 flex justify-center">
                <Users size={24} />
              </div>
              <div className="text-3xl font-bold text-white mb-1">+2000</div>
              <div className="text-sm text-slate-400">DJs actifs</div>
            </div>
            <div>
              <div className="text-accent-purple mb-2 flex justify-center">
                <Disc3 size={24} />
              </div>
              <div className="text-3xl font-bold text-white mb-1">500K+</div>
              <div className="text-sm text-slate-400">Tracks analysées</div>
            </div>
            <div>
              <div className="text-accent-purple mb-2 flex justify-center">
                <Star size={24} />
              </div>
              <div className="text-3xl font-bold text-white mb-1">98%</div>
              <div className="text-sm text-slate-400">De satisfaction</div>
            </div>
            <div>
              <div className="text-accent-purple mb-2 flex justify-center">
                <TrendingUp size={24} />
              </div>
              <div className="text-3xl font-bold text-white mb-1">1 clic</div>
              <div className="text-sm text-slate-400">Export multi-format</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 px-6 pb-24">
        <div className="max-w-2xl mx-auto bg-gradient-to-br from-accent-purple/10 to-accent-pink/5 rounded-2xl border border-accent-purple/20 p-10 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Rejoins la communauté
          </h2>
          <p className="text-slate-400 mb-8">
            Deviens l\'un des milliers de DJs qui utilisent CueForge pour préparer leurs sets plus vite et mieux.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-accent-purple hover:bg-accent-purple-light text-white font-semibold rounded-xl transition-all hover:shadow-xl hover:shadow-purple-900/50"
          >
            Commencer gratuitement <ChevronRight size={18} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 bg-black/40 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-accent-purple rounded-lg flex items-center justify-center">
                  <Disc3 size={18} className="text-white" />
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
                <li>
                  <Link href="/pricing" className="text-sm text-slate-400 hover:text-accent-purple transition-colors">
                    Tarifs
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard" className="text-sm text-slate-400 hover:text-accent-purple transition-colors">
                    Dashboard
                  </Link>
                </li>
                <li>
                  <a href="/" className="text-sm text-slate-400 hover:text-accent-purple transition-colors">
                    Fonctionnalités
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3 uppercase tracking-wider">Légal</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/cgu" className="text-sm text-slate-400 hover:text-accent-purple transition-colors">
                    CGU
                  </Link>
                </li>
                <li>
                  <a href="mailto:contact@cueforge.app" className="text-sm text-slate-400 hover:text-accent-purple transition-colors">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3 uppercase tracking-wider">Communauté</h4>
              <ul className="space-y-2">
                <li>
                  <a href="https://twitter.com/cueforge" target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-accent-purple transition-colors">
                    Twitter / X
                  </a>
                </li>
                <li>
                  <a href="https://discord.gg/cueforge" target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-accent-purple transition-colors">
                    Discord
                  </a>
                </li>
                <li>
                  <a href="https://instagram.com/cueforge" target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-accent-purple transition-colors">
                    Instagram
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-500">&copy; 2026 CueForge. Tous droits réservés.</p>
            <div className="flex items-center gap-4">
              <Link href="/cgu" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                CGU
              </Link>
              <Link href="/pricing" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                Tarifs
              </Link>
              <a href="mailto:contact@cueforge.app" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
