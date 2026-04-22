import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TrackCue — Prépare tes sets 10× plus vite',
  description:
    "Analyse automatique BPM, Camelot key, cue points & énergie. Export Rekordbox, Serato, Traktor. L'outil des DJs qui préparent sérieusement.",
};

const FEATURES = [
  {
    title: 'Analyse IA',
    editorial: 'qui comprend.',
    body:
      'BPM, tonalité Camelot, énergie, structure phrase-par-phrase. Pas du pattern-matching naïf : un vrai modèle audio entraîné sur 2M+ de tracks.',
    chip: 'chip-amber',
    chipLabel: 'BPM · Key · Energy',
  },
  {
    title: 'Hot Cues',
    editorial: 'posés au bon endroit.',
    body:
      'Intros, drops, breakdowns, outros détectés automatiquement. Prêts à charger dans tes decks — tu ajustes, tu mixes, tu joues.',
    chip: 'chip-pink',
    chipLabel: '8 cue points auto',
  },
  {
    title: 'Stem separation',
    editorial: 'sans compromis.',
    body:
      'Isole drums, bass, vocals et melodic en un clic. Propulsé par Demucs v4 — qualité studio, export WAV ou MP3.',
    chip: 'chip-violet',
    chipLabel: '4 stems · Demucs v4',
  },
  {
    title: 'Export universel',
    editorial: 'vers tous tes DAWs.',
    body:
      'Rekordbox XML natif, Serato crates, Traktor NML, Mixxx. Les cues, la grille, les métadonnées — tout passe, rien ne se perd.',
    chip: 'chip-cyan',
    chipLabel: 'Rekordbox · Serato · Traktor',
  },
  {
    title: 'Compatibilité harmonique',
    editorial: 'intelligente.',
    body:
      'Le Camelot Wheel revisité. TrackCue te montre quelles tracks de ta library mixent ensemble, pas juste celles qui collent sur la roue.',
    chip: 'chip-lime',
    chipLabel: 'Harmonic mixing',
  },
  {
    title: 'Library qui respire',
    editorial: "jusqu'à 50k tracks.",
    body:
      "Recherche floue, filtres BPM / key / energy / tags, tri par compatibilité avec une track de référence. Ça scrolle vite, ça retrouve tout.",
    chip: 'chip-green',
    chipLabel: "Jusqu'à 50 000 tracks",
  },
];

const WORKFLOW = [
  { step: '01', title: 'Tu uploades', body: 'MP3, FLAC, WAV, AIFF. En batch si besoin — on gère.' },
  { step: '02', title: 'On analyse', body: 'BPM, key, cues, énergie, stems. 45 secondes par track.' },
  { step: '03', title: 'Tu exportes', body: 'Rekordbox ouvre ta library, tout est prêt. Go DJ.' },
];

export default function LandingPage() {
  return (
    <>
      {/* V4 Design System */}
      <link rel="stylesheet" href="/v4/shared.css?v=20260422d" />

      {/* Page-specific styles pour la landing */}
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />

      {/* Redirige les utilisateurs déjà connectés vers /dashboard */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function(){
          try {
            var t = localStorage.getItem('trackcue_token');
            if (t) { window.location.replace('/dashboard'); }
          } catch (e) {}
        })();
      ` }} />

      <div className="v4-landing">
        {/* TOP NAV */}
        <header className="topnav">
          <Link href="/" className="topnav-brand" style={{ textDecoration: 'none' }}>
            <span className="mark"></span>
            <span>TrackCue</span>
          </Link>
          <span className="topnav-sep"></span>
          <nav className="topnav-links">
            <a href="#features">Features</a>
            <a href="#workflow">Workflow</a>
            <Link href="/pricing">Tarifs</Link>
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
          {/* HERO */}
          <section className="hero reveal">
            <div className="hero-grid">
              <div className="hero-copy">
                <div className="eyebrow" style={{ marginBottom: 18, color: 'var(--amber)' }}>
                  v4 · Studio Neon
                </div>
                <h1 className="hero-title">
                  Prépare tes sets{' '}
                  <span className="editorial">comme un tailleur,</span><br />
                  pas comme un touriste.
                </h1>
                <p className="hero-lead">
                  TrackCue analyse ton catalogue — BPM, Camelot, énergie, cues, stems — et exporte
                  propre vers Rekordbox, Serato, Traktor. Moins de clics, plus de musique.
                </p>
                <div className="hero-actions">
                  <Link href="/register" className="btn btn-primary btn-lg">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 3v18l15-9z" fill="currentColor"/></svg>
                    Commencer gratuitement
                  </Link>
                  <Link href="/pricing" className="btn btn-lg">
                    Voir les tarifs
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
                  </Link>
                </div>
                <div className="hero-meta">
                  <div className="hero-meta-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
                    5 analyses/jour gratuites
                  </div>
                  <div className="hero-meta-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
                    Aucune carte
                  </div>
                  <div className="hero-meta-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
                    Desktop app incluse
                  </div>
                </div>
              </div>

              {/* Live preview card */}
              <div className="live-preview">
                <div className="live-now-head">
                  <span className="eyebrow"><span className="live-dot"></span>En analyse</span>
                  <span className="mono hint">ETA 00:42</span>
                </div>
                <div className="live-track">
                  <div className="live-cover"></div>
                  <div className="live-info">
                    <div className="live-title">Strobe (Club Mix)</div>
                    <div className="live-artist">deadmau5 · For Lack of a Better Name</div>
                  </div>
                </div>
                <div className="live-progress"><div className="live-progress-fill" style={{ width: '72%' }}></div></div>
                <div className="live-steps">
                  <span className="done">BPM</span>
                  <span className="done">Key</span>
                  <span className="doing">Cues</span>
                  <span>Stems</span>
                </div>
                <div className="live-kpis">
                  <div>
                    <div className="eyebrow">BPM</div>
                    <div className="live-kpi-val num">128.0</div>
                  </div>
                  <div>
                    <div className="eyebrow">Key</div>
                    <div className="live-kpi-val" style={{ color: 'var(--cyan)' }}>8A</div>
                  </div>
                  <div>
                    <div className="eyebrow">Energy</div>
                    <div className="live-kpi-val" style={{ color: 'var(--pink)' }}>7.2</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* TRUST CHIPS */}
          <section className="trust reveal reveal-2">
            <div className="trust-label eyebrow">Exports natifs</div>
            <div className="trust-chips">
              <span className="chip">Rekordbox XML</span>
              <span className="chip">Serato</span>
              <span className="chip">Traktor NML</span>
              <span className="chip">Mixxx</span>
              <span className="chip">Spotify playlists</span>
              <span className="chip">Beatport crates</span>
              <span className="chip chip-amber"><span className="chip-dot"></span>Desktop app · macOS · Windows · Linux</span>
            </div>
          </section>

          {/* FEATURES */}
          <section id="features" className="features">
            <div className="section-head-lg">
              <div className="eyebrow">Features</div>
              <h2 className="h-2">
                Tout ce qu'il faut.{' '}
                <span className="editorial">Rien de plus.</span>
              </h2>
              <p className="muted" style={{ maxWidth: 640, fontSize: 15 }}>
                Des outils pensés pour la préparation réelle d'un set, pas pour remplir une page de specs.
              </p>
            </div>
            <div className="feature-grid">
              {FEATURES.map((f, i) => (
                <article key={f.title} className={`feature card reveal reveal-${(i % 4) + 1}`}>
                  <span className={`chip ${f.chip}`} style={{ alignSelf: 'flex-start' }}>
                    <span className="chip-dot"></span>
                    {f.chipLabel}
                  </span>
                  <h3 className="feature-title">
                    {f.title}<br />
                    <span className="editorial">{f.editorial}</span>
                  </h3>
                  <p className="feature-body">{f.body}</p>
                </article>
              ))}
            </div>
          </section>

          {/* WORKFLOW */}
          <section id="workflow" className="workflow">
            <div className="section-head-lg">
              <div className="eyebrow">Workflow</div>
              <h2 className="h-2">
                Trois étapes.{' '}
                <span className="editorial">Aucune friction.</span>
              </h2>
            </div>
            <div className="workflow-grid">
              {WORKFLOW.map((w) => (
                <div key={w.step} className="workflow-step card">
                  <div className="workflow-num">{w.step}</div>
                  <div className="workflow-title">{w.title}</div>
                  <div className="workflow-body">{w.body}</div>
                </div>
              ))}
            </div>
          </section>

          {/* CTA band */}
          <section className="cta-band">
            <div className="cta-inner card elevated">
              <div>
                <div className="eyebrow" style={{ color: 'var(--pink)' }}>Tu commences quand ?</div>
                <h2 className="h-2" style={{ margin: '8px 0 6px' }}>
                  5 analyses par jour,{' '}
                  <span className="editorial">gratuites. Toujours.</span>
                </h2>
                <p className="muted" style={{ margin: 0, maxWidth: 480 }}>
                  Crée ton compte en 30 secondes. Aucune carte bancaire demandée.
                  Upgrade quand tu es prêt — jamais avant.
                </p>
              </div>
              <div className="cta-actions">
                <Link href="/register" className="btn btn-primary btn-lg">
                  Créer un compte
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
                </Link>
                <Link href="/pricing" className="btn btn-ghost btn-lg">Comparer les plans</Link>
              </div>
            </div>
          </section>

          {/* FOOTER */}
          <footer className="v4-footer">
            <div className="v4-footer-brand">
              <div className="topnav-brand" style={{ fontSize: 18 }}>
                <span className="mark"></span>
                <span>TrackCue</span>
              </div>
              <p className="muted" style={{ fontSize: 13, maxWidth: 320, marginTop: 12 }}>
                L'outil d'analyse et de préparation pour DJs qui prennent leurs sets au sérieux.
              </p>
            </div>
            <div className="v4-footer-cols">
              <div>
                <div className="eyebrow">Produit</div>
                <Link href="/pricing">Tarifs</Link>
                <Link href="/download">Download</Link>
                <Link href="/changelog">Changelog</Link>
                <Link href="/docs">Docs</Link>
              </div>
              <div>
                <div className="eyebrow">Compte</div>
                <Link href="/login">Connexion</Link>
                <Link href="/register">Inscription</Link>
                <Link href="/dashboard">Dashboard</Link>
              </div>
              <div>
                <div className="eyebrow">Legal</div>
                <Link href="/cgu">CGU</Link>
                <Link href="/cgu#privacy">Confidentialité</Link>
                <a href="mailto:hello@trackcue.com">Contact</a>
              </div>
            </div>
            <div className="v4-footer-bottom mono hint">
              © 2026 TrackCue. Tous droits réservés.
            </div>
          </footer>
        </main>
      </div>
    </>
  );
}

const LANDING_CSS = `
/* Force v4 aurora background on landing (override du body layout) */
.v4-landing {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  background: var(--s-0);
  background-image: var(--aurora-hot);
  background-attachment: fixed;
  color: var(--c-primary);
  font-family: var(--font-body);
}
.v4-landing::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.06 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  opacity: .55;
  mix-blend-mode: overlay;
}

.v4-landing .page {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  padding: 48px 32px 96px;
}

/* HERO */
.v4-landing .hero {
  position: relative;
  border: 1px solid var(--b-default);
  border-radius: 24px;
  padding: 56px 56px;
  margin-bottom: 48px;
  background:
    radial-gradient(900px 500px at 90% 0%, rgba(255,46,107,0.20), transparent 55%),
    radial-gradient(700px 400px at 0% 100%, rgba(139,92,246,0.20), transparent 55%),
    linear-gradient(180deg, var(--s-2) 0%, var(--s-1) 100%);
  overflow: hidden;
  box-shadow: var(--e-3);
}
.v4-landing .hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  opacity: .6;
  mix-blend-mode: overlay;
  pointer-events: none;
}
.v4-landing .hero-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: 48px;
  align-items: center;
}
.v4-landing .hero-title {
  font-family: var(--font-display);
  font-size: clamp(40px, 5vw, 64px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.02;
  margin: 0 0 20px;
}
.v4-landing .hero-title .editorial {
  color: var(--c-secondary);
  font-weight: 400;
  font-size: 0.88em;
}
.v4-landing .hero-lead {
  color: var(--c-secondary);
  font-size: 16px;
  line-height: 1.55;
  margin: 0 0 32px;
  max-width: 520px;
}
.v4-landing .hero-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}
.v4-landing .hero-meta {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  font-size: 12.5px;
  color: var(--c-tertiary);
  font-family: var(--font-mono);
}
.v4-landing .hero-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.v4-landing .hero-meta-item svg {
  width: 14px;
  height: 14px;
  color: var(--green);
}

/* Live preview */
.v4-landing .live-preview {
  background: rgba(5,4,6,0.55);
  border: 1px solid var(--b-default);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  backdrop-filter: blur(12px);
}
.v4-landing .live-now-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.v4-landing .live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pink);
  box-shadow: 0 0 14px var(--pink);
  animation: livePulse 1.6s ease-in-out infinite;
  display: inline-block;
  margin-right: 6px;
}
@keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:.4} }
.v4-landing .live-track { display: flex; gap: 12px; align-items: center; }
.v4-landing .live-cover {
  width: 52px; height: 52px; border-radius: 10px;
  background: linear-gradient(135deg, var(--pink), var(--amber));
  flex-shrink: 0; position: relative; overflow: hidden;
}
.v4-landing .live-cover::after {
  content: ""; position: absolute; inset: 0;
  background: repeating-linear-gradient(45deg, transparent 0 8px, rgba(0,0,0,.18) 8px 10px);
}
.v4-landing .live-info { flex: 1; min-width: 0; }
.v4-landing .live-title {
  font-family: var(--font-display); font-weight: 600; font-size: 14px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.v4-landing .live-artist {
  color: var(--c-secondary); font-size: 12px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.v4-landing .live-progress {
  height: 6px; border-radius: 3px; background: var(--s-3);
  overflow: hidden; position: relative;
}
.v4-landing .live-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--pink), var(--amber));
  border-radius: 3px; position: relative;
}
.v4-landing .live-progress-fill::after {
  content: ""; position: absolute; right: 0; top: -2px; bottom: -2px; width: 10px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.8));
  filter: blur(3px);
}
.v4-landing .live-steps {
  display: flex; gap: 6px;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--c-secondary);
}
.v4-landing .live-steps span {
  flex: 1; padding: 3px 6px; border-radius: 4px;
  background: var(--s-3); text-align: center;
  border: 1px solid var(--b-subtle);
}
.v4-landing .live-steps span.done {
  background: var(--green-soft); border-color: rgba(74,222,128,.3); color: #8ef0aa;
}
.v4-landing .live-steps span.doing {
  background: var(--amber-soft); border-color: rgba(255,122,24,.3); color: #ffba7a;
}
.v4-landing .live-kpis {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
  padding-top: 10px; border-top: 1px solid var(--b-subtle);
}
.v4-landing .live-kpi-val {
  font-family: var(--font-display); font-weight: 700; font-size: 22px;
  letter-spacing: -0.01em; line-height: 1; margin-top: 4px;
}

/* TRUST */
.v4-landing .trust {
  display: flex; flex-direction: column; gap: 14px; align-items: center;
  padding: 32px 0 48px; border-bottom: 1px solid var(--b-subtle);
  margin-bottom: 64px; text-align: center;
}
.v4-landing .trust-label { color: var(--c-tertiary); }
.v4-landing .trust-chips {
  display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;
}

/* FEATURES */
.v4-landing .section-head-lg { margin-bottom: 32px; max-width: 760px; }
.v4-landing .section-head-lg .eyebrow { color: var(--pink); margin-bottom: 12px; }
.v4-landing .section-head-lg .h-2 { font-size: 38px; margin: 0 0 12px; }
.v4-landing .feature-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 16px; margin-bottom: 80px;
}
.v4-landing .feature {
  padding: 24px; display: flex; flex-direction: column; gap: 14px;
  transition: transform var(--t-med) var(--ease), border-color var(--t-med) var(--ease);
}
.v4-landing .feature:hover { transform: translateY(-2px); border-color: var(--b-strong); }
.v4-landing .feature-title {
  font-family: var(--font-display); font-weight: 700; font-size: 19px;
  letter-spacing: -0.015em; line-height: 1.2; margin: 0;
}
.v4-landing .feature-title .editorial {
  color: var(--c-secondary); font-weight: 400; font-size: 17px;
}
.v4-landing .feature-body {
  color: var(--c-secondary); font-size: 13.5px; line-height: 1.55; margin: 0;
}

/* WORKFLOW */
.v4-landing .workflow-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 80px;
}
.v4-landing .workflow-step {
  padding: 28px; display: flex; flex-direction: column; gap: 10px;
}
.v4-landing .workflow-num {
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.2em;
  color: var(--amber); margin-bottom: 6px;
}
.v4-landing .workflow-title {
  font-family: var(--font-display); font-weight: 700; font-size: 22px;
  letter-spacing: -0.015em;
}
.v4-landing .workflow-body {
  color: var(--c-secondary); font-size: 14px; line-height: 1.55;
}

/* CTA BAND */
.v4-landing .cta-band { margin-bottom: 80px; }
.v4-landing .cta-inner {
  padding: 40px 44px;
  display: grid; grid-template-columns: 1.4fr 1fr;
  gap: 32px; align-items: center;
  background:
    radial-gradient(600px 300px at 100% 0%, rgba(255,46,107,0.16), transparent 60%),
    radial-gradient(500px 250px at 0% 100%, rgba(255,122,24,0.14), transparent 60%),
    linear-gradient(180deg, var(--s-3) 0%, var(--s-2) 100%);
}
.v4-landing .cta-actions {
  display: flex; gap: 12px; flex-wrap: wrap; justify-content: flex-end;
}

/* FOOTER */
.v4-landing .v4-footer {
  border-top: 1px solid var(--b-subtle);
  padding-top: 48px;
  display: grid; grid-template-columns: 1.2fr 2fr; gap: 48px;
}
.v4-landing .v4-footer-cols {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;
}
.v4-landing .v4-footer-cols > div { display: flex; flex-direction: column; gap: 8px; }
.v4-landing .v4-footer-cols .eyebrow { color: var(--c-tertiary); margin-bottom: 6px; }
.v4-landing .v4-footer-cols a {
  color: var(--c-secondary); font-size: 13px; transition: color var(--t-fast);
}
.v4-landing .v4-footer-cols a:hover { color: var(--c-primary); }
.v4-landing .v4-footer-bottom {
  grid-column: 1 / -1; padding: 32px 0 0;
  border-top: 1px solid var(--b-subtle); margin-top: 32px;
}

/* RESPONSIVE */
@media (max-width: 960px) {
  .v4-landing .hero { padding: 36px 28px; }
  .v4-landing .hero-grid { grid-template-columns: 1fr; gap: 32px; }
  .v4-landing .feature-grid { grid-template-columns: repeat(2, 1fr); }
  .v4-landing .workflow-grid { grid-template-columns: 1fr; }
  .v4-landing .cta-inner { grid-template-columns: 1fr; padding: 32px 24px; }
  .v4-landing .cta-actions { justify-content: flex-start; }
  .v4-landing .v4-footer { grid-template-columns: 1fr; gap: 32px; }
  .v4-landing .v4-footer-cols { grid-template-columns: repeat(2, 1fr); }
  .v4-landing .topnav-links { display: none; }
}
@media (max-width: 640px) {
  .v4-landing .page { padding: 32px 20px 64px; }
  .v4-landing .feature-grid { grid-template-columns: 1fr; }
  .v4-landing .hero-title { font-size: 36px; }
}
`;
