'use client';

import { useEffect } from 'react';
import { SWRConfig } from 'swr';
import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/queryClient';
import ThemeProvider from './ThemeProvider';
import { LangProvider } from './LangProvider';
import { swrConfig } from '@/lib/swr';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  // Enregistre le Service Worker pour le cache offline (utile surtout en desktop)
  // Utilise requestIdleCallback pour ne pas bloquer le rendu initial
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(register);
      } else {
        setTimeout(register, 2000);
      }
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SWRConfig value={swrConfig}>
        <LangProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </LangProvider>
      </SWRConfig>
    </QueryClientProvider>
  );
}
