'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, AlertCircle, Loader2, Zap } from 'lucide-react';
import Link from 'next/link';
import {
  getPlans,
  getCurrentPlan,
  getUsage,
  subscribe,
  getBillingPortal,
  type Plan,
  type UsageStats,
  type CurrentPlan,
} from '@/lib/api';

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><Loader2 className="w-8 h-8 text-purple-400 animate-spin" /></div>}>
      <BillingContent />
    </Suspense>
  );
}

function BillingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<CurrentPlan | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    const token = localStorage.getItem('cueforge_token');
    if (!token) {
      router.push('/login');
      return;
    }
    loadData();

    // Check for success/cancelled params
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');
    if (success === 'true') {
      setMessage({ type: 'success', text: 'Abonnement activé avec succès!' });
      window.history.replaceState({}, '', '/billing');
    } else if (canceled === 'true') {
      setMessage({ type: 'info', text: 'Paiement annulé.' });
      window.history.replaceState({}, '', '/billing');
    }
  }, [router, searchParams]);

  async function loadData() {
    try {
      const [plansData, currentData, usageData] = await Promise.all([
        getPlans(),
        getCurrentPlan(),
        getUsage(),
      ]);
      setPlans(plansData);
      setCurrentPlan(currentData);
      setUsage(usageData);
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur lors du chargement des données' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubscribe(planId: string) {
    setSubscribing(true);
    try {
      const { checkout_url } = await subscribe(planId, interval);
      window.location.href = checkout_url;
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur lors de la création de la session de paiement' });
      setSubscribing(false);
    }
  }

  async function handleManageBilling() {
    setOpeningPortal(true);
    try {
      const { url } = await getBillingPortal();
      window.location.href = url;
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur lors de l\'ouverture du portail de facturation' });
      setOpeningPortal(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  const activePlanId = currentPlan?.plan.id;
  const renewalDate = currentPlan?.current_period_end ? new Date(currentPlan.current_period_end).toLocaleDateString('fr-FR') : null;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center gap-4">
          <Link href="/dashboard" className="p-2 hover:bg-[var(--bg-secondary)] rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Facturation & Abonnement</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">Gérez votre plan et votre abonnement</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Messages */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg border flex items-start gap-3 ${
              message.type === 'success'
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : message.type === 'error'
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
            }`}
          >
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
            <span>{message.text}</span>
          </div>
        )}

        {/* Current Plan Section */}
        {currentPlan && (
          <div className="mb-8 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-8">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold mb-2">Plan actuel</h2>
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-bold">{currentPlan.plan.name}</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    currentPlan.plan.id === 'free'
                      ? 'bg-slate-700/50 text-slate-300'
                      : currentPlan.plan.id === 'pro'
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                        : 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                  }`}>
                    {currentPlan.subscription_status || 'Gratuit'}
                  </span>
                </div>
              </div>
              {currentPlan.subscription_status && renewalDate && (
                <div className="text-right">
                  <p className="text-sm text-[var(--text-secondary)]">Renouvellement</p>
                  <p className="text-lg font-semibold">{renewalDate}</p>
                </div>
              )}
            </div>

            {/* Usage Stats */}
            {usage && (
              <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[var(--bg-primary)] rounded-lg p-4">
                  <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wider mb-2">Pistes aujourd'hui</p>
                  <p className="text-2xl font-bold">
                    {usage.tracks_today} <span className="text-sm text-[var(--text-secondary)] font-normal">/ {usage.tracks_limit}</span>
                  </p>
                </div>
                <div className="bg-[var(--bg-primary)] rounded-lg p-4">
                  <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wider mb-2">Points de cue</p>
                  <p className="text-2xl font-bold">
                    {usage.cue_points_used} <span className="text-sm text-[var(--text-secondary)] font-normal">/ {usage.cue_points_limit}</span>
                  </p>
                </div>
                <div className="bg-[var(--bg-primary)] rounded-lg p-4">
                  <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wider mb-2">Stockage</p>
                  <p className="text-2xl font-bold">
                    {(usage.storage_used_mb / 1024).toFixed(1)}
                    <span className="text-sm text-[var(--text-secondary)] font-normal">GB / {usage.storage_limit_gb}GB</span>
                  </p>
                </div>
                <div className="bg-[var(--bg-primary)] rounded-lg p-4">
                  <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wider mb-2">Membres</p>
                  <p className="text-2xl font-bold">
                    {usage.members_count} <span className="text-sm text-[var(--text-secondary)] font-normal">/ {usage.members_limit}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Manage Button */}
            {currentPlan.subscription_status && (
              <div className="mt-6">
                <button
                  onClick={handleManageBilling}
                  disabled={openingPortal}
                  className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2"
                >
                  {openingPortal ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Chargement...
                    </>
                  ) : (
                    <>Gérer mon abonnement</>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Plans Section */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Plans disponibles</h2>
            <div className="flex gap-2 bg-[var(--bg-secondary)] p-1 rounded-lg border border-[var(--border-subtle)]">
              <button
                onClick={() => setInterval('monthly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  interval === 'monthly'
                    ? 'bg-[var(--bg-primary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Mensuel
              </button>
              <button
                onClick={() => setInterval('yearly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  interval === 'yearly'
                    ? 'bg-[var(--bg-primary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Annuel
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {plans.map(plan => {
              const isActive = plan.id === activePlanId;
              const price = interval === 'monthly' ? plan.price_monthly : plan.price_yearly;
              const perMonth = interval === 'yearly' ? (price / 12).toFixed(2) : null;

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl border transition-all overflow-hidden flex flex-col ${
                    isActive
                      ? 'border-blue-500/50 bg-[var(--bg-card)] ring-1 ring-blue-500/20'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-subtle)]/80'
                  }`}
                >
                  {isActive && (
                    <div className="absolute top-0 right-0 px-4 py-2 bg-blue-600/20 text-blue-400 text-xs font-semibold rounded-bl-lg">
                      Plan actuel
                    </div>
                  )}

                  <div className="p-8 flex-1 flex flex-col">
                    <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>

                    <div className="mb-6">
                      <span className="text-4xl font-bold">{price.toFixed(0)}€</span>
                      <span className="text-[var(--text-secondary)] text-sm ml-2">
                        {interval === 'monthly' ? '/mois' : '/an'}
                      </span>
                      {perMonth && (
                        <p className="text-xs text-[var(--text-secondary)] mt-1">
                          {perMonth}€/mois si facturé annuellement
                        </p>
                      )}
                    </div>

                    <div className="space-y-3 mb-8 flex-1">
                      <div className="flex items-start gap-2">
                        <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{plan.max_tracks_per_day} pistes/jour</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{plan.max_cue_points} points de cue</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{plan.max_storage_gb}GB stockage</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                        <span className="text-sm">Jusqu'à {plan.max_members} membres</span>
                      </div>
                      {plan.features?.['advanced_analytics'] && (
                        <div className="flex items-start gap-2">
                          <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                          <span className="text-sm">Analyses avancées</span>
                        </div>
                      )}
                      {plan.features?.['priority_support'] && (
                        <div className="flex items-start gap-2">
                          <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                          <span className="text-sm">Support prioritaire</span>
                        </div>
                      )}
                      {plan.features?.['api_access'] && (
                        <div className="flex items-start gap-2">
                          <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                          <span className="text-sm">Accès API</span>
                        </div>
                      )}
                    </div>

                    {isActive ? (
                      <button
                        disabled
                        className="w-full py-3 bg-slate-700/50 text-slate-300 font-semibold rounded-xl transition-all cursor-default"
                      >
                        Plan actuel
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSubscribe(plan.id)}
                        disabled={subscribing}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
                      >
                        {subscribing ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Chargement...
                          </>
                        ) : (
                          <>
                            <Zap size={16} />
                            Passer à ce plan
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-12 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-8">
          <h3 className="text-lg font-bold mb-6">Questions fréquentes</h3>
          <div className="space-y-4">
            <details className="group">
              <summary className="cursor-pointer flex items-center justify-between font-medium text-[var(--text-primary)] hover:text-blue-400 transition-colors">
                <span>Puis-je changer de plan à tout moment?</span>
                <span className="transition-transform group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-3 text-[var(--text-secondary)] text-sm">
                Oui, vous pouvez passer à un plan supérieur ou inférieur à tout moment. Les changements prennent effet immédiatement.
              </p>
            </details>
            <details className="group">
              <summary className="cursor-pointer flex items-center justify-between font-medium text-[var(--text-primary)] hover:text-blue-400 transition-colors">
                <span>Comment fonctionne le remboursement?</span>
                <span className="transition-transform group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-3 text-[var(--text-secondary)] text-sm">
                Vous pouvez annuler votre abonnement à tout moment. Votre accès sera maintenu jusqu'à la fin de votre période de facturation en cours.
              </p>
            </details>
            <details className="group">
              <summary className="cursor-pointer flex items-center justify-between font-medium text-[var(--text-primary)] hover:text-blue-400 transition-colors">
                <span>Quel est le délai de renouvellement?</span>
                <span className="transition-transform group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-3 text-[var(--text-secondary)] text-sm">
                Les abonnements mensuels sont renouvelés le même jour chaque mois. Les abonnements annuels sont renouvelés le même jour chaque année.
              </p>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
