import { ArrowLeft, Music } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md text-center">
        {/* Icône musicale stylisée */}
        <div className="flex items-center justify-center mb-8">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-full blur-2xl" />
            <Music size={48} className="text-purple-400 relative" />
          </div>
        </div>

        {/* Titre 404 */}
        <h1 className="text-6xl sm:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-4">
          404
        </h1>

        {/* Message sympa pour les DJs */}
        <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] mb-3">
          Ce morceau n'est pas dans ta bibliothèque
        </h2>

        <p className="text-[var(--text-muted)] text-sm sm:text-base mb-8 leading-relaxed">
          La page que tu cherches n'existe pas. Peut-être qu'elle a été archivée, ou tu as tapé l'URL en twerkant sur le deck.
        </p>

        {/* Boutons d'action */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Retour au dashboard</span>
          </Link>
          <Link
            href="/"
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] text-[var(--text-primary)] font-semibold transition-colors cursor-pointer"
          >
            <span>Accueil</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
