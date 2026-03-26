'use client';
import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { Music2, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { forgotPassword } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

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
          {sent ? (
            <div className="text-center space-y-4">
              <CheckCircle2 size={48} className="text-green-400 mx-auto" />
              <h2 className="text-xl font-bold text-white">Email envoyé !</h2>
              <p className="text-slate-400 text-sm">
                Si un compte existe pour <strong className="text-slate-300">{email}</strong>,
                tu recevras un lien de réinitialisation dans quelques minutes.
              </p>
              <Link href="/login" className="inline-flex items-center gap-2 text-accent-purple-light hover:text-accent-purple text-sm font-medium transition-colors">
                <ArrowLeft size={16} /> Retour à la connexion
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <Link href="/login" className="text-slate-500 hover:text-slate-300 transition-colors">
                  <ArrowLeft size={20} />
                </Link>
                <h1 className="text-xl font-bold text-white">Mot de passe oublié</h1>
              </div>
              <p className="text-slate-400 text-sm mb-6">
                Entre ton email et on t&apos;envoie un lien pour réinitialiser ton mot de passe.
              </p>
              {error && (
                <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="ton@email.com"
                    required
                    className="w-full px-4 py-3 bg-bg-primary border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-accent-purple hover:bg-accent-purple-light disabled:opacity-50 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <><Loader2 size={18} className="animate-spin" /> Envoi...</> : 'Envoyer le lien'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
