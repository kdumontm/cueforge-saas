'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Music2, Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import { login } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNeedsVerification(false);
    setResendDone(false);
    try {
      await login(username, password);
      router.push('/dashboard');
    } catch (err: unknown) {
      const e = err as Error & { status?: number };
      if (e.status === 403) {
        setNeedsVerification(true);
        // Pré-remplir l'email si le user a saisi directement son email
        if (username.includes('@')) setResendEmail(username);
        setError('Email non vérifié. Entre ton email ci-dessous pour recevoir un nouveau lien.');
      } else {
        setError(e.message || 'Connexion échouée');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification(e: FormEvent) {
    e.preventDefault();
    setResendLoading(true);
    try {
      await fetch(`${API_URL}/auth/resend-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail }),
      });
    } catch {
      // silencieux — l'API ne révèle pas si l'email existe
    } finally {
      setResendLoading(false);
      setResendDone(true);
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-accent-purple opacity-10 blur-[100px] rounded-full" />
      </div>
      <div className="w-full max-w-md relative z-10 animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-accent-purple rounded-xl flex items-center justify-center">
              <Music2 size={20} className="text-white" />
            </div>
            <span className="text-2xl font-bold text-white">CueForge</span>
          </Link>
          <p className="text-slate-400 mt-3 text-sm">Bienvenue ! Connecte-toi pour continuer.</p>
        </div>
        {/* Card */}
        <div className="bg-bg-secondary border border-slate-800/60 rounded-2xl p-8">
          <h1 className="text-xl font-bold text-white mb-6">Connexion</h1>
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Panneau renvoi email de vérification */}
          {needsVerification && !resendDone && (
            <form onSubmit={handleResendVerification} className="mb-4 p-4 bg-slate-800/50 border border-slate-700/60 rounded-xl space-y-3">
              <p className="text-slate-300 text-sm font-medium flex items-center gap-2">
                <Mail size={15} className="text-accent-purple-light" />
                Renvoyer le lien de vérification
              </p>
              <input
                type="email"
                value={resendEmail}
                onChange={e => setResendEmail(e.target.value)}
                placeholder="ton@email.com"
                required
                className="w-full px-3 py-2.5 bg-bg-primary border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 text-sm transition-colors"
              />
              <button
                type="submit"
                disabled={resendLoading}
                className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {resendLoading ? (
                  <><Loader2 size={15} className="animate-spin" /> Envoi...</>
                ) : 'Envoyer le lien'}
              </button>
            </form>
          )}
          {resendDone && (
            <div className="mb-4 px-4 py-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
              Lien envoyé ! Vérifie ta boîte de réception (et les spams).
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Pseudo
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="ton pseudo"
                required
                autoComplete="username"
                className="w-full px-4 py-3 bg-bg-primary border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 bg-bg-primary border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm pr-12 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-accent-purple hover:bg-accent-purple-light disabled:opacity-50 text-white font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-purple-900/40 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 size={18} className="animate-spin" /> Connexion...</>
              ) : 'Se connecter'}
            </button>
          </form>
        </div>
        <p className="text-center text-slate-500 text-sm mt-6">
          Pas encore de compte?{' '}
          <Link href="/register" className="text-accent-purple-light hover:text-accent-purple font-medium transition-colors">
            S&apos;inscrire gratuitement
          </Link>
        </p>
      </div>
    </div>
  );
}
