// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { Check, X, Zap, Crown, Download, ArrowLeft, Sparkles, Music2 } from 'lucide-react';
import Link from 'next/link';
import { getPublicPageSettings } from '@/lib/api';

const PLANS = [
  {
    name: 'Free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: 'Pour découvrir CueForge',
    features: [
      { text: '5 analyses par jour', included: true },
      { text: 'BPM, Key, Energy', included: true },
      { text: 'Hot Cues automatiques', included: true },
      { text: 'Export Rekordbox XML', included: true },
      { text: 'Détection de genre', included: true },
      { text: 'Set Builder basique', included: true },
      { text: 'Recherche Spotify', included: false },
      { text: 'Fix ID3 tags', included: false },
      { text: 'Export Serato/Traktor', included: false },
      { text: 'Support prioritaire', included: false },
    ],
    cta: 'Commencer gratuitement',
    ctaLink: '/register',
    highlighted: false,
    icon: Zap,
    color: '#3b82f6',
  },
  {
    name: 'Pro',
    monthlyPrice: 9.99,
    yearlyPrice: 7.99,
    description: 'Pour les DJs sérieux',
    badge: 'Le plus populaire',
    features: [
      { text: '50 analyses par jour', included: true },
      { text: 'BPM, Key, Energy + avancé', included: true },
      { text: 'Hot Cues professionnels', included: true },
      { text: 'Export tous formats', included: true },
      { text: 'Genre + sous-genre', included: true },
      { text: 'Set Builder + suggestions IA', included: true },
      { text: 'Recherche Spotify + metadata', included: true },
      { text: 'Fix ID3 tags', included: true },
      { text: 'Export Serato + Traktor', included: true },
      { text: 'Support prioritaire', included: true },
    ],
    cta: 'Passer Pro',
    ctaLink: '/register',
    highlighted: true,
    icon: Crown,
    color: '#a855f7',
  },
  {
    name: 'Unlimited',
    monthlyPrice: 19.99,
    yearlyPrice: 14.99,
    description: 'Pour les pros et les labels',
    features: [
      { text: 'Analyses illimitées', included: true },
      { text: 'Toutes les fonctionnalités Pro', included: true },
      { text: 'Application desktop (bientôt)', included: true },
      { text: 'Analyse offline', included: true },
      { text: 'Batch processing', included: true },
      { text: 'Intégration directe DJ Software', included: true },
      { text: 'Waveform haute résolution', included: true },
      { text: 'API access', included: true },
      { text: 'Raccourcis personnalisés', included: true },
      { text: 'Mises à jour prioritaires', included: true },
    ],
    cta: 'Essai gratuit 14 jours',
    ctaLink: '/register',
    highlighted: false,
    icon: Download,
    color: '#ec4899',
  },
];

export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    getPublicPageSettings()
      .then((pages) => {
        const pricing = pages.find((p) => p.page_name === 'pricing');
        setEnabled(pricing ? pricing.is_enabled : true);
      })
      .catch(() => setEnabled(true));
  }, []);

  if (enabled === null) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Chargement...</p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Page non disponible</h1>
        <p className="text-[var(--text-muted)]">Cette page est temporairement désactivée.</p>
        <Link href="/dashboard" className="text-purple-400 hover:text-purple-300 underline">Retour au dashboard</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden">
      {/* Glow effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-purple-600 opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
            <ArrowLeft size={18} />
            Accueil
          </Link>
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-purple-600 rounded-lg flex items-center justify-center">
              <Music2 size={14} className="text-white" />
            </div>
            <span className="text-lg font-bold text-[var(--text-primary)]">CueForge</span>
          </Link>
          <Link href="/login" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
            Connexion
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div className="relative z-10 text-center py-16 px-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 mb-6">
          <Sparkles size={14} className="text-purple-400" />
          <span className="text-sm text-purple-400 font-medium">14 jours d'essai gratuit sur tous les plans</span>
        </div>
        <h2 className="text-4xl font-bold mb-4 text-[var(--text-primary)]">
          Des outils de pro,<br />un prix accessible
        </h2>
        <p className="text-[var(--text-secondary)] text-lg max-w-2xl mx-auto mb-8">
          Analyse audio précise, hot cues intelligents, et export vers tous les logiciels DJ.
        </p>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3">
          <span className={`text-sm font-medium ${!isYearly ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
            Mensuel
          </span>
          <button
            onClick={() => setIsYearly(!isYearly)}
            className={`relative w-14 h-7 rounded-full transition-colors cursor-pointer border-none ${
              isYearly ? 'bg-purple-600' : 'bg-[var(--bg-elevated)]'
            }`}
          >
            <div
              className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                isYearly ? 'translate-x-8' : 'translate-x-1'
              }`}
            />
          </button>
          <span className={`text-sm font-medium ${isYearly ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
            Annuel
          </span>
          {isYearly && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">
              -20%
            </span>
          )}
        </div>
      </div>

      {/* Plans */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 pb-20 grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
          return (
            <div
              key={plan.name}
              className={`rounded-2xl border p-7 flex flex-col relative transition-all ${
                plan.highlighted
                  ? 'border-purple-500/50 bg-[var(--bg-card)] shadow-lg shadow-purple-900/20 scale-[1.02]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)]'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold text-white" style={{ background: plan.color }}>
                  {plan.badge}
                </div>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl" style={{ background: plan.color + '20' }}>
                  <Icon size={22} style={{ color: plan.color }} />
                </div>
                <h3 className="text-xl font-bold text-[var(--text-primary)]">{plan.name}</h3>
              </div>

              <div className="mb-2">
                {price === 0 ? (
                  <span className="text-4xl font-bold text-[var(--text-primary)]">Gratuit</span>
                ) : (
                  <>
                    <span className="text-4xl font-bold text-[var(--text-primary)]">{price}€</span>
                    <span className="text-[var(--text-muted)] ml-1">/mois</span>
                  </>
                )}
              </div>
              {isYearly && price > 0 && (
                <div className="text-xs text-emerald-400 mb-3">
                  {(price * 12).toFixed(0)}€/an au lieu de {(plan.monthlyPrice * 12).toFixed(0)}€
                </div>
              )}

              <p className="text-[var(--text-muted)] text-sm mb-6">{plan.description}</p>

              <ul className="space-y-2.5 mb-8 flex-grow">
                {plan.features.map((feature) => (
                  <li key={feature.text} className="flex items-start gap-2">
                    {feature.included ? (
                      <Check size={16} className="mt-0.5 flex-shrink-0" style={{ color: plan.color }} />
                    ) : (
                      <X size={16} className="text-[var(--text-muted)] mt-0.5 flex-shrink-0 opacity-40" />
                    )}
                    <span className={`text-sm ${feature.included ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)] opacity-50'}`}>
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.ctaLink}
                className={`w-full py-3 rounded-xl font-semibold transition-all text-center text-sm block ${
                  plan.highlighted
                    ? 'text-white hover:opacity-90 shadow-lg'
                    : 'bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                }`}
                style={plan.highlighted ? { background: `linear-gradient(135deg, ${plan.color}, ${plan.color}cc)` } : {}}
              >
                {plan.cta}
              </Link>
            </div>
          );
        })}
      </div>

      {/* Comparison table hint */}
      <div className="relative z-10 max-w-3xl mx-auto px-4 pb-20">
        <h3 className="text-2xl font-bold text-center mb-8 text-[var(--text-primary)]">Questions fréquentes</h3>
        <div className="space-y-3">
          {[
            { q: 'Puis-je changer de plan à tout moment ?', a: 'Oui, tu peux upgrader ou downgrader ton plan à tout moment. Les changements prennent effet immédiatement avec un prorata.' },
            { q: 'Les exports sont-ils compatibles avec Rekordbox ?', a: 'Oui, CueForge exporte des fichiers XML 100% compatibles avec Rekordbox 6 et 7. Le support Serato et Traktor est disponible avec le plan Pro.' },
            { q: 'Comment fonctionne la limite quotidienne ?', a: 'La limite se réinitialise chaque jour à minuit (UTC). Les morceaux déjà analysés ne comptent pas dans la limite.' },
            { q: 'Y a-t-il un engagement ?', a: 'Aucun engagement ! Tu peux annuler à tout moment. Avec le plan annuel, tu es facturé une fois par an avec 20% de réduction.' },
          ].map((faq) => (
            <details key={faq.q} className="group bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
              <summary className="flex items-center justify-between px-5 py-4 cursor-pointer text-sm font-medium text-[var(--text-primary)] hover:text-purple-400 transition-colors list-none">
                {faq.q}
                <span className="text-[var(--text-muted)] group-open:rotate-90 transition-transform">▸</span>
              </summary>
              <div className="px-5 pb-4 text-sm text-[var(--text-muted)] leading-relaxed">{faq.a}</div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
