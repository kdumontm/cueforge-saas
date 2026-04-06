'use client';

import { useEffect } from 'react';
import ThemeProvider from './ThemeProvider';
import { LangProvider } from './LangProvider';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  // Enregistre le Service Worker pour le cache offline (utile surtout en desktop)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <LangProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </LangProvider>
  );
}
