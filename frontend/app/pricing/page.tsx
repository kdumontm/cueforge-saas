'use client';

import { useState, useEffect } from 'react';
import { Check, Zap, Crown, Download, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getPublicPageSettings } from '@/lib/api';


const plans = [
  {
    name: 'Free',
    price: '0',
    period: '',
    description: 'Pour commencer et tester CueForge',
    features: [
      '5 morceaux par jour',
      'Analyse audio (BPM, Key, Energy)',
      'Points cue automatiques',
      'Export Rekordbox XML',
      'Nettoyage de titres',
      'Detection de genre',
    ],
    limitations: [
      'Pas de recherche Spotify',
      'Pas de fix ID3 tags',
    ],
    cta: 'Commencer gratuitement',
    highlighted: false,
    icon: Zap,
  },
  {
    name: 'Pro',
    price: '9.99',
    period: '/mois',
    description: 'Pour les DJs qui veulent aller plus loin',
    features: [
      '20 morceaux par jour',
      'Analyse audio (BPM, Key, Energy)',
      'Points cue professionnels',
      'Export Rekordbox + Serato',
      'Recherche Spotify + metadata',
      'Nettoyage de titres avance',
      'Parse remix / feat.',
      'Fix ID3 tags',
      'Detection de genre avancee',
      'Support prioritaire',
    ],
    limitations: [],
    cta: 'Passer Pro',
    highlighted: true,
    icon: Crown,
  },
  {
    name: 'App Desktop',
    price: '19.99',
    period: '/mois',
    description: 'Analyse illimitee avec l\'application desktop',
    features: [
      'Morceaux illimites',
      'Toutes les fonctionnalites Pro',
      'Application desktop (Mac/Windows)',
      'Analyse offline',
      'Traitement par lot (batch)',
      'Integration directe Rekordbox',
      'Integration directe Serato',
      'Waveform haute resolution',
      'Raccourcis clavier personnalises',
      'Mises a jour prioritaires',
    ],
    limitations: [],
    cta: 'Telecharger l\'app',
    highlighted: false,
    icon: Download,
  },
];

export default function PricingPage() {
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
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Chargement...</p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Page non disponible</h1>
        <p className="text-gray-400">Cette page est temporairement désactivée.</p>
        <Link href="/dashboard" className="text-purple-400 hover:text-purple-300 underline">
          Retour au dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-gray-400 hover:text-white transition">
            <ArrowLeft size={18} />
            Retour au dashboard
          </Link>
          <h1 className="text-xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
            CueForge
          </h1>
        </div>
      </div>

      {/* Hero */}
      <div className="text-center py-16 px-4">
        <h2 className="text-4xl font-bold mb-4">
          Choisissez votre plan
        </h2>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          Des outils professionnels pour preparer vos sets. Analyse audio precise,
          points cue intelligents, et metadata automatique.
        </p>
      </div>

      {/* Plans */}
      <div className="max-w-6xl mx-auto px-4 pb-20 grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map((plan) => {
          const Icon = plan.icon;
          return (
            <div
              key={plan.name}
              className={`rounded-2xl border ${
                plan.highlighted
                  ? 'border-green-500 bg-gray-900 shadow-lg shadow-green-500/10 scale-105'
                  : 'border-gray-800 bg-gray-900/50'
              } p-8 flex flex-col relative`}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-green-500 text-black text-sm font-bold px-4 py-1 rounded-full">
                  Populaire
                </div>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-lg ${plan.highlighted ? 'bg-green-500/20' : 'bg-gray-800'}`}>
                  <Icon size={24} className={plan.highlighted ? 'text-green-400' : 'text-gray-400'} />
                </div>
                <h3 className="text-2xl font-bold">{plan.name}</h3>
              </div>

              <div className="mb-4">
                <span className="text-4xl font-bold">{plan.price === '0' ? 'Gratuit' : `${plan.price}\u20AC`}</span>
                {plan.period && <span className="text-gray-400 ml-1">{plan.period}</span>}
              </div>

              <p className="text-gray-400 mb-6">{plan.description}</p>

              <ul className="space-y-3 mb-8 flex-grow">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check size={18} className="text-green-400 mt-0.5 shrink-0" />
                    <span className="text-sm text-gray-300">{feature}</span>
                  </li>
                ))}
                {plan.limitations.map((limitation) => (
                  <li key={limitation} className="flex items-start gap-2">
                    <span className="text-gray-600 mt-0.5 shrink-0">{"\u2715"}</span>
                    <span className="text-sm text-gray-500">{limitation}</span>
                  </li>
                ))}
              </ul>

              <button
                className={`w-full py-3 rounded-lg font-semibold transition ${
                  plan.highlighted
                    ? 'bg-green-500 hover:bg-green-600 text-black'
                    : 'bg-gray-800 hover:bg-gray-700 text-white'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          );
        })}
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto px-4 pb-20">
        <h3 className="text-2xl font-bold text-center mb-8">Questions frequentes</h3>
        <div className="space-y-4">
          {[
            {
              q: 'Puis-je changer de plan a tout moment ?',
              a: 'Oui, vous pouvez upgrader ou downgrader votre plan a tout moment. Les changements prennent effet immediatement.',
            },
            {
              q: 'Les points cue sont-ils compatibles avec Rekordbox ?',
              a: 'Oui, CueForge exporte des fichiers XML 100% compatibles avec Rekordbox. Le support Serato est disponible avec le plan Pro.',
            },
            {
              q: 'L\'application desktop fonctionne-t-elle offline ?',
              a: 'Oui, l\'application desktop peut analyser vos morceaux sans connexion internet. La recherche Spotify necessite une connexion.',
            },
            {
              q: 'Comment fonctionne la limite quotidienne ?',
              a: 'La limite se reinitialise chaque jour a minuit (UTC). Les morceaux deja analyses ne comptent pas dans la limite.',
            },
          ].map((faq) => (
            <details key={faq.q} className="group border border-gray-800 rounded-lg">
              <summary className="flex items-center justify-between p-4 cursor-pointer text-gray-300 hover:text-white">
                {faq.q}
                <span className="text-gray-600 group-open:rotate-45 transition-transform text-xl">+</span>
              </summary>
              <p className="px-4 pb-4 text-gray-400 text-sm">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
