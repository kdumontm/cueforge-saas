// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getPublicPageSettings } from '@/lib/api';

const PLANS = [
  {
    name: 'Free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    tagline: 'Pour découvrir.',
    editorial: 'Sans surprise.',
    features: [
      { text: '5 analyses par jour', included: true },
      { text: 'BPM · Key · Energy', included: true },
      { text: 'Hot Cues automatiques', included: true },
      { text: 'Export Rekordbox XML', included: true },
      { text: 'Détection de genre', included: true },
      { text: 'Set Builder basique', included: true },
      { text: 'Recherche Spotify enrichie', included: false },
      { text: 'Fix ID3 tags', included: false },
      { text: 'Export Serato / Traktor', included: false },
      { text: 'Support prioritaire', included: false },
    ],
    cta: 'Commencer gratuitement',
    ctaLink: '/register',
    highlighted: false,
    accent: 'cyan',
  },
  {
    name: 'Pro',
    monthlyPrice: 9.99,
    yearlyPrice: 7.99,
    tagline: 'Pour les DJs sérieux.',
    editorial: 'Le plus populaire.',
    badge: 'Le plus choisi',
    features: [
      { text: '50 analyses par jour', included: true },
      { text: 'BPM · Key · Energy avancés', included: true },
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
    accent: 'amber',
  },
  {
    name: 'Unlimited',
    monthlyPrice: 19.99,
    yearlyPrice: 14.99,
    tagline: 'Pour les labels et pros.',
    editorial: 'Sans limite.',
    features: [
      { text: 'Analyses illimitées', included: true },
      { text: 'Toutes les features Pro', included: true },
      { text: 'Desktop app (bientôt)', included: true },
      { text: 'Analyse offline', included: true },
      { text: 'Batch processing', included: true },
      { text: 'Intégration DJ software', included: true },
      { text: 'Waveform haute résolution', included: true },
      { text: 'API access', included: true },
      { text: 'Raccourcis personnalisés', included: true },
      { text: 'Mises à jour prioritaires', included: true },
    ],
    cta: 'Essai 14 jours',
    ctaLink: '/register',
    highlighted: false,
    accent: 'pink',
  },
];

const FAQ = [
  {
    q: 'Puis-je changer de plan à tout moment ?',
    a: 'Oui, tu peux upgrader ou downgrader à tout moment. Les changements prennent effet immédiatement avec un prorata au cent près.',
  },
  {
    q: 'Les exports sont-ils 100% compatibles Rekordbox ?',
    a: 'Oui, TrackCue exporte des fichiers XML natifs compatibles Rekordbox 6 et 7 — cues, grille, métadonnées, tout passe. Serato et Traktor sont inclus dans Pro et Unlimited.',
  },
  {
    q: "Comment fonctionne la limite quotidienne ?",
    a: "La limite se réinitialise chaque jour à minuit UTC. Les morceaux déjà analysés ne sont jamais recomptés — tu réanalyses gratuitement tes tracks existantes.",
  },
  {
    q: "Y a-t-il un engagement ?",
    a: "Aucun engagement. Tu peux annuler à tout moment depuis Settings. Avec le plan annuel, tu bénéficies de 20% de réduction (facturé une fois par an).",
  },
  {
    q: "La desktop app est-elle incluse ?",
    a: "Oui, dans tous les plans payants. Elle tourne en local sur macOS, Windows et Linux — l'analyse peut aussi se faire hors-ligne avec Unlimited.",
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
      <>
        <link rel="stylesheet" href="/v4/shared.css?v=20260422d" />
        <div className="v4-pricing" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner"></div>
        </div>
      </>
    );
  }

  if (!enabled) {
    return (
      <>
        <link rel="stylesheet" href="/v4/shared.css?v=20260422d" />
        <div className="v4-pricing" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <h1 className="h-2">Page non disponible</h1>
          <p className="muted">Cette page est temporairement désactivée.</p>
          <Link href="/dashboard" className="btn btn-primary">Retour au dashboard</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <link rel="stylesheet" href="/v4/shared.css?v=20260422d" />
      <style dangerouslySetInnerHTML={{ __html: PRICING_CSS }} />

      <div className="v4-pricing">
        {/* TOP NAV */}
        <header className="topnav">
          <Link href="/" className="topnav-brand" style={{ textDecoration: 'none' }}>
            <span className="mark"></span>
            <span>TrackCue</span>
          </Link>
          <span className="topnav-sep"></span>
          <nav className="topnav-links">
            <Link href="/#features">Features</Link>
            <Link href="/#workflow">Workflow</Link>
            <Link href="/pricing" className="active">Tarifs</Link>
            <Link href="/download">Download</Link>
            <Link href="/changelog">Changelog</Link>
            <Link href="/docs">Docs</Link>
          </nav>
          <div className="topnav-actions">
            <Link href="/login" className="btn btn-ghost btn-sm">Connexion</Link>
            <Link href="/register" className="btn btn-primary btn-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14"/></svg>
              Commencer
            </Link>
          </div>
        </header>

        <main className="page">
          {/* Hero */}
          <section className="pricing-hero reveal">
            <span className="chip chip-amber" style={{ marginBottom: 18 }}>
              <span className="chip-dot"></span>
              14 jours d'essai gratuit sur tous les plans payants
            </span>
            <h1 className="pricing-title">
              Des outils de pro.<br />
              <span className="editorial">Un prix qui reste raisonnable.</span>
            </h1>
            <p className="pricing-lead">
              Analyse audio précise, hot cues intelligents, export universel vers Rekordbox, Serato, Traktor.
              Sans engagement, sans carte demandée, sans surprise en fin de mois.
            </p>

            {/* Billing toggle */}
            <div className="billing-toggle">
              <div className="segment">
                <button
                  className={!isYearly ? 'active' : ''}
                  onClick={() => setIsYearly(false)}
                >
                  Mensuel
                </button>
                <button
                  className={isYearly ? 'active' : ''}
                  onClick={() => setIsYearly(true)}
                >
                  Annuel
                  <span className="chip chip-green" style={{ marginLeft: 6, padding: '2px 6px', fontSize: 10 }}>
                    −20%
                  </span>
                </button>
              </div>
            </div>
          </section>

          {/* Plans */}
          <section className="plans-grid">
            {PLANS.map((plan) => {
              const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
              const accentVar = `var(--${plan.accent})`;
              const accentSoft = `var(--${plan.accent}-soft)`;
              return (
                <article
                  key={plan.name}
                  className={`plan card ${plan.highlighted ? 'plan-highlighted elevated' : ''}`}
                  style={plan.highlighted ? { '--plan-accent': accentVar } as any : undefined}
                >
                  {plan.badge && (
                    <span className="plan-badge">
                      <span className="chip-dot"></span>
                      {plan.badge}
                    </span>
                  )}

                  <div className="plan-head">
                    <div className="eyebrow" style={{ color: accentVar }}>{plan.name}</div>
                    <h3 className="plan-tagline">
                      {plan.tagline}<br />
                      <span className="editorial">{plan.editorial}</span>
                    </h3>
                  </div>

                  <div className="plan-price">
                    {price === 0 ? (
                      <>
                        <span className="plan-price-val">Gratuit</span>
                      </>
                    ) : (
                      <>
                        <span className="plan-price-val num">{price.toFixed(2).replace('.', ',')}€</span>
                        <span className="plan-price-suffix">/ mois</span>
                      </>
                    )}
                    {isYearly && price > 0 && (
                      <div className="plan-price-yearly mono">
                        soit {(price * 12).toFixed(0)}€/an —
                        <span style={{ color: 'var(--green)', marginLeft: 4 }}>
                          économise {((plan.monthlyPrice - price) * 12).toFixed(0)}€
                        </span>
                      </div>
                    )}
                  </div>

                  <Link
                    href={plan.ctaLink}
                    className={`btn btn-lg ${plan.highlighted ? 'btn-primary' : ''}`}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {plan.cta}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
                  </Link>

                  <ul className="plan-features">
                    {plan.features.map((feature, i) => (
                      <li key={i} className={feature.included ? 'incl' : 'excl'}>
                        <span className="plan-check" aria-hidden="true">
                          {feature.included ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <path d="M20 6 9 17l-5-5"/>
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M6 6l12 12M18 6L6 18"/>
                            </svg>
                          )}
                        </span>
                        <span>{feature.text}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </section>

          {/* Bullet proof */}
          <section className="reassure">
            <div className="reassure-item">
              <div className="reassure-head">
                <div className="reassure-icon" style={{ color: 'var(--green)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 6 9 17l-5-5"/></svg>
                </div>
                <div className="reassure-title">Aucun engagement</div>
              </div>
              <div className="reassure-body">Annule à tout moment depuis tes settings. Aucun frais caché.</div>
            </div>
            <div className="reassure-item">
              <div className="reassure-head">
                <div className="reassure-icon" style={{ color: 'var(--cyan)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <div className="reassure-title">Paiement sécurisé</div>
              </div>
              <div className="reassure-body">Stripe. Aucune donnée bancaire stockée sur nos serveurs.</div>
            </div>
            <div className="reassure-item">
              <div className="reassure-head">
                <div className="reassure-icon" style={{ color: 'var(--pink)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12c0 5-4 9-9 9s-9-4-9-9 4-9 9-9c2.3 0 4.4.9 6 2.3"/><path d="m9 11 3 3L22 4"/></svg>
                </div>
                <div className="reassure-title">Remboursement</div>
              </div>
              <div className="reassure-body">Pas satisfait dans les 14 jours ? On te rembourse, sans poser de question.</div>
            </div>
          </section>

          {/* FAQ */}
          <section className="faq-section">
            <div className="section-head-lg">
              <div className="eyebrow" style={{ color: 'var(--pink)' }}>FAQ</div>
              <h2 className="h-2">
                Les questions qu'on nous pose.{' '}
                <span className="editorial">Les vraies.</span>
              </h2>
            </div>
            <div className="faq-list">
              {FAQ.map((faq) => (
                <details key={faq.q} className="faq-item card">
                  <summary>
                    <span>{faq.q}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="faq-chev">
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </summary>
                  <div className="faq-body">{faq.a}</div>
                </details>
              ))}
            </div>
          </section>

          {/* Footer */}
          <footer className="v4-footer-mini">
            <div className="topnav-brand" style={{ fontSize: 15 }}>
              <span className="mark"></span>
              <span>TrackCue</span>
            </div>
            <div className="v4-footer-mini-links">
              <Link href="/">Accueil</Link>
              <Link href="/pricing">Tarifs</Link>
              <Link href="/cgu">CGU</Link>
              <a href="mailto:hello@trackcue.com">Contact</a>
            </div>
            <div className="mono hint">© 2026 TrackCue</div>
          </footer>
        </main>
      </div>
    </>
  );
}

const PRICING_CSS = `
.v4-pricing {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  background: var(--s-0);
  background-image: var(--aurora-hot);
  background-attachment: fixed;
  color: var(--c-primary);
  font-family: var(--font-body);
}
.v4-pricing::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.06 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  opacity: .55;
  mix-blend-mode: overlay;
}

.v4-pricing .page {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  padding: 48px 32px 96px;
}

.v4-pricing .pricing-hero {
  text-align: center;
  padding: 32px 0 56px;
}
.v4-pricing .pricing-title {
  font-family: var(--font-display);
  font-size: clamp(36px, 4.5vw, 56px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.05;
  margin: 0 0 20px;
}
.v4-pricing .pricing-title .editorial {
  color: var(--c-secondary);
  font-weight: 400;
  font-size: 0.88em;
}
.v4-pricing .pricing-lead {
  color: var(--c-secondary);
  font-size: 16px;
  line-height: 1.55;
  max-width: 620px;
  margin: 0 auto 32px;
}
.v4-pricing .billing-toggle {
  display: flex;
  justify-content: center;
}

/* PLANS */
.v4-pricing .plans-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 80px;
  align-items: stretch;
}
.v4-pricing .plan {
  padding: 32px 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: relative;
  transition: transform var(--t-med) var(--ease), border-color var(--t-med) var(--ease);
}
.v4-pricing .plan:hover {
  transform: translateY(-2px);
  border-color: var(--b-strong);
}
.v4-pricing .plan-highlighted {
  border-color: rgba(255,122,24,0.45);
  background:
    radial-gradient(600px 300px at 50% -40%, rgba(255,122,24,0.12), transparent 60%),
    linear-gradient(180deg, var(--s-3) 0%, var(--s-2) 100%);
  box-shadow: var(--e-3), 0 0 0 1px rgba(255,122,24,0.20);
  transform: translateY(-8px);
}
.v4-pricing .plan-highlighted:hover {
  transform: translateY(-10px);
}
.v4-pricing .plan-badge {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(180deg, #ff8a2e 0%, var(--amber) 100%);
  color: #1a0b00;
  padding: 4px 12px;
  border-radius: var(--r-pill);
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 4px 14px rgba(255,122,24,.4);
  white-space: nowrap;
}

.v4-pricing .plan-head .eyebrow { margin-bottom: 8px; }
.v4-pricing .plan-tagline {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
  margin: 0;
}
.v4-pricing .plan-tagline .editorial {
  color: var(--c-secondary);
  font-weight: 400;
  font-size: 19px;
}

.v4-pricing .plan-price {
  padding-bottom: 4px;
  border-bottom: 1px solid var(--b-subtle);
  margin-bottom: 4px;
}
.v4-pricing .plan-price-val {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 42px;
  letter-spacing: -0.025em;
  line-height: 1;
}
.v4-pricing .plan-price-suffix {
  color: var(--c-secondary);
  font-size: 14px;
  margin-left: 6px;
}
.v4-pricing .plan-price-yearly {
  font-size: 11px;
  color: var(--c-tertiary);
  margin-top: 6px;
}

.v4-pricing .plan-features {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.v4-pricing .plan-features li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 13.5px;
  line-height: 1.4;
}
.v4-pricing .plan-features li.incl { color: var(--c-primary); }
.v4-pricing .plan-features li.excl { color: var(--c-tertiary); opacity: 0.7; }
.v4-pricing .plan-check {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin-top: 1px;
}
.v4-pricing .plan-features .incl .plan-check {
  background: var(--green-soft);
  color: var(--green);
}
.v4-pricing .plan-features .excl .plan-check {
  background: var(--s-3);
  color: var(--c-quaternary);
}
.v4-pricing .plan-check svg { width: 11px; height: 11px; }

/* REASSURE */
.v4-pricing .reassure {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding: 32px 0 64px;
  border-top: 1px solid var(--b-subtle);
  border-bottom: 1px solid var(--b-subtle);
  margin-bottom: 64px;
}
.v4-pricing .reassure-item {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.v4-pricing .reassure-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.v4-pricing .reassure-icon {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.v4-pricing .reassure-icon svg { width: 20px; height: 20px; }
.v4-pricing .reassure-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 15px;
}
.v4-pricing .reassure-body {
  color: var(--c-secondary);
  font-size: 13px;
  line-height: 1.5;
}

/* FAQ */
.v4-pricing .section-head-lg { margin-bottom: 24px; max-width: 760px; }
.v4-pricing .section-head-lg .eyebrow { margin-bottom: 12px; }
.v4-pricing .section-head-lg .h-2 { font-size: 32px; margin: 0; }
.v4-pricing .faq-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 860px;
}
.v4-pricing .faq-item {
  padding: 0;
  overflow: hidden;
}
.v4-pricing .faq-item summary {
  list-style: none;
  padding: 18px 22px;
  cursor: pointer;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 14.5px;
  color: var(--c-primary);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  transition: background var(--t-fast) var(--ease);
}
.v4-pricing .faq-item summary::-webkit-details-marker { display: none; }
.v4-pricing .faq-item summary:hover { background: var(--s-3); }
.v4-pricing .faq-chev {
  width: 16px;
  height: 16px;
  color: var(--c-tertiary);
  transition: transform var(--t-med) var(--ease);
  flex-shrink: 0;
}
.v4-pricing .faq-item[open] .faq-chev { transform: rotate(180deg); }
.v4-pricing .faq-body {
  padding: 0 22px 20px;
  color: var(--c-secondary);
  font-size: 13.5px;
  line-height: 1.6;
}

/* FOOTER mini */
.v4-pricing .v4-footer-mini {
  margin-top: 80px;
  padding-top: 32px;
  border-top: 1px solid var(--b-subtle);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}
.v4-pricing .v4-footer-mini-links {
  display: flex;
  gap: 20px;
}
.v4-pricing .v4-footer-mini-links a {
  color: var(--c-secondary);
  font-size: 13px;
  transition: color var(--t-fast);
}
.v4-pricing .v4-footer-mini-links a:hover { color: var(--c-primary); }

/* RESPONSIVE */
@media (max-width: 960px) {
  .v4-pricing .plans-grid { grid-template-columns: 1fr; }
  .v4-pricing .plan-highlighted { transform: none; }
  .v4-pricing .plan-highlighted:hover { transform: translateY(-2px); }
  .v4-pricing .reassure { grid-template-columns: 1fr; }
  .v4-pricing .topnav-links { display: none; }
}
@media (max-width: 640px) {
  .v4-pricing .page { padding: 32px 20px 64px; }
  .v4-pricing .pricing-title { font-size: 32px; }
  .v4-pricing .plan { padding: 28px 22px; }
}
`;
