'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { getCurrentUser, getToken } from '@/lib/api';

export type LibraryFilter = 'all' | 'recent' | 'unanalyzed';
export type SidebarSection = LibraryFilter | string;

interface DashboardContextValue {
  // Sidebar
  collapsed: boolean;
  toggleCollapsed: () => void;
  activeSection: SidebarSection;
  setActiveSection: (s: SidebarSection) => void;

  // Global search (TopBar → TrackList)
  globalSearch: string;
  setGlobalSearch: (q: string) => void;
  showSearchModal: boolean;
  setShowSearchModal: (v: boolean) => void;

  // Notifications
  showNotifications: boolean;
  setShowNotifications: (v: boolean) => void;

  // File import trigger
  triggerImport: () => void;
  registerImportHandler: (fn: () => void) => void;

  // Export trigger
  triggerExport: () => void;
  registerExportHandler: (fn: () => void) => void;

  // Analyse state — DashboardV2 registers these, TopBar reads them
  unanalyzedCount: number;
  setUnanalyzedCount: (n: number) => void;
  autoAnalyze: boolean;
  setAutoAnalyze: (v: boolean | ((prev: boolean) => boolean)) => void;
  // Stable callback — does NOT change on every tracks update, no re-render storm
  triggerAnalyzeAll: () => void;
  registerAnalyzeAllHandler: (fn: () => void) => void;

  // Selected track ID — lives in context so it survives DashboardV2 remounts
  persistedTrackId: number | null;
  setPersistedTrackId: (id: number | null) => void;

  // Feature flags — contrôle les fonctionnalités visibles selon le plan
  isFeatureEnabled: (featureName: string) => boolean;
  /** Retourne "hidden" si la feature doit disparaître, "locked" si elle doit être grisée */
  getFeatureDisplayMode: (featureName: string) => 'hidden' | 'locked' | 'visible';
  userPlan: string;
  featuresLoaded: boolean;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState<SidebarSection>('all');
  const [globalSearch, setGlobalSearch] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [importHandler, setImportHandler] = useState<(() => void) | null>(null);
  const [exportHandler, setExportHandler] = useState<(() => void) | null>(null);
  const [unanalyzedCount, setUnanalyzedCount] = useState(0);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [persistedTrackId, setPersistedTrackId] = useState<number | null>(null);

  // Feature flags
  const [planFeatures, setPlanFeatures] = useState<Record<string, boolean>>({});
  const [displayModes, setDisplayModes] = useState<Record<string, string>>({});
  const [userPlan, setUserPlan] = useState('free');
  const [featuresLoaded, setFeaturesLoaded] = useState(false);

  // Charge les features du plan de l'utilisateur
  useEffect(() => {
    const loadPlanFeatures = async () => {
      try {
        const user = await getCurrentUser();
        const plan = (user as any)?.subscription_plan || 'free';
        setUserPlan(plan);

        const token = getToken();
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
        const res = await fetch(`${apiBase}/site/plan-features/${plan}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setPlanFeatures(data.features || {});
          setDisplayModes(data.display_modes || {});
        }
      } catch (e) {
        console.error('Failed to load plan features:', e);
      } finally {
        setFeaturesLoaded(true);
      }
    };
    loadPlanFeatures();
  }, []);

  // Si la feature n'existe pas en DB, elle est autorisée par défaut
  const isFeatureEnabled = useCallback((featureName: string) => {
    if (!featuresLoaded) return false;
    return planFeatures[featureName] ?? true;
  }, [planFeatures, featuresLoaded]);

  // Retourne le mode d'affichage : "visible", "hidden" ou "locked"
  // Pendant le chargement, masquer les modules pour éviter un flash
  const getFeatureDisplayMode = useCallback((featureName: string): 'hidden' | 'locked' | 'visible' => {
    if (!featuresLoaded) return 'hidden';
    const enabled = planFeatures[featureName] ?? true;
    if (enabled) return 'visible';
    return (displayModes[featureName] as 'hidden' | 'locked') || 'locked';
  }, [planFeatures, displayModes, featuresLoaded]);

  // Use a ref to store the handler — updating it never triggers a re-render
  const analyzeAllHandlerRef = useRef<(() => void) | null>(null);

  const toggleCollapsed = useCallback(() => setCollapsed(p => !p), []);
  const registerImportHandler = useCallback((fn: () => void) => {
    setImportHandler(() => fn);
  }, []);
  const triggerImport = useCallback(() => {
    importHandler?.();
  }, [importHandler]);

  const registerExportHandler = useCallback((fn: () => void) => {
    setExportHandler(() => fn);
  }, []);
  const triggerExport = useCallback(() => {
    exportHandler?.();
  }, [exportHandler]);

  // Stable: just update the ref, no state change, no re-renders
  const registerAnalyzeAllHandler = useCallback((fn: () => void) => {
    analyzeAllHandlerRef.current = fn;
  }, []);

  // Stable: always calls whatever is in the ref at the time
  const triggerAnalyzeAll = useCallback(() => {
    analyzeAllHandlerRef.current?.();
  }, []);

  return (
    <DashboardContext.Provider value={{
      collapsed, toggleCollapsed,
      activeSection, setActiveSection,
      globalSearch, setGlobalSearch,
      showSearchModal, setShowSearchModal,
      showNotifications, setShowNotifications,
      triggerImport, registerImportHandler,
      triggerExport, registerExportHandler,
      unanalyzedCount, setUnanalyzedCount,
      autoAnalyze, setAutoAnalyze,
      triggerAnalyzeAll, registerAnalyzeAllHandler,
      persistedTrackId, setPersistedTrackId,
      isFeatureEnabled, getFeatureDisplayMode, userPlan, featuresLoaded,
    }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardContext() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboardContext must be used within DashboardProvider');
  return ctx;
}
