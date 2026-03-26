'use client';
import { useState, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Music2, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { resetPassword } from '@/lib/api';

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas'); return; }
    if (password.length < 8) { setError('Minimum 8 caractères'); return; }
    setLoading(true);
    setError('');
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lien invalide ou expiré');
    } finally {
      setLoading(false);
    }
  }

  if (!token) return (
    <p className="text-red-400 text-sm text-center">Lien invalide. <Link href="/forgot-password" className="underline">Recommencer</Link></p>
  );

  return done ? (
    <div className="text-center space-y-4">
      <CheckCircle2 size={48} className="text-green-400 mx-auto" />
      <h2 className="text-xl font-bold text-white">Mot de passe mis à jour !</h2>
      <p className="text-slate-400 text-sm">Redirection vers la connexion...</p>
    </div>
  ) : (
    <>
      <h1 className="text-xl font-bold text-white mb-6">Nouveau mot de passe</h1>
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Nouveau mot de passe</label>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimum 8 caractères"
              required
              className="w-full px-4 py-3 bg-bg-primary border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm pr-12"
            />
            <button type="button" onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirmer</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full px-4 py-3 bg-bg-primary border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm"
          />
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-3 bg-accent-purple hover:bg-accent-purple-light disabled:opacity-50 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2">
          {loading ? <><Loader2 size={18} className="animate-spin" /> Mise à jour...</> : 'Enregistrer'}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-accent-purple rounded-xl flex items-center justify-center">
              <Music2 size={20} className="text-white" />
            </div>
            <span className="text-2xl font-bold text-white">CueForge</span>
          </Link>
        </div>
        <div className="bg-bg-secondary border border-slate-800/60 rounded-2xl p-8">
          <Suspense fallback={<div className="text-slate-400 text-sm text-center">Chargement...</div>}>
            <ResetForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
