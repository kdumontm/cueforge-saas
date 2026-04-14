"use client";
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

/**
 * Admin Modules Context
 * Permet d'activer/désactiver des modules entiers de la sidebar admin.
 * Persisté dans localStorage sous la clé "admin_disabled_modules".
 * Par défaut TOUT est activé — seuls les modules explicitement désactivés sont masqués.
 */

interface AdminModulesCtx {
  /** Set des IDs de modules désactivés */
  disabledModules: Set<string>;
  /** Toggle un module on/off */
  toggleModule: (id: string) => void;
  /** Activer tous les modules */
  enableAll: () => void;
  /** Désactiver tous les modules sauf les essentiels */
  disableAll: (essentialIds: string[]) => void;
  /** Vérifier si un module est activé */
  isEnabled: (id: string) => boolean;
  /** Nombre de modules désactivés */
  disabledCount: number;
}

const AdminModulesContext = createContext<AdminModulesCtx>({
  disabledModules: new Set(),
  toggleModule: () => {},
  enableAll: () => {},
  disableAll: () => {},
  isEnabled: () => true,
  disabledCount: 0,
});

const STORAGE_KEY = "admin_disabled_modules";

export function AdminModulesProvider({ children }: { children: ReactNode }) {
  const [disabledModules, setDisabledModules] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          setDisabledModules(new Set(arr));
        }
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...disabledModules]));
    } catch {
      // ignore
    }
  }, [disabledModules, loaded]);

  const toggleModule = useCallback((id: string) => {
    setDisabledModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const enableAll = useCallback(() => {
    setDisabledModules(new Set());
  }, []);

  const disableAll = useCallback((essentialIds: string[]) => {
    // On ne désactive pas les modules essentiels
    setDisabledModules((prev) => {
      // This will be populated by the caller with all IDs minus essentials
      return prev; // placeholder — actual logic in the page
    });
  }, []);

  const isEnabled = useCallback(
    (id: string) => !disabledModules.has(id),
    [disabledModules]
  );

  return (
    <AdminModulesContext.Provider
      value={{
        disabledModules,
        toggleModule,
        enableAll,
        disableAll: (essentialIds: string[]) => {
          // Won't be used directly — the page handles bulk logic
        },
        isEnabled,
        disabledCount: disabledModules.size,
      }}
    >
      {children}
    </AdminModulesContext.Provider>
  );
}

export function useAdminModules() {
  return useContext(AdminModulesContext);
}

export { AdminModulesContext };
