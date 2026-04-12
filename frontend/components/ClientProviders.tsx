'use client';

import { useEffect } from 'react';
import { SWRConfig } from 'swr';
import ThemeProvider from './ThemeProvider';
import { LangProvider } from './LangProvider';
import { swrConfig } from '@/lib/swr';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  // Enregistre le Service Worker pour le cache offline (utile surtout en desktop)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <SWRConfig value={swrConfig}>
      <LangProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </LangProvider>
    </SWRConfig>
  );
}
