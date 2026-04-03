'use client';

import ThemeProvider from './ThemeProvider';
import { LangProvider } from './LangProvider';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <LangProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </LangProvider>
  );
}
