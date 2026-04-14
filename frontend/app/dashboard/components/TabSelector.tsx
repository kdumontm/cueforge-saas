'use client';

import { tr } from '@/lib/i18n';
import { useLang } from '@/components/LangProvider';

export interface TabSelectorProps {
  tabs: Array<{ id: string; labelKey: string; icon: string; featureKey?: string; desktopOnly?: boolean; global?: boolean }>;
  activeTab: string;
  onTabSelect: (tabId: string) => void;
  selectedTrack: any | null;
  userPlan: string;
  getFeatureDisplayMode: (featureKey: string) => 'enabled' | 'locked' | 'disabled';
}

export default function TabSelector({
  tabs,
  activeTab,
  onTabSelect,
  selectedTrack,
  userPlan,
  getFeatureDisplayMode,
}: TabSelectorProps) {
  const { lang } = useLang();

  return (
    <div className="w-11 sm:w-14 flex-shrink-0 flex flex-col bg-[var(--bg-primary)] border-r border-[var(--border-subtle)] py-1 overflow-y-auto">
      {tabs.map(t => {
        const noTrack = !selectedTrack && !(t as any).global;
        const fk = (t as any).featureKey;
        const featureLocked = fk ? getFeatureDisplayMode(fk) === 'locked' : false;
        const disabled = noTrack || featureLocked;
        return (
          <button
            key={t.id}
            onClick={() => !disabled && onTabSelect(t.id)}
            disabled={disabled}
            title={featureLocked ? `Upgrade vers ${userPlan === 'free' ? 'Pro' : 'Unlimited'} pour débloquer` : undefined}
            className={`relative flex flex-col items-center gap-0.5 sm:gap-1 py-2 sm:py-3 px-0.5 sm:px-1 transition-all border-none ${
              activeTab === t.id
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                : featureLocked
                  ? 'text-[var(--text-muted)] opacity-25 cursor-not-allowed'
                  : noTrack
                    ? 'text-[var(--text-muted)] opacity-30 cursor-not-allowed'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer'
            }`}
          >
            {activeTab === t.id && (
              <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-blue-500 rounded-r" />
            )}
            <span className="text-base leading-none">{featureLocked ? '🔒' : t.icon}</span>
            <span className="text-[7px] sm:text-[8px] font-semibold uppercase tracking-wider leading-none">{tr((t as any).labelKey, lang)}</span>
            {featureLocked && (
              <span className="absolute top-0.5 right-0.5 text-[6px] font-bold text-amber-400 bg-amber-500/20 px-1 rounded">PRO</span>
            )}
            {!featureLocked && (t as any).desktopOnly && (
              <span className="absolute top-0.5 right-0.5 text-[6px] font-bold text-emerald-400 bg-emerald-500/20 px-1 rounded">PRO</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
