'use client';

import { AlertCircle, RotateCcw, Home } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Error boundary caught:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md text-center">
        {/* Icône d'erreur stylisée */}
        <div className="flex items-center justify-center mb-8">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-full blur-2xl" />
            <AlertCircle size={48} className="text-red-400 relative" />
          </div>
        </div>

        {/* Titre d'erreur */}
        <h1 className="text-4xl sm:text-5xl font-bold text-[var(--text-primary)] mb-3">
          Oups !
        </h1>

        <h2 className="text-xl sm:text-2xl font-semibold text-[var(--text-secondary)] mb-4">
          Un bug dans le mix
        </h2>

        <p className="text-[var(--text-muted)] text-sm sm:text-base mb-2 leading-relaxed">
          Quelque chose s'est mal passé de notre côté. L'équipe technique a été alertée et enquête sur le problème.
        </p>

        {error.message && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg mb-6">
            <p className="text-xs text-red-400 font-mono break-words">
              {error.message}
            </p>
          </div>
        )}

        {/* Boutons d'action */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors cursor-pointer"
          >
            <RotateCcw size={16} />
            <span>Réessayer</span>
          </button>
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] text-[var(--text-primary)] font-semibold transition-colors cursor-pointer"
          >
            <Home size={16} />
            <span>Dashboard</span>
          </Link>
        </div>

        <p className="text-[10px] text-[var(--text-muted)] mt-6">
          Code d'erreur: {error.digest || 'UNKNOWN'}
        </p>
      </div>
    </div>
  );
}
