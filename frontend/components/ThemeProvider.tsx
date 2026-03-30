'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

type ThemeMode = 'dark' | 'light';

interface ThemeConfig {
  dark?: Record<string, string>;
  light?: Record<string, string>;
}

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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');
  const [themeConfig, setThemeConfig] = useState<ThemeConfig | null>(null);

  // Fetch admin theme config from API
  useEffect(() => {
    fetch(`${API_URL}/site/settings`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.theme_config) {
          setThemeConfig(data.theme_config);
        }
      })
      .catch(() => {
        // Silently fail — CSS fallback values from globals.css will be used
      });
  }, []);

  // Load saved theme preference
  useEffect(() => {
    const saved = localStorage.getItem('cueforge-theme') as ThemeMode | null;
    if (saved === 'light' || saved === 'dark') setMode(saved);
  }, []);

  // Apply theme class + CSS variable overrides
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(mode);
    localStorage.setItem('cueforge-theme', mode);

    // Apply admin CSS variable overrides if available
    if (themeConfig) {
      const vars = themeConfig[mode];
      if (vars && typeof vars === 'object') {
        Object.entries(vars).forEach(([key, value]) => {
          if (key.startsWith('--') && typeof value === 'string') {
            root.style.setProperty(key, value);
          }
        });
      }
    }
  }, [mode, themeConfig]);

  const toggle = useCallback(() => {
    setMode((m) => (m === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, toggle, isDark: mode === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}
