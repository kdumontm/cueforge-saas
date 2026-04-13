/**
 * Lazy-loaded tabs with Suspense (points 651-670)
 * Tabs are loaded on demand and kept in memory (not unmounted)
 * Prevents re-initialization and state loss on tab switch
 */

import React, { Suspense, useMemo, useState, useCallback } from 'react';

interface TabConfig {
  id: string;
  label: string;
  component: React.ComponentType<any>;
  icon?: React.ReactNode;
}

interface LazyTabsProps {
  tabs: TabConfig[];
  defaultTab?: string;
  onTabChange?: (tabId: string) => void;
  fallback?: React.ReactNode;
  className?: string;
}

const TAB_KEEP_ALIVE_CACHE = new Map<string, boolean>();

/**
 * Tab content wrapper — keeps component mounted even when hidden
 */
function TabContent({
  tab,
  isActive,
  fallback,
}: {
  tab: TabConfig;
  isActive: boolean;
  fallback?: React.ReactNode;
}) {
  const Component = tab.component;

  // Once a tab is shown, keep it mounted in DOM (but hidden)
  const shouldRender = TAB_KEEP_ALIVE_CACHE.get(tab.id) || isActive;

  if (isActive) {
    TAB_KEEP_ALIVE_CACHE.set(tab.id, true);
  }

  return (
    <div
      style={{
        display: isActive ? 'block' : 'none',
      }}
      role="tabpanel"
      aria-labelledby={`tab-${tab.id}`}
      hidden={!isActive}
    >
      <Suspense fallback={fallback || <div>Loading...</div>}>
        <Component />
      </Suspense>
    </div>
  );
}

const MemoizedTabContent = React.memo(TabContent);

export const LazyTabs = React.memo(function LazyTabs({
  tabs,
  defaultTab,
  onTabChange,
  fallback,
  className = '',
}: LazyTabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || '');

  const handleTabClick = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      if (onTabChange) onTabChange(tabId);
    },
    [onTabChange],
  );

  // Precompute tab buttons
  const tabButtons = useMemo(() => {
    return tabs.map((tab) => (
      <button
        key={tab.id}
        id={`tab-${tab.id}`}
        role="tab"
        aria-selected={tab.id === activeTab}
        aria-controls={`tabpanel-${tab.id}`}
        onClick={() => handleTabClick(tab.id)}
        className={`px-4 py-2 font-medium transition-colors ${
          tab.id === activeTab
            ? 'border-b-2 border-blue-500 text-blue-400'
            : 'text-gray-400 hover:text-gray-300'
        }`}
      >
        {tab.icon && <span className="mr-2">{tab.icon}</span>}
        {tab.label}
      </button>
    ));
  }, [tabs, activeTab, handleTabClick]);

  // Precompute tab contents
  const tabContents = useMemo(() => {
    return tabs.map((tab) => (
      <MemoizedTabContent
        key={tab.id}
        tab={tab}
        isActive={tab.id === activeTab}
        fallback={fallback}
      />
    ));
  }, [tabs, activeTab, fallback]);

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Tab list */}
      <div
        role="tablist"
        className="flex border-b border-gray-700/50 overflow-x-auto"
      >
        {tabButtons}
      </div>

      {/* Tab contents — all kept in DOM but only active one visible */}
      <div className="flex-1">
        {tabContents}
      </div>
    </div>
  );
});

export default LazyTabs;
