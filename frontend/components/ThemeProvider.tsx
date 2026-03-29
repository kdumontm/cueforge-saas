'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

type ThemeMode = 'dark' | 'light';

interface ThemeContextType {
  mode: ThemeMode;
  toggle: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'dark',
  toggle: () => {},
  isDark: true,
});

export const useTheme = () => useContext(ThemeContext);

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('cueforge-theme') as ThemeMode | null;
    if (saved === 'light' || saved === 'dark') setMode(saved);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(mode);
    localStorage.setItem('cueforge-theme', mode);
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((m) => (m === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, toggle, isDark: mode === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}
