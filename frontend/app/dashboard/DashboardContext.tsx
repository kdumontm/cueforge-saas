'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type LibraryFilter = 'all' | 'recent' | 'unanalyzed';
export type SidebarSection = LibraryFilter | string; // string pour smart crates / playlists

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
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState<SidebarSection>('all');
  const [globalSearch, setGlobalSearch] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [importHandler, setImportHandler] = useState<(() => void) | null>(null);

  const toggleCollapsed = useCallback(() => setCollapsed(p => !p), []);
  const registerImportHandler = useCallback((fn: () => void) => {
    setImportHandler(() => fn);
  }, []);
  const triggerImport = useCallback(() => {
    importHandler?.();
  }, [importHandler]);

  return (
    <DashboardContext.Provider value={{
      collapsed, toggleCollapsed,
      activeSection, setActiveSection,
      globalSearch, setGlobalSearch,
      showSearchModal, setShowSearchModal,
      showNotifications, setShowNotifications,
      triggerImport, registerImportHandler,
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
