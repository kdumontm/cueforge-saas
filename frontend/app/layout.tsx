import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CueForge — Analyse audio pour DJs',
  description: 'Analyse automatique BPM, cue points et export Rekordbox pour DJs professionnels',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-bg-primary text-slate-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}

