'use client';

import ThemeProvider from './ThemeProvider';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
