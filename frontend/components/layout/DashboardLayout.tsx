'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Menu,
  X,
  Search,
  Maximize2,
  Minimize2,
  MoreVertical,
  Music,
  RotateCw,
} from 'lucide-react';

interface Tab {
  id: string;
  label: string;
  order: number;
}

interface DashboardLayoutProps {
  children?: React.ReactNode;
  sidebarContent?: React.ReactNode;
  headerTitle?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  onSearch?: (query: string) => void;
}

interface LayoutState {
  sidebarOpen: boolean;
  fullscreenMode: boolean;
  splitViewMode: boolean;
  searchQuery: string;
  tabs: Tab[];
  activeTabId: string;
}

const BREAKPOINTS = {
  mobile: 640,
  tablet: 1024,
  desktop: 1024,
};

const DEFAULT_TABS: Tab[] = [
  { id: 'tracks', label: 'My Tracks', order: 0 },
  { id: 'playlists', label: 'Playlists', order: 1 },
  { id: 'analysis', label: 'Analysis', order: 2 },
  { id: 'export', label: 'Export', order: 3 },
];

const QUICK_ACCESS_SHORTCUTS = [
  { id: 'recent', label: 'Recent', icon: 'clock', hotkey: 'Cmd+R' },
  { id: 'favorites', label: 'Favorites', icon: 'star', hotkey: 'Cmd+F' },
  { id: 'analyze', label: 'Analyze', icon: 'zap', hotkey: 'Cmd+A' },
  { id: 'export', label: 'Export', icon: 'download', hotkey: 'Cmd+E' },
];

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  sidebarContent,
  headerTitle = 'Dashboard',
  breadcrumbs,
  onSearch,
}) => {
  const [state, setState] = useState<LayoutState>({
    sidebarOpen: true,
    fullscreenMode: false,
    splitViewMode: false,
    searchQuery: '',
    tabs: DEFAULT_TABS,
    activeTabId: 'tracks',
  });

  const [windowWidth, setWindowWidth] = useState<number>(1024);
  const draggedTabRef = useRef<string | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Load UI state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('dashboard_layout');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setState(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.warn('Failed to load dashboard layout', e);
      }
    }

    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Save UI state to localStorage
  const saveState = useCallback((newState: Partial<LayoutState>) => {
    setState(prev => {
      const updated = { ...prev, ...newState };
      try {
        localStorage.setItem('dashboard_layout', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save dashboard layout', e);
      }
      return updated;
    });
  }, []);

  const isMobile = windowWidth < BREAKPOINTS.mobile;
  const isTablet = windowWidth >= BREAKPOINTS.mobile && windowWidth < BREAKPOINTS.tablet;
  const isDesktop = windowWidth >= BREAKPOINTS.desktop;

  // Auto-collapse sidebar on mobile
  useEffect(() => {
    if (isMobile && state.sidebarOpen) {
      saveState({ sidebarOpen: false });
    }
  }, [isMobile, state.sidebarOpen, saveState]);

  const handleToggleSidebar = () => {
    saveState({ sidebarOpen: !state.sidebarOpen });
  };

  const handleToggleFullscreen = () => {
    saveState({ fullscreenMode: !state.fullscreenMode });
  };

  const handleToggleSplitView = () => {
    saveState({ splitViewMode: !state.splitViewMode });
  };

  const handleSearch = (query: string) => {
    saveState({ searchQuery: query });
    onSearch?.(query);
  };

  const handleTabDragStart = (tabId: string) => {
    draggedTabRef.current = tabId;
  };

  const handleTabDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleTabDrop = (dropTabId: string) => {
    if (!draggedTabRef.current) return;

    const draggedTab = state.tabs.find(t => t.id === draggedTabRef.current!);
    const dropTab = state.tabs.find(t => t.id === dropTabId);

    if (draggedTab && dropTab) {
      const newTabs = state.tabs.map(tab => {
        if (tab.id === draggedTab.id) return { ...tab, order: dropTab.order };
        if (tab.id === dropTab.id) return { ...tab, order: draggedTab.order };
        return tab;
      });

      newTabs.sort((a, b) => a.order - b.order);
      saveState({ tabs: newTabs });
    }

    draggedTabRef.current = null;
  };

  const handleSelectTab = (tabId: string) => {
    saveState({ activeTabId: tabId });
  };

  const handleClickShortcut = (shortcutId: string) => {
    console.log('Shortcut clicked:', shortcutId);
    // Trigger appropriate action based on shortcut
  };

  // Sort tabs by order
  const sortedTabs = [...state.tabs].sort((a, b) => a.order - b.order);

  if (state.fullscreenMode) {
    return (
      <div className="w-full h-screen bg-slate-900 flex flex-col">
        {/* Mini header in fullscreen mode */}
        <div className="h-12 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Music size={18} className="text-blue-400" />
            <span className="text-white font-semibold">Fullscreen Mode</span>
          </div>
          <button
            onClick={handleToggleFullscreen}
            className="p-1 hover:bg-slate-700 rounded transition-colors"
            title="Exit fullscreen"
          >
            <Minimize2 size={18} className="text-slate-400" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 lg:px-6 gap-4 flex-shrink-0">
        {/* Left: Menu + Breadcrumbs */}
        <div className="flex items-center gap-3 lg:gap-4 min-w-0">
          <button
            onClick={handleToggleSidebar}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
            title="Toggle sidebar"
          >
            {state.sidebarOpen ? (
              <X size={20} className="text-slate-300" />
            ) : (
              <Menu size={20} className="text-slate-300" />
            )}
          </button>

          {/* Breadcrumbs */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="hidden md:flex items-center gap-2 text-sm min-w-0">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="text-slate-500">/</span>}
                  {crumb.href ? (
                    <a
                      href={crumb.href}
                      className="text-slate-400 hover:text-white transition-colors truncate"
                    >
                      {crumb.label}
                    </a>
                  ) : (
                    <span className="text-slate-300 truncate">{crumb.label}</span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          )}

          <h1 className="text-lg font-semibold text-white hidden md:block truncate">
            {headerTitle}
          </h1>
        </div>

        {/* Center: Search */}
        <div className="flex-1 max-w-md hidden md:block">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500"
            />
            <input
              type="text"
              placeholder="Search tracks..."
              value={state.searchQuery}
              onChange={e => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleToggleSplitView}
            className={`p-2 rounded-lg transition-colors ${
              state.splitViewMode
                ? 'bg-blue-500/20 text-blue-400'
                : 'hover:bg-slate-700 text-slate-400'
            }`}
            title="Toggle split view"
          >
            <RotateCw size={18} />
          </button>
          <button
            onClick={handleToggleFullscreen}
            className="p-2 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors"
            title="Fullscreen mode"
          >
            <Maximize2 size={18} />
          </button>
          <button
            className="p-2 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors"
            title="More options"
          >
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden gap-0">
        {/* Sidebar */}
        {state.sidebarOpen && (
          <div
            ref={sidebarRef}
            className={`${
              isMobile ? 'absolute top-16 left-0 z-40 w-72 transition-all duration-300' : 'w-72'
            } bg-slate-800 border-r border-slate-700 flex flex-col overflow-hidden`}
          >
              <div className="overflow-y-auto flex-1 p-4 space-y-2">
                {sidebarContent || (
                  <>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase px-2 py-2">
                      Navigation
                    </h3>
                    <nav className="space-y-1">
                      {[
                        { icon: 'home', label: 'Home' },
                        { icon: 'music', label: 'Library' },
                        { icon: 'star', label: 'Favorites' },
                        { icon: 'settings', label: 'Settings' },
                      ].map(item => (
                        <button
                          key={item.label}
                          className="w-full text-left px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors"
                        >
                          {item.label}
                        </button>
                      ))}
                    </nav>
                  </>
                )}
              </div>
            </div>
          )}

        {/* Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="h-12 bg-slate-800 border-b border-slate-700 flex items-center px-4 overflow-x-auto">
            <div className="flex gap-0">
              {sortedTabs.map(tab => (
                <div
                  key={tab.id}
                  draggable
                  onDragStart={() => handleTabDragStart(tab.id)}
                  onDragOver={handleTabDragOver}
                  onDrop={() => handleTabDrop(tab.id)}
                  onClick={() => handleSelectTab(tab.id)}
                  className={`cursor-move px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                    state.activeTabId === tab.id
                      ? 'border-blue-500 text-blue-400 bg-slate-700/50'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </div>
              ))}
            </div>
          </div>

          {/* Split View or Single View */}
          {state.splitViewMode ? (
            <div className="flex-1 flex gap-0 overflow-hidden">
              <div className="flex-1 overflow-auto border-r border-slate-700 p-4">
                <div className="text-slate-400 text-sm">Left Panel - Track 1</div>
              </div>
              <div className="flex-1 overflow-auto p-4">
                <div className="text-slate-400 text-sm">Right Panel - Track 2</div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">{children}</div>
          )}
        </div>
      </div>

      {/* Mini Player (Fixed at Bottom) */}
      <div className="h-24 bg-slate-800 border-t border-slate-700 flex items-center px-4 lg:px-6 gap-4 flex-shrink-0 overflow-hidden">
        <div className="w-16 h-16 bg-slate-700 rounded-lg flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold truncate">Current Track</p>
          <p className="text-slate-400 text-sm truncate">Artist Name</p>
          <div className="w-full h-1 bg-slate-700 rounded-full mt-2 cursor-pointer">
            <div className="h-full w-1/3 bg-blue-500 rounded-full" />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button className="p-2 hover:bg-slate-700 rounded transition-colors">
            <Music size={18} className="text-slate-400" />
          </button>
          <div className="text-sm text-slate-400">2:15 / 6:30</div>
        </div>
      </div>

      {/* Quick-Access Toolbar (Floating) */}
      {isDesktop && (
        <div
          className="fixed bottom-32 right-6 z-30 opacity-100"
        >
          <div className="flex flex-col gap-2 bg-slate-800 rounded-lg p-2 border border-slate-700 shadow-lg">
            {QUICK_ACCESS_SHORTCUTS.map(shortcut => (
              <button
                key={shortcut.id}
                onClick={() => handleClickShortcut(shortcut.id)}
                className="p-3 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors group relative hover:scale-110 active:scale-95"
                title={`${shortcut.label} (${shortcut.hotkey})`}
              >
                <span className="block">
                  {shortcut.icon === 'clock' && <RotateCw size={18} />}
                  {shortcut.icon === 'star' && '★'}
                  {shortcut.icon === 'zap' && '⚡'}
                  {shortcut.icon === 'download' && '↓'}
                </span>
                <div className="absolute right-full mr-2 bottom-1/2 transform translate-y-1/2 bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {shortcut.label}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mobile search overlay */}
    </div>
  );
};

export default DashboardLayout;
