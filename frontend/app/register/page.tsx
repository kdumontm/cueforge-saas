'use client';
import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Music2, Eye, EyeOff, Loader2, Check, X } from 'lucide-react';
import { register, login } from '@/lib/api';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pwdStrong = password.length >= 8;
  const pwdMatch = password === confirm && confirm.length > 0;

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setLoading(true);
      // Detect provider from URL params (Spotify uses 'state' param)
      const provider = params.has('state') ? 'spotify' : 'google';
      const oauthUrl = `${API_URL}/auth/oauth/${provider}`;
      fetch(oauthUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirect_uri: `${window.location.origin}/register` }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.access_token) {
            localStorage.setItem('trackcue_token', data.access_token);
            if (data.refresh_token) localStorage.setItem('trackcue_refresh', data.refresh_token);
            router.push('/dashboard');
          } else {
            setError(data.detail || 'OAuth échoué');
            setLoading(false);
          }
        })
        .catch(() => { setError('Erreur OAuth'); setLoading(false); });
      // Clean URL
      window.history.replaceState({}, '', '/register');
    }
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) { setError('Le nom d\'utilisateur est requis'); return; }
    if (!pwdMatch) { setError('Les mots de passe ne correspondent pas'); return; }
    if (!pwdStrong) { setError('Mot de passe trop court (min. 8 caractères)'); return; }
    setLoading(true);
    setError('');
    try {
      await register(email, password, username);
      await login(username, password);
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Inscription échouée');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-accent-purple opacity-10 blur-[100px] rounded-full" />
      </div>
      <div className="w-full max-w-md relative z-10 animate-slide-up">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-accent-purple rounded-xl flex items-center justify-center">
              <Music2 size={20} className="text-white" />
            </div>
            <span className="text-2xl font-bold text-white">TrackCue</span>
          </Link>
          <p className="text-slate-400 mt-3 text-sm">Crée ton compte gratuit en 30 secondes.</p>
        </div>
        <div className="bg-bg-secondary border border-slate-800/60 rounded-2xl p-8">
          <h1 className="text-xl font-bold text-white mb-6">Créer un compte</h1>
          <div className="flex gap-4 mb-6">
            {['BPM auto', 'Cue points', 'Export XML'].map(f => (
              <div key={f} className="flex items-center gap-1 text-xs text-slate-400">
                <Check size={12} className="text-green-400" /> {f}
              </div>
            ))}
          </div>
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm" role="alert">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-1.5">
                Nom d&apos;utilisateur <span className="text-slate-500 text-xs">(utilisé pour te connecter)</span>
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="ton_pseudo"
                required
                autoComplete="username"
                autoFocus
                aria-label="Nom d'utilisateur"
                aria-required="true"
                className="w-full px-4 py-3 bg-bg-primary border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm transition-colors min-h-[44px]"
              />
            </div>
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
                Email <span className="text-slate-500 text-xs">(pour récupérer ton compte)</span>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ton@email.com"
                required
                autoComplete="email"
                aria-label="Email"
                aria-required="true"
                className="w-full px-4 py-3 bg-bg-primary border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm transition-colors min-h-[44px]"
              />
            </div>
            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">Mot de passe</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Minimum 8 caractères"
                  required
                  aria-label="Mot de passe"
                  aria-required="true"
                  aria-describedby="pwdStrengthHelp"
                  className="w-full px-4 py-3 bg-bg-primary border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm pr-12 transition-colors min-h-[44px]"
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  aria-label={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <PasswordStrengthMeter password={password} />
              {password.length > 0 && (
                <div id="pwdStrengthHelp" className={`mt-1 text-xs flex items-center gap-1 ${pwdStrong ? 'text-green-400' : 'text-orange-400'}`}>
                  {pwdStrong ? <Check size={11} /> : <X size={11} />} {pwdStrong ? 'Mot de passe valide' : 'Trop court (min. 8 caractères)'}
                </div>
              )}
            </div>
            {/* Confirm */}
            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-slate-300 mb-1.5">Confirmer le mot de passe</label>
              <input
                id="confirm"
                type={showPwd ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                aria-label="Confirmer le mot de passe"
                aria-required="true"
                aria-describedby="pwdMatchHelp"
                className="w-full px-4 py-3 bg-bg-primary border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm transition-colors min-h-[44px]"
              />
              {confirm.length > 0 && (
                <div id="pwdMatchHelp" className={`mt-1 text-xs flex items-center gap-1 ${pwdMatch ? 'text-green-400' : 'text-red-400'}`}>
                  {pwdMatch ? <Check size={11} /> : <X size={11} />} {pwdMatch ? 'Les mots de passe correspondent' : 'Ne correspondent pas'}
                </div>
              )}
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-accent-purple hover:bg-accent-purple-light disabled:opacity-50 text-white font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-purple-900/40 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (<><Loader2 size={18} className="animate-spin" /> Création...</>) : 'Créer mon compte'}
            </button>
          </form>

          {/* OAuth separator */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700/60" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-bg-secondary px-3 text-slate-500">ou continuer avec</span>
            </div>
          </div>

          {/* OAuth buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
                if (!clientId) { setError('Google OAuth non configuré'); return; }
                const redirect = `${window.location.origin}/register`;
                window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=openid%20email%20profile&access_type=offline`;
              }}
              className="flex items-center justify-center gap-2 py-3 bg-bg-primary border border-slate-700 rounded-xl text-slate-300 text-sm font-medium hover:bg-slate-800/80 hover:border-slate-600 transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Google
            </button>
            <button
              type="button"
              onClick={() => {
                const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
                if (!clientId) { setError('Spotify OAuth non configuré'); return; }
                const redirect = `${window.location.origin}/register`;
                window.location.href = `https://accounts.spotify.com/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=user-read-email%20user-read-private`;
              }}
              className="flex items-center justify-center gap-2 py-3 bg-bg-primary border border-slate-700 rounded-xl text-slate-300 text-sm font-medium hover:bg-slate-800/80 hover:border-slate-600 transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#1DB954"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
              Spotify
            </button>
          </div>
        </div>
        <p className="text-center text-slate-500 text-sm mt-6">
          Déjà un compte ?{' '}
          <Link href="/login" className="text-accent-purple-light hover:text-accent-purple font-medium transition-colors">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
