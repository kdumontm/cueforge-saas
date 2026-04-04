'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Music2, Eye, EyeOff, Loader2, Check, X } from 'lucide-react';
import { register, login } from '@/lib/api';

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
            <span className="text-2xl font-bold text-white">CueForge</span>
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
            <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Nom d&apos;utilisateur <span className="text-slate-500 text-xs">(utilisé pour te connecter)</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="ton_pseudo"
                required
                autoComplete="username"
                className="w-full px-4 py-3 bg-bg-primary border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm transition-colors"
              />
            </div>
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Email <span className="text-slate-500 text-xs">(pour récupérer ton compte)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ton@email.com"
                required
                autoComplete="email"
                className="w-full px-4 py-3 bg-bg-primary border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm transition-colors"
              />
            </div>
            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Minimum 8 caractères"
                  required
                  className="w-full px-4 py-3 bg-bg-primary border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm pr-12 transition-colors"
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {password.length > 0 && (
                <div className={`mt-1 text-xs flex items-center gap-1 ${pwdStrong ? 'text-green-400' : 'text-orange-400'}`}>
                  {pwdStrong ? <Check size={11} /> : <X size={11} />} {pwdStrong ? 'Mot de passe valide' : 'Trop court (min. 8 caractères)'}
                </div>
              )}
            </div>
            {/* Confirm */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirmer le mot de passe</label>
              <input
                type={showPwd ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 bg-bg-primary border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm transition-colors"
              />
              {confirm.length > 0 && (
                <div className={`mt-1 text-xs flex items-center gap-1 ${pwdMatch ? 'text-green-400' : 'text-red-400'}`}>
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
        </div>
        <p className="text-center text-slate-500 text-sm mt-6">
          Déjà un compte ?{' '}
          <Link href="/login" className="text-accent-purple-light hover:text-accent-purple font-medium transition-colors">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
