import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import ClientProviders from '@/components/ClientProviders';
import FeedbackWidget from '@/components/FeedbackWidget';
import CookieConsent from '@/components/CookieConsent';
import SentryInitializer from '@/components/SentryInitializer';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CueForge — Analyse audio pour DJs',
  description: 'Analyse automatique BPM, cue points et export Rekordbox pour DJs professionnels',
  icons: { icon: '/favicon.ico' },
  manifest: '/manifest.json',
  openGraph: {
    title: 'CueForge — Analyse audio pour DJs',
    description: 'Prépare tes sets 10× plus vite. Analyse BPM, cue points, et export automatique Rekordbox',
    url: 'https://cueforge.app',
    type: 'website',
    images: [
      {
        url: 'https://cueforge.app/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CueForge — Audio analysis for DJs',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CueForge — Analyse audio pour DJs',
    description: 'Analyse automatique BPM, cue points et export Rekordbox',
    images: ['https://cueforge.app/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`dark ${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes" />
        <meta name="theme-color" content="#a855f7" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CueForge" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        {/* DNS prefetch + Preconnect backend API (Railway) */}
        <link rel="dns-prefetch" href="https://cueforge-saas-production.up.railway.app" />
        <link rel="preconnect" href="https://cueforge-saas-production.up.railway.app" />
        {/* Preconnect CDN artworks (Spotify + Apple Music) */}
        <link rel="preconnect" href="https://i.scdn.co" />
        <link rel="preconnect" href="https://is1-ssl.mzstatic.com" />
        {/* Fonts chargées via next/font (self-hosted, pas de requête externe) */}
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'CueForge',
              description: 'Analyse automatique BPM, cue points et export Rekordbox pour DJs professionnels',
              url: 'https://cueforge.app',
              applicationCategory: 'AudioApplication',
              operatingSystem: 'Web, Windows, macOS, Linux',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'EUR',
              },
              author: {
                '@type': 'Organization',
                name: 'CueForge',
                url: 'https://cueforge.app',
              },
              image: 'https://cueforge.app/og-image.png',
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: '4.8',
                ratingCount: '150',
              },
            }),
          }}
        />
      </head>
      <body className="bg-[var(--bg-primary)] text-[var(--text-primary)] min-h-screen antialiased transition-colors duration-300">
        <ClientProviders>
          <SentryInitializer />
          {children}
          <FeedbackWidget />
          <CookieConsent />
        </ClientProviders>
      </body>
    </html>
  );
}
