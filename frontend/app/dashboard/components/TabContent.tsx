'use client';

import { Suspense, lazy } from 'react';
import { tr, type Lang } from '@/lib/i18n';
import { useLang } from '@/components/LangProvider';
import { updateTrack } from '@/lib/api';

// Lazy-loaded tab components
const InfoEditTab = lazy(() => import('@/components/tabs/InfoEditTab'));
const CuesTab = lazy(() => import('@/components/tabs/CuesTab'));
const BeatgridTab = lazy(() => import('@/components/tabs/BeatgridTab'));
const StemsTab = lazy(() => import('@/components/tabs/StemsTab'));
const EQTab = lazy(() => import('@/components/tabs/EQTab'));
const FXTab = lazy(() => import('@/components/tabs/FXTab'));
const MixTab = lazy(() => import('@/components/tabs/MixTab'));
const PlaylistsTab = lazy(() => import('@/components/tabs/PlaylistsTab'));
const StatsTab = lazy(() => import('@/components/tabs/StatsTab'));
const CompareTab = lazy(() => import('@/components/tabs/CompareTab'));
const PlaylistBuilder = lazy(() => import('@/components/playlist/PlaylistBuilder'));
const SettingsPanel = lazy(() => import('@/components/settings/SettingsPanel'));

const TabFallback = () => {
  const { lang } = useLang();
  return <div className="p-4 flex items-center justify-center text-[var(--text-muted)] text-xs" aria-busy={true}>{tr('general.loading', lang)}</div>;
};

export interface TabContentProps {
  activeTab: string;
  selectedTrack: any | null;
  selectedRawTrack: any | null;
  effectiveCuePoints: any[];
  cuePositionMs: number | null;
  userPlan: string;
  getFeatureDisplayMode: (featureKey: string) => 'hidden' | 'locked' | 'visible';
  lang: Lang;
  playerRef: React.MutableRefObject<any>;
  stemsStatus: any;
  stemMuted: Set<string>;
  fxParams: Record<string, number>;
  sessionNotes: string;
  playlists: any[];
  rawTracksForTabs: any[];

  // Handlers
  onAutoCuePoints: () => void;
  onCreateCue: (data: any) => void;
  onDeleteCue: (cueId: number) => void;
  onRegenerateCues: () => void;
  onCueClick: (cue: any) => void;
  onPreviewCue: (cue: any) => void;
  onSaveTrack: (trackId: number, data: any) => void;
  onToggleStemMute: (key: string) => void;
  onRequestStems: () => void;
  onFxChange: (effect: string, value: number) => void;
  onResetAllFx: () => void;
  onSessionNotesChange: (notes: string) => void;
  onSelectTrack: (track: any) => void;
  onPlaylistSelect: (playlist: any) => void;
  onPlaylistCreate: (name: string) => void;
  onPlaylistDelete: (id: number) => void;
  onToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  onLoadTracks: () => void;
}

export default function TabContent({
  activeTab,
  selectedTrack,
  selectedRawTrack,
  effectiveCuePoints,
  cuePositionMs,
  userPlan,
  getFeatureDisplayMode,
  lang,
  playerRef,
  stemsStatus,
  stemMuted,
  fxParams,
  sessionNotes,
  playlists,
  rawTracksForTabs,
  onAutoCuePoints,
  onCreateCue,
  onDeleteCue,
  onRegenerateCues,
  onCueClick,
  onPreviewCue,
  onSaveTrack,
  onToggleStemMute,
  onRequestStems,
  onFxChange,
  onResetAllFx,
  onSessionNotesChange,
  onSelectTrack,
  onPlaylistSelect,
  onPlaylistCreate,
  onPlaylistDelete,
  onToast,
  onLoadTracks,
}: TabContentProps) {
  // Check if feature is locked
  const activeTabDef = [
    { id: 'info', featureKey: undefined },
    { id: 'cues', featureKey: 'cue_generation' },
    { id: 'beatgrid', featureKey: 'beatgrid' },
    { id: 'mix', featureKey: 'mix_analysis' },
    { id: 'eq', featureKey: 'eq_analysis' },
    { id: 'fx', featureKey: 'fx_suggestions' },
    { id: 'stems', featureKey: 'stems' },
    { id: 'compare', featureKey: 'compare' },
    { id: 'playlists', featureKey: 'playlists' },
    { id: 'stats', featureKey: undefined },
    { id: 'notes', featureKey: undefined },
    { id: 'playlist-builder', featureKey: 'playlists' },
    { id: 'settings', featureKey: undefined },
  ].find(t => t.id === activeTab);

  const fk = activeTabDef?.featureKey;
  const locked = fk && getFeatureDisplayMode(fk) === 'locked';

  if (locked) {
    const upgradePlan = userPlan === 'free' ? 'Pro' : 'Unlimited';
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <div className="text-4xl">🔒</div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          Fonctionnalité verrouillée
        </p>
        <p className="text-xs text-[var(--text-muted)] max-w-[200px]">
          Passe au plan <span className="text-amber-400 font-bold">{upgradePlan}</span> pour débloquer cette fonctionnalité.
        </p>
        <a
          href="/billing"
          className="mt-2 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold hover:opacity-90 transition-opacity no-underline"
        >
          Voir les plans
        </a>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      {activeTab === 'info' && (
        <InfoEditTab
          track={selectedRawTrack}
          onSave={async (trackId, data) => {
            await onSaveTrack(trackId, data);
            onToast(tr('toast.saved', lang), 'success');
            await onLoadTracks();
          }}
        />
      )}

      {activeTab === 'cues' && (
        <div className="flex flex-col h-full">
          {selectedTrack && selectedTrack.id > 0 && (
            <div className="px-3 pt-2 pb-1 border-b border-[var(--border-subtle)] flex-shrink-0">
              <button
                onClick={onAutoCuePoints}
                className="w-full px-2 py-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 text-purple-400 text-xs font-semibold hover:bg-purple-500/20 transition-colors cursor-pointer"
              >
                ✨ Auto-générer les cue points
              </button>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden">
            <Suspense fallback={<TabFallback />}>
              <CuesTab
                track={selectedTrack}
                cuePoints={effectiveCuePoints}
                onCreateCue={onCreateCue}
                onDeleteCue={onDeleteCue}
                onRegenerateCues={onRegenerateCues}
                initialPositionMs={cuePositionMs}
                onCueClick={onCueClick}
                onPreviewCue={onPreviewCue}
              />
            </Suspense>
          </div>
        </div>
      )}

      {activeTab === 'stems' && (
        <Suspense fallback={<TabFallback />}>
          <StemsTab
            track={selectedTrack}
            stemsStatus={stemsStatus}
            mutedStems={stemMuted}
            onToggleMute={onToggleStemMute}
            onRequestStems={onRequestStems}
          />
        </Suspense>
      )}

      {activeTab === 'eq' && (
        <Suspense fallback={<TabFallback />}>
          <EQTab playerRef={playerRef} />
        </Suspense>
      )}

      {activeTab === 'fx' && (
        <Suspense fallback={<TabFallback />}>
          <FXTab
            fxParams={fxParams}
            onFxChange={onFxChange}
            onResetAll={onResetAllFx}
          />
        </Suspense>
      )}

      {activeTab === 'mix' && (
        <Suspense fallback={<TabFallback />}>
          <MixTab track={selectedRawTrack} tracks={rawTracksForTabs} />
        </Suspense>
      )}

      {activeTab === 'compare' && (
        <Suspense fallback={<TabFallback />}>
          <CompareTab trackA={selectedRawTrack} allTracks={rawTracksForTabs} onSelectTrack={onSelectTrack} />
        </Suspense>
      )}

      {activeTab === 'beatgrid' && (
        <Suspense fallback={<TabFallback />}>
          <BeatgridTab
            track={selectedRawTrack}
            beatgrid={selectedRawTrack?.analysis ? {
              bpm: selectedRawTrack.analysis.bpm ?? null,
              downbeat_ms: (selectedRawTrack.analysis as any).downbeat_ms ?? 0,
              locked: false,
            } : undefined}
            onUpdateBeatgrid={async (bg) => {
              if (!selectedRawTrack) return;
              try {
                const token = (await import('@/lib/api')).getToken();
                const AURL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
                await fetch(`${AURL}/tracks/${selectedRawTrack.id}/beatgrid`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                  body: JSON.stringify(bg),
                });
                onToast(tr('toast.saved', lang), 'success');
              } catch {
                onToast(tr('toast.error', lang), 'error');
              }
            }}
          />
        </Suspense>
      )}

      {activeTab === 'playlists' && (
        <Suspense fallback={<TabFallback />}>
          <PlaylistsTab
            playlists={playlists}
            onSelect={onPlaylistSelect}
            onCreate={onPlaylistCreate}
            onDelete={onPlaylistDelete}
          />
        </Suspense>
      )}

      {activeTab === 'stats' && (
        <Suspense fallback={<TabFallback />}>
          <StatsTab tracks={rawTracksForTabs} />
        </Suspense>
      )}

      {activeTab === 'playlist-builder' && (
        <Suspense fallback={<TabFallback />}>
          <PlaylistBuilder tracks={[]} allAvailableTracks={rawTracksForTabs} />
        </Suspense>
      )}

      {activeTab === 'settings' && (
        <Suspense fallback={<TabFallback />}>
          <SettingsPanel />
        </Suspense>
      )}

      {activeTab === 'notes' && (
        <div className="flex flex-col h-full p-3 gap-2">
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">Notes de session</div>
          <textarea
            value={sessionNotes}
            onChange={e => {
              const v = e.target.value;
              onSessionNotesChange(v);
            }}
            placeholder="Tes notes, idées, setlist, observations…"
            className="flex-1 min-h-[200px] p-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-blue-500 resize-none leading-relaxed"
          />
          <div className="flex gap-2">
            <button
              onClick={() => onSessionNotesChange('')}
              className="px-2 py-1 rounded border border-[var(--border-default)] text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            >
              Effacer
            </button>
            <button
              onClick={() => {
                const blob = new Blob([sessionNotes], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'notes-session.txt';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-2 py-1 rounded border border-[var(--border-default)] text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              title="Exporter les notes"
            >
              ⬇ Export
            </button>
            <span className="ml-auto text-[10px] text-[var(--text-muted)] self-end">
              {sessionNotes.length} car.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
