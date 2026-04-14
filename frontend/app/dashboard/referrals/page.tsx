'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, Send, Users, Gift } from 'lucide-react';
import { useLang } from '@/components/LangProvider';
import { tr } from '@/lib/i18n';
import Link from 'next/link';

interface ReferralCode {
  referral_code: string;
  referral_link: string;
}

interface ReferralStats {
  total_invites: number;
  total_signups: number;
  total_converted: number;
  rewards_earned: number;
}

interface InviteResponse {
  success: boolean;
  message: string;
  referral_code: string;
}

export default function ReferralsPage() {
  const { lang } = useLang();
  const [code, setCode] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

  function getToken() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('trackcue_token');
  }

  async function apiCall<T = any>(path: string, opts: any = {}): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = { ...(opts.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (opts.body && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    if (res.status === 204) return {} as T;
    return res.json();
  }

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [codeRes, statsRes] = await Promise.all([
          apiCall<ReferralCode>('/referrals/my-code'),
          apiCall<ReferralStats>('/referrals/stats'),
        ]);
        setCode(codeRes.referral_code);
        setLink(codeRes.referral_link);
        setStats(statsRes);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    try {
      setInviting(true);
      setError(null);
      setSuccess(null);

      const res = await apiCall<InviteResponse>('/referrals/invite', {
        method: 'POST',
        body: { email },
      });

      setSuccess(res.message);
      setEmail('');

      // Reload stats
      const newStats = await apiCall<ReferralStats>('/referrals/stats');
      setStats(newStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'invitation');
    } finally {
      setInviting(false);
    }
  }

  function handleCopy() {
    if (link) {
      navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">Inviter des amis</h1>
        <p className="text-[var(--text-muted)] mt-2">Gagnez des récompenses en invitant tes amis à TrackCue</p>
      </div>

      {/* Error / Success Messages */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-500 text-sm">
          {success}
        </div>
      )}

      {/* Referral Code Section */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Ton code de parrainage</h2>
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">Partage ce code ou ce lien avec tes amis :</p>

          {/* Code */}
          <div className="flex items-center gap-2 p-4 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-subtle)]">
            <code className="flex-1 font-mono text-lg font-bold text-[var(--accent)]">{code}</code>
            <button
              onClick={handleCopy}
              className="p-2 rounded-lg bg-[var(--bg-hover)] hover:bg-blue-600/20 text-[var(--text-muted)] hover:text-blue-500 transition-colors"
              title="Copier"
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>

          {/* Link */}
          <div className="flex items-center gap-2 p-4 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-subtle)]">
            <input
              type="text"
              value={link || ''}
              readOnly
              className="flex-1 bg-transparent outline-none text-sm text-[var(--text-secondary)] font-mono"
            />
            <button
              onClick={handleCopy}
              className="p-2 rounded-lg bg-[var(--bg-hover)] hover:bg-blue-600/20 text-[var(--text-muted)] hover:text-blue-500 transition-colors"
              title="Copier le lien"
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* Invite by Email */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Envoyer une invitation</h2>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            placeholder="adresse@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 px-4 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] text-[var(--text-primary)] outline-none focus:border-blue-500 transition-colors"
            disabled={inviting}
          />
          <button
            type="submit"
            disabled={inviting || !email}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Send size={16} />
            {inviting ? 'Envoi...' : 'Envoyer'}
          </button>
        </form>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg p-4">
            <p className="text-xs text-[var(--text-muted)] mb-1">Invitations envoyées</p>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.total_invites}</p>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg p-4">
            <p className="text-xs text-[var(--text-muted)] mb-1">Inscriptions</p>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.total_signups}</p>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg p-4">
            <p className="text-xs text-[var(--text-muted)] mb-1">Conversions (Pro/Unlimited)</p>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.total_converted}</p>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg p-4">
            <p className="text-xs text-[var(--text-muted)] mb-1">Récompenses gagnées</p>
            <p className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-1">
              <Gift size={16} /> {stats.rewards_earned}
            </p>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-600/10 border border-blue-500/20 rounded-lg p-4 space-y-2">
        <p className="text-sm font-semibold text-blue-400">Comment ça marche ?</p>
        <ul className="text-sm text-[var(--text-secondary)] space-y-1">
          <li>✓ Partage ton code ou lien d'invitation</li>
          <li>✓ Tes amis s'inscrivent en utilisant ton code</li>
          <li>✓ Quand ils upgrade vers un plan payant, tu gagnes 1 mois gratuit</li>
          <li>✓ Pas de limite sur le nombre de récompenses !</li>
        </ul>
      </div>
    </div>
  );
}
