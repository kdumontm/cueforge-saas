import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'CueForge v4 — Design Preview',
  description: 'Preview des 9 écrans CueForge v4',
  robots: { index: false, follow: false },
};

const SCREENS = [
  {
    slug: 'index',
    name: 'Landing',
    desc: 'Page d’accueil — hero aurora, preview dashboard, features, workflow, pricing.',
    icon: '✨',
  },
  {
    slug: 'analyze',
    name: 'Analyze',
    desc: 'Analyse d’un track — waveform, cue points, BPM, énergie, Camelot, métadonnées.',
    icon: '🎚️',
  },
  {
    slug: 'library',
    name: 'Library',
    desc: 'Bibliothèque de tracks — recherche, filtres, tags, tri par compat.',
    icon: '📚',
  },
  {
    slug: 'compatible',
    name: 'Compatible',
    desc: 'Trouver les tracks compatibles — score Camelot + BPM + énergie.',
    icon: '🔗',
  },
  {
    slug: 'set-builder',
    name: 'Set Builder',
    desc: 'Construire un set DJ — timeline, transitions, énergie globale.',
    icon: '🎛️',
  },
  {
    slug: 'mix-studio',
    name: 'Mix Studio',
    desc: 'Deux decks virtuels — crossfader, jog wheels, transitions live.',
    icon: '🎧',
  },
  {
    slug: 'stats',
    name: 'Stats',
    desc: 'Analytics de ta pratique — KPI, sparklines, Camelot heatmap, streak.',
    icon: '📊',
  },
  {
    slug: 'upload',
    name: 'Upload',
    desc: 'Drop zone + queue d’analyse — WAV/AIFF/FLAC/MP3, sources Rekordbox/Serato/Spotify.',
    icon: '⬆️',
  },
  {
    slug: 'settings',
    name: 'Settings',
    desc: 'Compte, plan, thèmes, shortcuts, intégrations, privacy, labs.',
    icon: '⚙️',
  },
];

export default function V4HubPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(1200px 700px at 80% -10%, rgba(236,72,153,0.18), transparent 60%), radial-gradient(900px 600px at 10% 10%, rgba(255,176,32,0.12), transparent 55%), #0a0a0f',
        color: '#f4f4f5',
        fontFamily:
          '"Space Grotesk", ui-sans-serif, system-ui, -apple-system, sans-serif',
        padding: '80px 24px 120px',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderRadius: 999,
            background: 'rgba(255,176,32,0.12)',
            border: '1px solid rgba(255,176,32,0.3)',
            color: '#ffb020',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: '#ffb020' }} />
          Design v4 — Studio Neon
        </div>

        <h1
          style={{
            fontSize: 72,
            lineHeight: 1.05,
            margin: '24px 0 16px',
            fontWeight: 600,
            letterSpacing: -2,
          }}
        >
          CueForge{' '}
          <em
            style={{
              fontFamily: '"Instrument Serif", Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 400,
              background: 'linear-gradient(90deg, #ffb020, #ec4899, #a855f7)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            v4
          </em>
        </h1>
        <p
          style={{
            fontSize: 18,
            lineHeight: 1.55,
            color: 'rgba(244,244,245,0.65)',
            maxWidth: 680,
            marginBottom: 48,
          }}
        >
          Preview statique des 9 écrans du redesign Studio Neon. Chaque page est
          un HTML complet avec interactions réelles (drag, shortcuts, toasts,
          animations). Tape <kbd style={kbdStyle}>⌘</kbd>
          <kbd style={kbdStyle}>K</kbd> sur n’importe quelle page pour naviguer.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}
        >
          {SCREENS.map((s) => (
            <a
              key={s.slug}
              href={`/v4/${s.slug}.html`}
              style={{
                display: 'block',
                padding: 24,
                borderRadius: 20,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'all 180ms cubic-bezier(.2,.8,.2,1)',
              }}
            >
              <div
                style={{
                  fontSize: 28,
                  marginBottom: 12,
                  width: 48,
                  height: 48,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 12,
                  background: 'rgba(255,176,32,0.08)',
                  border: '1px solid rgba(255,176,32,0.2)',
                }}
              >
                {s.icon}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: 'rgba(244,244,245,0.45)',
                  fontFamily: 'ui-monospace, monospace',
                  marginBottom: 4,
                }}
              >
                /v4/{s.slug}
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  marginBottom: 8,
                  letterSpacing: -0.4,
                }}
              >
                {s.name}
              </div>
              <div
                style={{
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: 'rgba(244,244,245,0.6)',
                }}
              >
                {s.desc}
              </div>
            </a>
          ))}
        </div>

        <div
          style={{
            marginTop: 64,
            padding: 24,
            borderRadius: 16,
            background: 'rgba(236,72,153,0.06)',
            border: '1px solid rgba(236,72,153,0.2)',
            color: 'rgba(244,244,245,0.75)',
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: '#fff' }}>Preview design v4.</strong>{' '}
          Les 9 écrans sont statiques avec données d’exemple — interactions
          réelles (drag, shortcuts, toasts) mais aucun appel API.{' '}
          <Link
            href="/"
            style={{ color: '#ffb020', textDecoration: 'underline' }}
          >
            ← retour accueil
          </Link>
        </div>
      </div>
    </main>
  );
}

const kbdStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: 12,
  padding: '2px 6px',
  borderRadius: 4,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.14)',
  margin: '0 2px',
};

const codeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: 12,
  padding: '2px 6px',
  borderRadius: 4,
  background: 'rgba(255,255,255,0.08)',
};
