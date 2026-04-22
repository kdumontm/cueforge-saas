'use client';

import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo, Suspense } from 'react';
import { lazyRetry } from '@/lib/lazyRetry';
import { Upload, Loader2, Zap, RefreshCw, MoreVertical, Trash2, Copy, Download, X } from 'lucide-react';
import { uploadTrack, analyzeTrack, pollTrackUntilDone, listTracks, deleteTrack, batchDeleteTracks, getTrack, getCurrentUser, isAuthenticated, getTrackCuePoints, createCuePoint, deleteCuePoint, batchDeleteCuePoints, deleteAllCuePoints, regenerateCuePoints, exportRekordbox, exportBatchRekordbox, exportAllRekordbox, updateTrack, recordPlay, listPlaylists, createPlaylist, deletePlaylist as apiDeletePlaylist, getPlaylistTracks, addTracksToPlaylist, listSets, getCrateTracks, getDemoMode, getCueQualityScore, optimizeCues, getCueSuggestions, getCueHistory, searchCues, identifyTrack, type Playlist } from '@/lib/api';
import type { Track } from '@/types';
import { useDashboardContext } from './DashboardContext';
import { useLang } from '@/components/LangProvider';
import { tr } from '@/lib/i18n';
import { useInitialLoad } from '@/hooks/useInitialLoad';

// All components lazy-loaded with automatic retry on chunk failure
const PlayerCard = lazyRetry(() => import('@/components/player/PlayerCard'));
const TrackList = lazyRetry(() => import('@/components/tracks/TrackList'));
const InfoEditTab = lazyRetry(() => import('@/components/tabs/InfoEditTab'));
const CuesTab = lazyRetry(() => import('@/components/tabs/CuesTab'));
// Tabs secondaires — lazy-loaded (code splitting)
const BeatgridTab   = lazyRetry(() => import('@/components/tabs/BeatgridTab'));
const StemsTab      = lazyRetry(() => import('@/components/tabs/StemsTab'));
const EQTab         = lazyRetry(() => import('@/components/tabs/EQTab'));
const FXTab         = lazyRetry(() => import('@/components/tabs/FXTab'));
const MixTab        = lazyRetry(() => import('@/components/tabs/MixTab'));
const PlaylistsTab  = lazyRetry(() => import('@/components/tabs/PlaylistsTab'));
const StatsTab      = lazyRetry(() => import('@/components/tabs/StatsTab'));
// HistoryTab retiré
const CompareTab    = lazyRetry(() => import('@/components/tabs/CompareTab'));
const BatchActionBar = lazyRetry(() => import('@/components/tracks/BatchActionBar'));
const KeyboardShortcutsModal = lazyRetry(() => import('@/components/KeyboardShortcutsModal'));
import { isDesktopApp } from '@/lib/electron';
const DuplicateDetector = lazyRetry(() => import('@/components/DuplicateDetector'));
const MetadataEnrichModal = lazyRetry(() => import('@/components/MetadataEnrichModal'));
const OnboardingTour = lazyRetry(() => import('@/components/OnboardingTour'));
const AnalysisProgress = lazyRetry(() => import('@/components/AnalysisProgress'));

// Advanced components (Vague 2000)
const PlayerAdvanced = lazyRetry(() => import('@/components/player/PlayerAdvanced'));
const WaveformAdvanced = lazyRetry(() => import('@/components/player/WaveformAdvanced'));
const StemsAdvanced = lazyRetry(() => import('@/components/tabs/StemsTab'));
const PlaylistBuilder = lazyRetry(() => import('@/components/playlist/PlaylistBuilder'));
const SettingsPanel = lazyRetry(() => import('@/components/settings/SettingsPanel'));

// Extracted sub-components
import TabSelector from './components/TabSelector';
import TabContent from './components/TabContent';
import TrackContextMenu from './components/TrackContextMenu';
import AnalysisProgressIndicator from './components/AnalysisProgressIndicator';

const TabFallback = () => {
  const { lang } = useLang();
  return <div className="p-4 flex items-center justify-center text-[var(--text-muted)] text-xs" aria-busy={true}>{tr('general.loading', lang)}</div>;
};

// ── Helpers centralisés ───────────────────────────────────────────────
import { toCamelot, formatDuration, energyColor, energyRating, energyLabel } from '@/lib/formatters';
import { keyToCamelot } from '@/lib/camelot';
import { getKeyColor, getCompatibleKeys } from '@/lib/constants';
import { isDevelopment } from '@/lib/config';
import { generateTrackCSV, generateTrackTXT, downloadBlob } from './utils/exportHandlers';

// ── Tab config ─────────────────────────────────────────────────────────
const TABS = [
  { id: 'info',      labelKey: 'tab.info',      icon: '📝' },
  { id: 'cues',      labelKey: 'tab.cues',      icon: '🎯', featureKey: 'cue_generation' },
  { id: 'beatgrid',  labelKey: 'tab.beatgrid',  icon: '🥁', featureKey: 'beatgrid' },
  { id: 'mix',       labelKey: 'tab.mix',       icon: '🎡', featureKey: 'mix_analysis' },
  { id: 'eq',        labelKey: 'tab.eq',        icon: '〰', featureKey: 'eq_analysis' },
  { id: 'fx',        labelKey: 'tab.fx',        icon: '✨', featureKey: 'fx_suggestions' },
  { id: 'stems',     labelKey: 'tab.stems',     icon: '🎸', desktopOnly: true, featureKey: 'stems' },
  { id: 'compare',   labelKey: 'tab.compare',   icon: '⚖️', featureKey: 'compare' },
  { id: 'playlists', labelKey: 'tab.playlists',icon: '📂', global: true, featureKey: 'playlists' },
  { id: 'stats',     labelKey: 'tab.stats',     icon: '📊', global: true, featureKey: 'stats' },
  { id: 'notes',     labelKey: 'tab.notes',     icon: '📋', global: true },
  { id: 'playlist-builder', labelKey: 'tab.playlistBuilder', icon: '🎵', global: true, featureKey: 'playlists' },
  { id: 'settings', labelKey: 'tab.settings', icon: '⚙️', global: true },
];

const GLOBAL_TABS: string[] = ['playlists', 'stats', 'notes', 'playlist-builder', 'settings'];

// ── Demo data (full Track objects + flat display objects) ──────────────
const DEMO_CUE_POINTS = [
  { id: -1, position_ms: 32000, cue_type: 'hot_cue', name: 'Intro', color: '#22c55e', number: 0, end_position_ms: null },
  { id: -2, position_ms: 105000, cue_type: 'hot_cue', name: 'Drop', color: '#ef4444', number: 2, end_position_ms: null },
  { id: -3, position_ms: 250000, cue_type: 'hot_cue', name: 'Break', color: '#3b82f6', number: 4, end_position_ms: null },
  { id: -4, position_ms: 355000, cue_type: 'hot_cue', name: 'Outro', color: '#f97316', number: 6, end_position_ms: null },
];

function makeDemoAnalysis(bpm: number, key: string, energy: number, durationMs: number) {
  return { id: 0, bpm, bpm_confidence: 0.98, key, energy, duration_ms: durationMs, drop_positions: [], phrase_positions: [], beat_positions: [], section_labels: [], analyzed_at: '2025-03-28T10:00:00Z' };
}

const DEMO_RAW_TRACKS: Track[] = [
  { id: -1, filename: 'shed_my_skin.mp3', original_filename: 'Shed My Skin.mp3', status: 'completed', created_at: '2025-03-28T10:00:00Z', title: 'Shed My Skin', artist: 'Ben Bohmer', genre: 'Melodic House', rating: 5, tags: 'peak,vocal', category: 'Peak Time', cue_points: DEMO_CUE_POINTS, analysis: makeDemoAnalysis(124, '6A', 0.72, 402000) },
  { id: -2, filename: 'lost_highway.mp3', original_filename: 'Lost Highway.mp3', status: 'completed', created_at: '2025-03-27T09:00:00Z', title: 'Lost Highway', artist: 'Stephan Bodzin', genre: 'Techno', rating: 4, tags: 'dark,peak', category: 'Peak Time', cue_points: [], analysis: makeDemoAnalysis(134, '10B', 0.88, 495000) },
  { id: -3, filename: 'equinox.mp3', original_filename: 'Equinox.mp3', status: 'completed', created_at: '2025-03-26T08:00:00Z', title: 'Equinox', artist: 'Solomun', genre: 'Deep House', rating: 4, tags: 'warmup', category: 'Warm Up', cue_points: [], analysis: makeDemoAnalysis(122, '3A', 0.65, 450000) },
  { id: -4, filename: 'disco_volante.mp3', original_filename: 'Disco Volante.mp3', status: 'completed', created_at: '2025-03-25T07:00:00Z', title: 'Disco Volante', artist: 'ANNA', genre: 'Techno', rating: 5, tags: 'peak,dark', category: 'Peak Time', cue_points: [], analysis: makeDemoAnalysis(136, '8A', 0.91, 425000) },
  { id: -5, filename: 'dreamer.mp3', original_filename: 'Dreamer.mp3', status: 'completed', created_at: '2025-03-24T06:00:00Z', title: 'Dreamer', artist: 'Tale Of Us', genre: 'Melodic House', rating: 3, tags: 'warmup,vocal', category: 'Warm Up', cue_points: [], analysis: makeDemoAnalysis(120, '1A', 0.58, 550000) },
  { id: -6, filename: 'bangalore.mp3', original_filename: 'Bangalore.mp3', status: 'completed', created_at: '2025-03-23T05:00:00Z', title: 'Bangalore', artist: 'Bicep', genre: 'House', rating: 4, tags: 'festival', category: 'Build Up', cue_points: [], analysis: makeDemoAnalysis(128, '4B', 0.80, 355000) },
];

const DEMO_DISPLAY_TRACKS: any[] = DEMO_RAW_TRACKS.map(t => ({
  id: t.id, title: t.title, artist: t.artist, genre: t.genre || '—',
  bpm: t.analysis?.bpm, key: t.analysis?.key, energy: t.analysis?.energy ? Math.round(t.analysis.energy * 100) : null,
  duration: (() => { const s = (t.analysis?.duration_ms || 0) / 1000; return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`; })(),
  rating: t.rating || 0, tags: t.tags ? String(t.tags).split(',') : [], analyzed: true, color: null,
}));

// ── Main Component ─────────────────────────────────────────────────────
export default function DashboardV2() {
  const { lang } = useLang();
  const {
    activeSection, setActiveSection, globalSearch, registerImportHandler, registerExportHandler,
    autoAnalyze, setAutoAnalyze,
    setUnanalyzedCount, registerAnalyzeAllHandler,
    persistedTrackId, setPersistedTrackId,
    isFeatureEnabled, getFeatureDisplayMode, userPlan,
  } = useDashboardContext();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, _setSelectedTrack] = useState<any | null>(null);
  // Ref to remember the last selected track ID — used to restore selection after loadTracks
  // Initialize from context (survives remounts) if available
  const selectedTrackIdRef = useRef<number | null>(persistedTrackId);
  const mountedRef = useRef(true);
  const mountIdRef = useRef(Math.random().toString(36).slice(2, 6));

  // ── Guarded setSelectedTrack: logs every call + syncs to context for remount survival ──
  const setSelectedTrack = useCallback((track: any | null, reason?: string) => {
    const src = reason || new Error().stack?.split('\n')[2]?.trim() || '?';
    if (track !== null) {
      // Persist to context so it survives component remounts
      setPersistedTrackId(track.id);
    }
    _setSelectedTrack(track);
    // Reset per-track state
    setStemsStatus(null);
    setFxParams({});
  }, [setPersistedTrackId]);

  const [activeTab, setActiveTab] = useState('cues');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [demoModeEnabled, setDemoModeEnabled] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<any>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [toasts, setToasts] = useState<{id: number; msg: string; type: 'success' | 'error' | 'info'}[]>([]);
  const toastIdRef = useRef(0);
  const [contextMenu, setContextMenu] = useState<{trackId: number; x: number; y: number} | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Improvement #46-50: Cue optimization state and handlers
  const [cueQualityScore, setCueQualityScore] = useState<{ overall: number; byType: Record<string, number> } | null>(null);
  const [isOptimizingCues, setIsOptimizingCues] = useState(false);
  const [cueSuggestions, setCueSuggestions] = useState<any[]>([]);
  const [showCueSuggestions, setShowCueSuggestions] = useState(false);
  const [cueHistory, setCueHistory] = useState<any[]>([]);

  // Repositionner le menu contextuel si il dépasse l'écran (bas ou droite)
  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const menu = contextMenuRef.current;
    const { width, height } = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const newLeft = contextMenu.x + width + margin > vw ? vw - width - margin : contextMenu.x;
    const newTop  = contextMenu.y + height + margin > vh ? vh - height - margin : contextMenu.y;
    menu.style.left = `${newLeft}px`;
    menu.style.top  = `${newTop}px`;
  }, [contextMenu]);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // autoAnalyze and setAutoAnalyze come from DashboardContext (shared with TopBar)

  // Session notes
  const [sessionNotes, setSessionNotes] = useState<string>(() => {
    try { return localStorage.getItem('trackcue_session_notes') || ''; } catch { return ''; }
  });
  // Keyboard shortcuts modal
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Metadata Enrich modal
  const [enrichTracks, setEnrichTracks] = useState<any[]>([]);

  // Export bibliothèque modal
  const [showExport, setShowExport] = useState(false);

  // IDs des tracks en cours d'analyse (roue de chargement dans la liste)
  const [analyzingIds, setAnalyzingIds] = useState<Set<number>>(new Set());
  // IDs des tracks en cours d'identification métadonnées
  const [identifyingIds, setIdentifyingIds] = useState<Set<number>>(new Set());

  // Progression d'analyse par track
  const [analysisProgress, setAnalysisProgress] = useState<Record<number, { pct: number; title: string; isLocal: boolean }>>({});

  // Drag & drop overlay
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Stems state
  const [stemsStatus, setStemsStatus] = useState<{
    status: 'pending' | 'processing' | 'completed' | 'failed';
    error?: string | null;
    vocals_url?: string | null;
    drums_url?: string | null;
    bass_url?: string | null;
    other_url?: string | null;
  } | null>(null);
  const [stemsCheckKey, setStemsCheckKey] = useState(0); // incrémenté pour forcer re-check

  // Stems audio sync — audio elements live here, synced with WaveSurfer
  const stemAudioMapRef = useRef<Record<string, HTMLAudioElement>>({});
  const [stemMuted, setStemMuted] = useState<Set<string>>(new Set());
  const stemMutedRef = useRef<Set<string>>(new Set());
  const stemLastTimeRef = useRef<number>(0); // seconds
  const stemPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stemsLoadedRef = useRef(false);

  // FX state (local — will integrate with Web Audio when backend supports it)
  const [fxParams, setFxParams] = useState<Record<string, number>>({});

  // Playlists & crate state
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [crateTracks, setCrateTracks] = useState<Track[]>([]);

  // ── Mount/Unmount tracking ──
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Register import handler so TopBar can trigger file upload
  useEffect(() => {
    registerImportHandler(() => fileRef.current?.click());
  }, [registerImportHandler]);

  // Register export handler so TopBar can ouvrir le popup export
  useEffect(() => {
    registerExportHandler(() => setShowExport(true));
  }, [registerExportHandler]);

  // Load playlists and sets in parallel at mount
  const { playlists: initialPlaylists, loading: isLoadingInitial } = useInitialLoad();
  useEffect(() => {
    if (!isLoadingInitial && initialPlaylists.length > 0) {
      setPlaylists(initialPlaylists);
    }
  }, [initialPlaylists, isLoadingInitial]);

  // Load playlist tracks when a playlist section is active
  useEffect(() => {
    if (activeSection.startsWith('playlist_')) {
      const playlistId = parseInt(activeSection.replace('playlist_', ''));
      if (!isNaN(playlistId)) {
        getPlaylistTracks(playlistId)
          .then((items) => {
            // PlaylistTrackItem[] -> look up full Track objects
            const fullTracks = items.map(item => tracks.find(t => t.id === item.track_id)).filter((t): t is Track => t !== undefined);
            setPlaylistTracks(fullTracks);
          })
          .catch(() => setPlaylistTracks([]));
      }
    } else {
      setPlaylistTracks([]);
    }
  }, [activeSection, tracks]);

  // Load crate tracks when a dynamic smart crate is active
  useEffect(() => {
    const dynamicCrateIds = ['crate_peak', 'crate_warmup', 'crate_vocal'];
    if (activeSection.startsWith('crate_') && !dynamicCrateIds.includes(activeSection)) {
      const crateId = parseInt(activeSection.replace('crate_', ''));
      if (!isNaN(crateId)) {
        getCrateTracks(crateId).then(res => setCrateTracks(res.tracks || [])).catch(() => setCrateTracks([]));
      }
    } else {
      setCrateTracks([]);
    }
  }, [activeSection]);

  // TrackList state
  const [searchQuery, setSearchQuery] = useState('');
  const [gridView, setGridView] = useState(false);
  const [sortBy, setSortBy] = useState('date');
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState({
    bpmMin: 0, bpmMax: 300, keyFilter: null as string | null, genreFilter: null as string | null,
    energyMin: 0, energyMax: 100, showAnalyzedOnly: false, showFavoritesOnly: false,
  });
  const DEFAULT_FILTERS = { bpmMin: 0, bpmMax: 300, keyFilter: null, genreFilter: null, energyMin: 0, energyMax: 100, showAnalyzedOnly: false, showFavoritesOnly: false };

  const genres = useMemo(() => {
    const g = new Set(tracks.map((t: any) => t.analysis?.genre).filter(Boolean));
    return Array.from(g) as string[];
  }, [tracks]);

  // Combine global search with track list search
  const effectiveSearch = globalSearch || searchQuery;

  // Filter tracks based on sidebar section
  const sectionFilteredTracks = useMemo(() => {
    let result = tracks;
    if (activeSection === 'recent') {
      result = [...tracks].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10);
    } else if (activeSection === 'unanalyzed') {
      result = tracks.filter(t => t.status !== 'completed');
    } else if (activeSection === 'crate_peak') {
      result = tracks.filter(t => (t.analysis?.energy || 0) >= 0.7);
    } else if (activeSection === 'crate_warmup') {
      result = tracks.filter(t => {
        const e = t.analysis?.energy || 0;
        return e >= 0.3 && e < 0.7;
      });
    } else if (activeSection === 'crate_vocal') {
      result = tracks.filter(t => (t.tags || '').toLowerCase().includes('vocal'));
    } else if (activeSection.startsWith('crate_') && crateTracks.length > 0) {
      // Dynamic smart crate — tracks loaded from API
      return crateTracks;
    }
    // Playlist sections: show playlist tracks
    if (activeSection.startsWith('playlist_') && playlistTracks.length > 0) {
      return playlistTracks;
    }
    return result;
  }, [tracks, activeSection, playlistTracks, crateTracks]);

  const realDisplayTracks = useMemo(() => sectionFilteredTracks.map(toDisplayTrack), [sectionFilteredTracks]);

  // Mode démo : uniquement si activé en admin ET bibliothèque vide
  const isDemo = demoModeEnabled && realDisplayTracks.length === 0 && !loading;
  const displayTracks = useMemo(() => isDemo ? DEMO_DISPLAY_TRACKS : realDisplayTracks, [isDemo, realDisplayTracks]);
  const rawTracksForTabs = useMemo(() => isDemo ? DEMO_RAW_TRACKS : sectionFilteredTracks, [isDemo, sectionFilteredTracks]);

  // Find the raw Track for the selected display track (needed by tabs)
  // Search in ALL tracks first, fallback to section-filtered — avoids null when section changes
  const selectedRawTrack = useMemo(() => {
    if (!selectedTrack) return null;
    return tracks.find(t => t.id === selectedTrack.id) || rawTracksForTabs.find(t => t.id === selectedTrack.id) || null;
  }, [selectedTrack, tracks, rawTracksForTabs]);

  // Cache current track index to avoid N findIndex calls per render
  const selectedTrackIdx = useMemo(() => {
    if (!selectedTrack) return -1;
    return displayTracks.findIndex((t: any) => t.id === selectedTrack.id);
  }, [selectedTrack, displayTracks]);

  // Keep ref in sync with selectedTrack so we can restore after any reset
  useEffect(() => {
    if (selectedTrack?.id) selectedTrackIdRef.current = selectedTrack.id;
  }, [selectedTrack]);

  // Auto-select track when loaded — restores previously selected track by ID first
  useEffect(() => {
    if (!selectedTrack && displayTracks.length > 0 && !loading) {
      // If we had a track selected before, try to restore it from the fresh list
      if (selectedTrackIdRef.current) {
        const prev = displayTracks.find((t: any) => t.id === selectedTrackIdRef.current);
        if (prev) { setSelectedTrack(prev, 'auto-select:restore-prev'); return; }
      }
      // Otherwise fall back to first track
      setSelectedTrack(displayTracks[0], 'auto-select:first-track');
    }
  }, [displayTracks, loading]);

  // ── SAFETY NET: if selectedTrack becomes null while we have tracks, restore immediately ──
  // This catches ANY unexpected null (component remount, unknown setState, React concurrent quirk)
  useEffect(() => {
    if (selectedTrack) return; // all good
    if (loading) return; // still loading, wait
    if (displayTracks.length === 0) return; // no tracks to select

    // Try to restore the last known track
    if (selectedTrackIdRef.current) {
      const prev = displayTracks.find((t: any) => t.id === selectedTrackIdRef.current);
      if (prev) {
        _setSelectedTrack(prev); // use raw setter to avoid infinite loop
        return;
      }
    }
    // Fallback to first track
    _setSelectedTrack(displayTracks[0]);
  }, [selectedTrack, displayTracks, loading]);

  // Load tracks (initial = 30 pour un affichage rapide, puis le reste en arrière-plan)
  useEffect(() => {
    loadTracks(1, false, 30).then(() => {
      // Charger les tracks restants en arrière-plan après le premier rendu
      loadTracks(1, false, 100);
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space = play/pause
      if (e.code === 'Space' && selectedTrack) {
        e.preventDefault();
        playerRef.current?.playPause?.();
        return;
      }
      // ArrowLeft = skip -5s
      if (e.code === 'ArrowLeft' && selectedTrack) {
        e.preventDefault();
        playerRef.current?.skip?.(-5);
        return;
      }
      // ArrowRight = skip +5s
      if (e.code === 'ArrowRight' && selectedTrack) {
        e.preventDefault();
        playerRef.current?.skip?.(5);
        return;
      }
      // Escape = ferme les menus (ne déselectionne plus le track pour éviter les accidents)
      if (e.code === 'Escape') {
        setContextMenu(null);
        setShowShortcuts(false);
        return;
      }
      // Ctrl+A = select all
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') {
        e.preventDefault();
        const allIds = new Set(displayTracks.map((t: any) => t.id));
        setSelectedIds(allIds);
        return;
      }
      // Ctrl+F = focus search
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      // Delete = delete selected track (même logique que handleDeleteTrack)
      if (e.code === 'Delete' && selectedTrack && selectedTrack.id > 0) {
        handleDeleteTrack(selectedTrack.id);
        return;
      }
      // Up/Down = navigate tracks
      if (e.code === 'ArrowUp') {
        e.preventDefault();
        handlePrev();
        return;
      }
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        handleNext();
        return;
      }
      // ? = show shortcuts
      if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
        e.preventDefault();
        setShowShortcuts(true);
        return;
      }
      // 1-5 = rate
      if (e.code.startsWith('Digit') && selectedTrack && selectedTrack.id > 0) {
        const num = parseInt(e.code.replace('Digit', ''));
        if (num >= 1 && num <= 5) {
          updateTrack(selectedTrack.id, {rating: num})
            .then(() => {
              addToast(`Rated ${num}⭐`, 'success');
              loadTracks();
            })
            .catch(() => addToast('Rating failed', 'error'));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTrack, displayTracks]);

  async function loadTracks(page = 1, append = false, limit = 100) {
    try {
      if (!append) setLoading(true); else setLoadingMore(true);
      if (!isAuthenticated()) return;
      const data = await listTracks(page, limit);
      const trackList = Array.isArray(data) ? data : (data?.tracks || []);
      setTracks(prev => append ? [...prev, ...trackList] : trackList);
      setTracksTotal(data?.total ?? trackList.length);
      setTracksPage(data?.page ?? page);
      setHasMoreTracks((data?.page ?? 1) < (data?.pages ?? 1));
      if (!append && selectedTrackIdRef.current) {
        const freshRaw = trackList.find((t: Track) => t.id === selectedTrackIdRef.current);
        if (freshRaw) setSelectedTrack(toDisplayTrack(freshRaw), 'loadTracks:refresh');
        else if (trackList.length > 0) setSelectedTrack(toDisplayTrack(trackList[0]), 'loadTracks:fallback-first');
      }
    } catch (e: any) {
      if (e?.message === 'Session expired' || e?.message === 'Not authenticated') {
        setTracks([]); return;
      }
    } finally {
      if (!append) setLoading(false); else setLoadingMore(false);
    }
  }

  async function loadMoreTracks() {
    if (hasMoreTracks && !loadingMore) await loadTracks(tracksPage + 1, true);
  }

  // Toast system
  const addToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev.slice(-4), { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // Improvement #46: Handle optimize cues
  const handleOptimizeCues = useCallback(async () => {
    if (!selectedRawTrack?.id) {
      addToast('Select a track first', 'error');
      return;
    }
    try {
      setIsOptimizingCues(true);
      const result = await optimizeCues(selectedRawTrack.id, {
        removeWeakCues: true,
        snapToGrid: true,
      });
      addToast(`Optimized: ${result.optimized_count} cues, removed ${result.removed_count}`, 'success');
      loadTracks();
    } catch (e: any) {
      addToast(`Optimization failed: ${e.message}`, 'error');
    } finally {
      setIsOptimizingCues(false);
    }
  }, [selectedRawTrack?.id, addToast]);

  // Improvement #47: Handle get cue suggestions
  const handleGetSuggestions = useCallback(async () => {
    if (!selectedRawTrack?.id) {
      addToast('Select a track first', 'error');
      return;
    }
    try {
      const suggestions = await getCueSuggestions(selectedRawTrack.id);
      setCueSuggestions(suggestions);
      setShowCueSuggestions(true);
      addToast(`Found ${suggestions.length} cue suggestions`, 'info');
    } catch (e: any) {
      addToast(`Failed to get suggestions: ${e.message}`, 'error');
    }
  }, [selectedRawTrack?.id, addToast]);

  // Improvement #48: Load quality score on track selection
  useEffect(() => {
    if (!selectedRawTrack?.id || selectedRawTrack.id < 0) return;
    getCueQualityScore(selectedRawTrack.id)
      .then(setCueQualityScore)
      .catch(() => setCueQualityScore(null));
  }, [selectedRawTrack?.id]);

  // Improvement #49: Load cue history
  const handleLoadCueHistory = useCallback(async () => {
    if (!selectedRawTrack?.id) {
      addToast('Select a track first', 'error');
      return;
    }
    try {
      const history = await getCueHistory(selectedRawTrack.id);
      setCueHistory(history);
      addToast(`Loaded ${history.length} history entries`, 'info');
    } catch (e: any) {
      addToast(`Failed to load history: ${e.message}`, 'error');
    }
  }, [selectedRawTrack?.id, addToast]);

  // ── Stems audio sync avec WaveSurfer ─────────────────────────────────────
  // Ref vers les listeners natifs pour cleanup
  const stemNativeListenersRef = useRef<{
    seeking: () => void;
    seeked: () => void;
    pause: () => void;
    audio: HTMLAudioElement;
  } | null>(null);

  const detachNativeListeners = useCallback(() => {
    if (!stemNativeListenersRef.current) return;
    const { seeking, seeked, pause, audio } = stemNativeListenersRef.current;
    audio.removeEventListener('seeking', seeking);
    audio.removeEventListener('seeked', seeked);
    audio.removeEventListener('pause', pause);
    stemNativeListenersRef.current = null;
  }, []);

  // Fetch stems avec le JWT puis créer des Blob URLs,
  // puis attacher les native listeners une fois les stems prêts
  useEffect(() => {
    if (stemsStatus?.status !== 'completed') {
      stemsLoadedRef.current = false;
      detachNativeListeners();
      Object.values(stemAudioMapRef.current).forEach(a => {
        a.pause();
        if (a.src.startsWith('blob:')) URL.revokeObjectURL(a.src);
        a.src = '';
      });
      stemAudioMapRef.current = {};
      return;
    }

    let cancelled = false;
    const blobUrls: string[] = [];
    const STEM_KEYS = ['vocals_url', 'drums_url', 'bass_url', 'other_url'] as const;

    const attachNativeListeners = () => {
      const tryAttach = () => {
        if (cancelled) return;
        const audio = playerRef.current?.getAudio?.();
        if (!audio) { setTimeout(tryAttach, 150); return; }

        detachNativeListeners();

        // Timer-based pause : on attend 150ms avant de pauser les stems.
        // Si seeked fire entre-temps, il annule le timer → pas de faux pause.
        let pauseTimer: ReturnType<typeof setTimeout> | null = null;

        const onSeeking = () => {
          // Annuler tout timer de pause en cours (c'est un seek, pas une vraie pause)
          if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
        };

        const onSeeked = () => {
          // Annuler le timer de pause (seek terminé, pas une vraie pause)
          if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
          if (!stemsLoadedRef.current) return;
          const t = audio.currentTime;
          Object.entries(stemAudioMapRef.current).forEach(([key, a]) => {
            a.currentTime = t;
            if (!audio.paused && !stemMutedRef.current.has(key)) a.play().catch(() => {});
          });
        };

        const onPause = () => {
          if (!stemsLoadedRef.current) return;
          console.log('[TrackCue] native onPause → deferred timer 150ms');
          // Différer la pause de 150ms — si c'est un seek, seeked annulera ce timer
          if (pauseTimer) clearTimeout(pauseTimer);
          pauseTimer = setTimeout(() => {
            pauseTimer = null;
            if (!audio.paused) { console.log('[TrackCue] pause timer: audio resumed, skip'); return; }
            console.log('[TrackCue] pause timer: REAL pause → stopping stems, restoring volume');
            Object.values(stemAudioMapRef.current).forEach(a => a.pause());
            playerRef.current?.setVolume?.(1);
          }, 150);
        };

        audio.addEventListener('seeking', onSeeking);
        audio.addEventListener('seeked', onSeeked);
        audio.addEventListener('pause', onPause);
        stemNativeListenersRef.current = { seeking: onSeeking, seeked: onSeeked, pause: onPause, audio };
        console.log('[TrackCue] Native listeners attachés (seeking/seeked/pause)');

        // Si WaveSurfer joue déjà quand les stems chargent → muter immédiatement
        if (!audio.paused) {
          playerRef.current?.setVolume?.(0);
          console.log('[TrackCue] WaveSurfer déjà en lecture → muté');
        }
      };
      tryAttach();
    };

    const loadStems = async () => {
      const { getToken } = await import('@/lib/api');
      const token = getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      await Promise.all(STEM_KEYS.map(async (k) => {
        const url = stemsStatus[k];
        if (!url || typeof url !== 'string' || stemAudioMapRef.current[k]) return;
        try {
          const res = await fetch(url, { headers });
          if (!res.ok || cancelled) return;
          const blob = await res.blob();
          if (cancelled) return;
          const blobUrl = URL.createObjectURL(blob);
          blobUrls.push(blobUrl);
          const a = new Audio(blobUrl);
          a.preload = 'auto';
          a.volume = 1;
          stemAudioMapRef.current[k] = a;
        } catch { /* stem non disponible */ }
      }));

      if (!cancelled && Object.keys(stemAudioMapRef.current).length > 0) {
        stemsLoadedRef.current = true;
        console.log('[TrackCue] Stems chargés:', Object.keys(stemAudioMapRef.current).length, 'stems');
        attachNativeListeners();
      }
    };

    loadStems();

    return () => {
      cancelled = true;
      detachNativeListeners();
      stemsLoadedRef.current = false;
      Object.values(stemAudioMapRef.current).forEach(a => {
        a.pause();
        if (a.src.startsWith('blob:')) URL.revokeObjectURL(a.src);
        a.src = '';
      });
      stemAudioMapRef.current = {};
      blobUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stemsStatus?.status]);

  // handleStemPlay: appelé par le callback onPlay de WaveSurferPlayer (TOUJOURS fiable)
  // C'est le signal principal pour muter WaveSurfer et lancer les stems
  const handleStemPlay = useCallback(() => {
    if (!stemsLoadedRef.current) { console.log('[TrackCue] handleStemPlay: stems not loaded, skip'); return; }
    console.log('[TrackCue] handleStemPlay: muting wavesurfer, starting stems');
    playerRef.current?.setVolume?.(0);
    const audio = playerRef.current?.getAudio?.();
    const t = audio?.currentTime ?? stemLastTimeRef.current;
    Object.entries(stemAudioMapRef.current).forEach(([key, a]) => {
      a.currentTime = t;
      if (!stemMutedRef.current.has(key)) a.play().catch(() => {});
    });
  }, []);

  // handleStemTimeUpdate: drift correction + volume enforcement continu
  // SEULEMENT quand le player joue (pas en pause) pour éviter les sons parasites
  const handleStemTimeUpdate = useCallback((ms: number) => {
    stemLastTimeRef.current = ms / 1000;
    if (!stemsLoadedRef.current) return;

    // Vérifier que le player est RÉELLEMENT en lecture (pas en pause/seek)
    const audio = playerRef.current?.getAudio?.();
    if (!audio || audio.paused) return; // ← NE RIEN FAIRE si en pause

    // Keep WaveSurfer muted tant que les stems jouent (CRITIQUE — sans ça = double audio)
    playerRef.current?.setVolume?.(0);
    // Drift correction si dérive > 0.4s
    const t = ms / 1000;
    Object.entries(stemAudioMapRef.current).forEach(([key, a]) => {
      if (!stemMutedRef.current.has(key) && !a.paused && Math.abs(a.currentTime - t) > 0.4) {
        a.currentTime = t;
      }
    });
  }, []);

  const toggleStemMute = useCallback((key: string) => {
    const audio = stemAudioMapRef.current[key];
    const mainAudio = playerRef.current?.getAudio?.();
    const isPlaying = mainAudio && !mainAudio.paused;

    setStemMuted(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        // Réactiver — relancer en sync SEULEMENT si le player joue
        next.delete(key);
        if (audio) {
          const refAudio = Object.entries(stemAudioMapRef.current)
            .find(([k, a]) => !next.has(k) && !a.paused)?.[1];
          audio.currentTime = refAudio ? refAudio.currentTime : stemLastTimeRef.current;
          // Ne lancer le play que si le player principal est en lecture
          if (isPlaying) {
            audio.play().catch(() => {});
          }
        }
      } else {
        // Couper — pause complète (plus fiable que volume=0)
        next.add(key);
        if (audio) audio.pause();
      }
      stemMutedRef.current = next;
      return next;
    });
  }, []);
  // ──────────────────────────────────────────────────────────────────────────

  // Record play event — enregistre côté backend uniquement
  const handleTrackPlay = useCallback(() => {
    if (!selectedTrackIdRef.current || selectedTrackIdRef.current < 0) return;
    const trackId = selectedTrackIdRef.current;
    recordPlay(trackId, 'dashboard').catch(() => {});
  }, []);

  // Transform API track to display format
  function toDisplayTrack(t: Track) {
    const analysis = t.analysis || {} as any;
    return {
      id: t.id,
      title: t.title || t.original_filename || t.filename || 'Unknown',
      artist: t.artist || 'Unknown',
      genre: t.genre || analysis.genre || '—',
      bpm: analysis.bpm ? Math.round(analysis.bpm * 10) / 10 : null,
      key: toCamelot(analysis.key),
      energy: analysis.energy ? Math.round(analysis.energy * 100) : null,
      duration: formatDuration(analysis.duration_ms ? analysis.duration_ms / 1000 : null),
      rating: t.rating || 0,
      tags: t.tags ? (typeof t.tags === 'string' ? t.tags.split(',').filter(Boolean) : t.tags) : [],
      analyzed: t.status === 'completed',
      color: null,
      waveformPeaks: analysis.waveform_peaks || null,
    };
  }

  // ── Cue points ────────────────────────────────────────────────────────
  const [cuePoints, setCuePoints] = useState<any[]>([]);
  const [cuePositionMs, setCuePositionMs] = useState<number | null>(null); // position courante du playhead (ms)
  // Pagination
  const [tracksTotal, setTracksTotal] = useState(0);
  const [tracksPage, setTracksPage] = useState(1);
  const [hasMoreTracks, setHasMoreTracks] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // En mode démo, utiliser les cue points du raw track; sinon, utiliser l'état API
  // IMPORTANT: doit être déclaré APRÈS cuePoints (évite TDZ dans la dep array)
  const effectiveCuePoints = useMemo(() => {
    if (isDemo && selectedRawTrack) return (selectedRawTrack.cue_points as any[]) || [];
    return cuePoints;
  }, [isDemo, selectedRawTrack, cuePoints]);

  // Charger les cue points quand le track change (pas pour les démo tracks)
  useEffect(() => {
    setCuePoints([]);
    if (!selectedTrack || selectedTrack.id < 0) return; // tracks démo
    getTrackCuePoints(selectedTrack.id)
      .then(setCuePoints)
      .catch(() => setCuePoints([]));
  }, [selectedTrack?.id]);

  // Auto-check stems : si des stems ont déjà été générés (ex. via analyse pro),
  // les afficher immédiatement sans forcer l'utilisateur à cliquer "Séparer les stems"
  useEffect(() => {
    if (!selectedTrack || selectedTrack.id < 0) return;
    // Ne rien faire si on a déjà un statut valide pour ce track
    if (stemsStatus?.status === 'completed' || stemsStatus?.status === 'processing') return;
    const trackId = selectedTrack.id;
    const check = async () => {
      try {
        const { getToken } = await import('@/lib/api');
        const token = getToken();
        const BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
        const headers: any = token ? { Authorization: `Bearer ${token}` } : {};
        const r = await fetch(`${BASE}/advanced/stems/${trackId}/status`, { headers });
        if (!r.ok) return;
        const d = await r.json();
        if (d.status === 'completed') {
          const origin = BASE.replace(/\/api\/v1\/?$/, '');
          const abs = (u?: string) => u && !u.startsWith('http') ? `${origin}${u}` : u;
          setStemsStatus({
            status: 'completed',
            vocals_url: abs(d.vocals_url),
            drums_url:  abs(d.drums_url),
            bass_url:   abs(d.bass_url),
            other_url:  abs(d.other_url),
          });
        } else if (d.status === 'processing') {
          setStemsStatus({ status: 'processing' });
        }
      } catch { /* silencieux — les stems n'existent pas encore, pas grave */ }
    };
    check();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrack?.id, activeTab, stemsCheckKey]);

  async function handleCreateCue(data: { name: string; position_ms: number; color: string; cue_type: string; number?: number }) {
    if (!selectedTrack || selectedTrack.id < 0) return;
    try {
      await createCuePoint(selectedTrack.id, {
        name: data.name,
        position_ms: data.position_ms,
        color: data.color,
        cue_type: data.cue_type,
        number: data.number ?? null,
      });
      const updated = await getTrackCuePoints(selectedTrack.id);
      setCuePoints(updated);
      addToast(tr('toast.cue_created', lang), 'success');
    } catch (e) {
      addToast(tr('toast.cue_error', lang), 'error');
    }
  }

  async function handleDeleteCue(cueId: number) {
    try {
      await deleteCuePoint(cueId);
      setCuePoints(prev => prev.filter(c => c.id !== cueId));
      addToast(tr('toast.cue_deleted', lang), 'success');
    } catch (e) {
      addToast(tr('toast.cue_error', lang), 'error');
    }
  }

  async function handleBulkDeleteCues(cueIds: number[]) {
    if (!selectedTrack || selectedTrack.id < 0 || cueIds.length === 0) return;
    try {
      await batchDeleteCuePoints(selectedTrack.id, cueIds);
      setCuePoints(prev => prev.filter(c => !cueIds.includes(c.id)));
      addToast(`${cueIds.length} cue points supprimés`, 'success');
    } catch (e) {
      addToast('Erreur lors de la suppression', 'error');
    }
  }

  async function handleDeleteAllCues() {
    if (!selectedTrack || selectedTrack.id < 0) return;
    try {
      const result = await deleteAllCuePoints(selectedTrack.id);
      setCuePoints([]);
      addToast(`${result.deleted} cue points supprimés`, 'success');
    } catch (e) {
      addToast('Erreur lors de la suppression', 'error');
    }
  }

  async function handleRegenerateCues() {
    if (!selectedTrack || selectedTrack.id < 0) return;
    try {
      addToast('Régénération des cue points...', 'info');
      const newCues = await regenerateCuePoints(selectedTrack.id);
      setCuePoints(newCues);
      addToast('Cue points régénérés avec succès !', 'success');
    } catch (e: any) {
      const msg = e?.message || 'Erreur lors de la régénération';
      addToast(msg, 'error');
      console.error('[CueForge] Regenerate error:', e);
    }
  }

  // Clic sur la waveform → seeker le player + mémoriser la position pour CuesTab
  function handleWaveformClick(positionMs: number) {
    playerRef?.current?.seekTo?.(positionMs);
    setCuePositionMs(positionMs);
    // Ne pas changer d'onglet si stems actifs (sinon ça coupe le mode stems)
    if (activeTab !== 'stems') {
      setActiveTab('cues');
    }
  }

  function handleSelectTrack(track: any) {
    setSelectedTrack(track, 'user:click');
  }

  function handleFavorite(trackId: number) {
    setFavoriteIds(prev => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }

  function handleContextMenu(track: any, e: React.MouseEvent) {
    e.preventDefault();
    setContextMenu({trackId: track.id, x: e.clientX, y: e.clientY});
  }

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  async function handleReanalyzeTrack(trackId: number) {
    try {
      const t = tracks.find(t => t.id === trackId);
      const title = t?.title || t?.original_filename || 'Track';
      const desktop = typeof window !== 'undefined' && (window as any).trackcue?.isDesktop;
      setAnalyzingIds(prev => new Set(prev).add(trackId));
      setAnalysisProgress(prev => ({ ...prev, [trackId]: { pct: 2, title, isLocal: !!desktop } }));

      const result = await analyzeTrack(trackId, {
        onProgress: (pct) => setAnalysisProgress(prev => ({ ...prev, [trackId]: { pct, title, isLocal: prev[trackId]?.isLocal ?? !!desktop } })),
      });

      if (result.usedLocal) {
        // ── Desktop : analyse terminée localement (CPU de l'ordi) ──
        // Pas de polling nécessaire, le track est déjà completed en DB
        setAnalysisProgress(prev => ({ ...prev, [trackId]: { pct: 100, title, isLocal: true } }));
      } else {
        // ── Web : analyse cloud (Railway) — polling nécessaire ──
        setAnalysisProgress(prev => ({ ...prev, [trackId]: { pct: 15, title, isLocal: false } }));

        // Simuler une montée progressive pendant le polling cloud
        let cloudPct = 15;
        const cloudTimer = setInterval(() => {
          cloudPct = Math.min(55, cloudPct + 2 + Math.random() * 3);
          setAnalysisProgress(prev => ({ ...prev, [trackId]: { ...prev[trackId], pct: Math.round(cloudPct), title } }));
        }, 1500);

        await pollTrackUntilDone(trackId, () => {
          setAnalysisProgress(prev => {
            const cur = prev[trackId]?.pct ?? 0;
            return { ...prev, [trackId]: { ...prev[trackId], pct: Math.min(98, Math.max(cur, 60) + 3), title } };
          });
        });
        clearInterval(cloudTimer);

        setAnalysisProgress(prev => ({ ...prev, [trackId]: { pct: 100, title, isLocal: false } }));
      }
      setAnalyzingIds(prev => { const n = new Set(prev); n.delete(trackId); return n; });
      setTimeout(() => setAnalysisProgress(prev => { const n = { ...prev }; delete n[trackId]; return n; }), 2000);

      // Refresh only the analyzed track in-place (avoid full list reload → no flash)
      try {
        const fresh = await getTrack(trackId);
        setTracks(prev => prev.map(t => t.id === trackId ? fresh : t));
        if (selectedTrackIdRef.current === trackId) {
          setSelectedTrack(toDisplayTrack(fresh), 'reanalyze:complete');
        }
      } catch {
        // Fallback: full reload only if single-track fetch fails
        await loadTracks();
      }
      // Recharger les cue points si c'est le track sélectionné (évite doublons stale)
      if (selectedTrackIdRef.current === trackId) {
        try {
          const freshCues = await getTrackCuePoints(trackId);
          setCuePoints(freshCues);
        } catch {}
        // Vérifier si des stems ont été générés par l'analyse pro
        setStemsStatus(null);
        setStemsCheckKey(k => k + 1); // force re-check du useEffect
      }
      addToast(`${title} ${tr('toast.analyzed', lang)}`, 'success');
      setContextMenu(null);
    } catch (e: any) {
      setAnalyzingIds(prev => { const n = new Set(prev); n.delete(trackId); return n; });
      setAnalysisProgress(prev => { const n = { ...prev }; delete n[trackId]; return n; });
      const msg = e?.message || '';
      if (msg.includes('not found') || msg.includes('404')) {
        addToast('Fichier audio introuvable — ré-uploade le track', 'error');
      } else {
        addToast(tr('toast.analysis_error', lang), 'error');
      }
      console.error('[TrackCue] Reanalyze failed:', e);
    }
  }

  async function handleIdentifyTrack(trackId: number) {
    const t = tracks.find(t => t.id === trackId);
    const title = t?.title || t?.original_filename || 'Track';
    setIdentifyingIds(prev => new Set(prev).add(trackId));
    try {
      const result = await identifyTrack(trackId);
      if (result.status === 'no_match') {
        addToast(`${title} — aucune correspondance trouvée`, 'info');
      } else {
        // Rafraîchir le track dans la liste
        const fresh = await getTrack(trackId);
        setTracks(prev => prev.map(t => t.id === trackId ? fresh : t));
        if (selectedTrackIdRef.current === trackId) {
          setSelectedTrack(toDisplayTrack(fresh), 'identify:complete');
        }
        // Rafraîchir les cue points si BPM corrigé
        if (result.bpm_corrected && selectedTrackIdRef.current === trackId) {
          try { setCuePoints(await getTrackCuePoints(trackId)); } catch {}
        }
        const fields = result.updated_fields?.join(', ') || '';
        addToast(`${title} identifié ✓${fields ? ` (${fields})` : ''}`, 'success');
      }
    } catch (e: any) {
      addToast(`Erreur identification: ${e?.message || 'erreur inconnue'}`, 'error');
      console.error('[TrackCue] Identify failed:', e);
    } finally {
      setIdentifyingIds(prev => { const n = new Set(prev); n.delete(trackId); return n; });
    }
  }

  async function handleDeleteTrack(trackId: number) {
    if (!window.confirm('Supprimer ce track ?')) return;
    // Suppression optimiste : retirer du state immédiatement
    const previousTracks = tracks;
    const deletedIndex = tracks.findIndex(t => t.id === trackId);
    const remaining = tracks.filter(t => t.id !== trackId);
    setTracks(remaining);
    // Auto-sélection du track suivant (ou précédent si c'était le dernier)
    if (selectedTrack?.id === trackId) {
      const nextTrack = remaining.length > 0
        ? remaining[Math.min(deletedIndex, remaining.length - 1)]
        : null;
      setSelectedTrack(nextTrack, 'contextMenu:delete');
    }
    setContextMenu(null);
    try {
      await deleteTrack(trackId);
      addToast(tr('toast.deleted', lang), 'success');
    } catch (e: any) {
      // Rollback si l'API échoue
      console.error('[TrackCue] Delete failed:', e);
      setTracks(previousTracks);
      addToast(`Échec suppression : ${e?.message || 'erreur inconnue'}`, 'error');
    }
  }

  async function handleExportRekordbox(trackId: number) {
    try {
      const blob = await exportRekordbox(trackId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `track_${trackId}.xml`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('Exported to Rekordbox', 'success');
      setContextMenu(null);
    } catch (e) {
      addToast('Export failed', 'error');
    }
  }

  function handleExportCSV(trackId: number) {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    const blob = generateTrackCSV(track, cuePoints);
    downloadBlob(blob, `${track.title || 'track'}.csv`);
    addToast('Export CSV OK', 'success');
    setContextMenu(null);
  }

  function handleExportTXT(trackId: number) {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    const blob = generateTrackTXT(track, cuePoints);
    downloadBlob(blob, `${track.title || 'track'}.txt`);
    addToast('Export TXT OK', 'success');
    setContextMenu(null);
  }

  async function handleAutoCuePoints() {
    if (!selectedTrack || selectedTrack.id < 0) {
      addToast('Sélectionne un vrai track', 'info');
      return;
    }
    addToast('Génération des cue points (algo pro)...', 'info');
    try {
      const token = (await import('@/lib/api')).getToken();
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
      const res = await fetch(`${API_URL}/cues/${selectedTrack.id}/generate`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const result = await res.json();
      // Refresh cue points from backend
      try {
        const cues = await getTrackCuePoints(selectedTrack.id);
        setCuePoints(cues);
      } catch {}
      addToast(result.message || 'Cue points générés !', 'success');
    } catch (e: any) {
      addToast(e.message || tr('toast.cue_error', lang), 'error');
    }
  }

  // Navigation prev/next dans la liste (utilise selectedTrackIdx mis en cache)
  function handlePrev() {
    if (selectedTrackIdx > 0) setSelectedTrack(displayTracks[selectedTrackIdx - 1], 'nav:prev');
  }

  function handleNext() {
    if (selectedTrackIdx >= 0 && selectedTrackIdx < displayTracks.length - 1)
      setSelectedTrack(displayTracks[selectedTrackIdx + 1], 'nav:next');
  }

  // ── Lancement d'analyse en arrière-plan (fire-and-forget) ──────────
  function startBackgroundAnalysis(id: number, fname: string) {
    setAnalyzingIds(prev => new Set(prev).add(id));
    setAnalysisProgress(prev => ({ ...prev, [id]: { pct: 0, title: fname, isLocal: false } }));

    (async () => {
      try {
        const result = await analyzeTrack(id, {
          onProgress: (pct) => setAnalysisProgress(prev => ({ ...prev, [id]: { pct, title: fname, isLocal: prev[id]?.isLocal ?? false } })),
        });

        if (result.usedLocal) {
          setAnalysisProgress(prev => ({ ...prev, [id]: { pct: 100, title: fname, isLocal: true } }));
        } else {
          setAnalysisProgress(prev => ({ ...prev, [id]: { pct: 15, title: fname, isLocal: false } }));
          let cloudPct = 15;
          const cloudTimer = setInterval(() => {
            cloudPct = Math.min(55, cloudPct + 2 + Math.random() * 3);
            setAnalysisProgress(prev => ({ ...prev, [id]: { ...prev[id], pct: Math.round(cloudPct), title: fname } }));
          }, 1500);
          await pollTrackUntilDone(id, (updated) => {
            setTracks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
            setAnalysisProgress(prev => {
              const cur = prev[id]?.pct ?? 0;
              return { ...prev, [id]: { ...prev[id], pct: Math.min(98, Math.max(cur, 60) + 3), title: fname } };
            });
          });
          clearInterval(cloudTimer);
          setAnalysisProgress(prev => ({ ...prev, [id]: { pct: 100, title: fname, isLocal: false } }));
        }

        // Clean up progress state
        setAnalyzingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        setTimeout(() => setAnalysisProgress(prev => { const n = { ...prev }; delete n[id]; return n; }), 2000);
        addToast(`${fname} ${tr('toast.analyzed', lang)}`, 'success');

        // Refresh the single track in-place instead of full loadTracks
        try {
          const fresh = await getTrack(id);
          setTracks(prev => prev.map(t => t.id === id ? fresh : t));
          if (selectedTrackIdRef.current === id) {
            setSelectedTrack(toDisplayTrack(fresh), 'analysis:complete');
          }
        } catch {}
        if (selectedTrackIdRef.current === id) {
          try { setCuePoints(await getTrackCuePoints(id)); } catch {}
        }
      } catch {
        setAnalyzingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        setAnalysisProgress(prev => { const n = { ...prev }; delete n[id]; return n; });
        addToast(`Erreur analyse: ${fname}`, 'error');
      }
    })();
  }

  // File upload — affichage instantané + analyse en arrière-plan
  async function handleFiles(files: FileList) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploading(true);
    addToast(`Import de ${fileArray.length} fichier${fileArray.length > 1 ? 's' : ''}…`, 'info');

    const CONCURRENCY = 3;
    let totalUploaded = 0;
    let firstTrackSelected = false;

    // Upload par chunks de 3 — chaque track apparaît DÈS qu'elle est uploadée
    const chunks: File[][] = [];
    for (let i = 0; i < fileArray.length; i += CONCURRENCY) {
      chunks.push(fileArray.slice(i, i + CONCURRENCY));
    }

    for (const chunk of chunks) {
      const results = await Promise.allSettled(chunk.map(f => uploadTrack(f)));

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === 'fulfilled' && r.value?.id) {
          const up = r.value;
          const fname = chunk[i].name;
          totalUploaded++;

          // Fetch le track complet et l'injecter EN TÊTE de la liste immédiatement
          try {
            const freshTrack = await getTrack(up.id);
            setTracks(prev => [freshTrack, ...prev.filter(t => t.id !== freshTrack.id)]);

            // Sélectionner le premier track uploadé → le waveform se charge direct
            if (!firstTrackSelected) {
              setSelectedTrack(toDisplayTrack(freshTrack), 'upload:instant');
              firstTrackSelected = true;
            }
          } catch {
            // Fallback : au moins l'ajouter avec les infos du upload response
            const minimalTrack = {
              id: up.id,
              filename: up.filename,
              original_filename: up.original_filename || fname,
              status: 'pending' as const,
              title: fname.replace(/\.[^.]+$/, ''),
              artist: '',
              created_at: new Date().toISOString(),
            } as any;
            setTracks(prev => [minimalTrack, ...prev.filter(t => t.id !== up.id)]);
            if (!firstTrackSelected) {
              setSelectedTrack(toDisplayTrack(minimalTrack), 'upload:instant-minimal');
              firstTrackSelected = true;
            }
          }

          // Lancer l'analyse en arrière-plan (fire-and-forget)
          if (autoAnalyze) {
            startBackgroundAnalysis(up.id, fname);
          }
        } else {
          const reason = r.status === 'rejected' ? (r.reason?.message || r.reason || 'erreur') : 'réponse invalide';
          console.error(`[TrackCue] Upload failed for ${chunk[i].name}:`, reason);
          addToast(`Erreur upload ${chunk[i].name}: ${reason}`, 'error');
        }
      }
    }

    setUploading(false);
    if (totalUploaded > 0) {
      addToast(`${totalUploaded} fichier${totalUploaded > 1 ? 's' : ''} importé${totalUploaded > 1 ? 's' : ''}`, 'success');
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setIsDragging(false); }
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) handleFiles(e.target.files);
  }

  // ── Export toute la bibliothèque ────────────────────────────────────
  function handleExportAllCSV() {
    const rows = [
      ['#', 'Titre', 'Artiste', 'Album', 'Genre', 'BPM', 'Key', 'Energy', 'Rating', 'Tags', 'Durée (ms)'],
      ...tracks.map((t, i) => {
        const a = (t as any).analysis || {};
        return [
          i + 1,
          t.title || t.original_filename || '',
          t.artist || '',
          t.album || '',
          t.genre || a.genre || '',
          a.bpm?.toFixed(1) || '',
          a.key || '',
          a.energy != null ? Math.round(a.energy * 100) + '%' : '',
          t.rating || '',
          t.tags || '',
          a.duration_ms || '',
        ];
      }),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'trackcue-library.csv'; a.click();
    URL.revokeObjectURL(url);
    addToast(`Export CSV — ${tracks.length} tracks`, 'success');
    setShowExport(false);
  }

  function handleExportAllTXT() {
    const lines = [
      `=== TrackCue — Bibliothèque complète (${tracks.length} tracks) ===`,
      `Exporté le ${new Date().toLocaleDateString('fr-FR')}`,
      '',
      ...tracks.map((t, i) => {
        const a = (t as any).analysis || {};
        return `[${i + 1}] ${t.title || t.original_filename || '?'} — ${t.artist || '?'} | BPM: ${a.bpm?.toFixed(0) || '?'} | Key: ${a.key || '?'} | Energy: ${energyLabel(a.energy)}`;
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'trackcue-library.txt'; a.click();
    URL.revokeObjectURL(url);
    addToast(`Export TXT — ${tracks.length} tracks`, 'success');
    setShowExport(false);
  }

  async function handleExportAllRekordbox() {
    addToast('Export Rekordbox en cours…', 'info');
    setShowExport(false);
    try {
      const blob = await exportAllRekordbox();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'TrackCue_Library_rekordbox.xml';
      a.click();
      URL.revokeObjectURL(url);
      addToast(`Export Rekordbox — ${tracks.length} tracks`, 'success');
    } catch (e: any) {
      addToast(`Erreur export: ${e.message || 'inconnue'}`, 'error');
    }
  }

  async function handleExportAllSerato() {
    addToast('Export Serato en cours…', 'info');
    setShowExport(false);
    try {
      const { exportAllSerato } = await import('@/lib/api');
      const blob = await exportAllSerato();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'TrackCue_Library_serato.csv';
      a.click();
      URL.revokeObjectURL(url);
      addToast(`Export Serato — ${tracks.length} tracks`, 'success');
    } catch (e: any) {
      addToast(`Erreur export: ${e.message || 'inconnue'}`, 'error');
    }
  }

  async function handleExportAllTraktor() {
    addToast('Export Traktor en cours…', 'info');
    setShowExport(false);
    try {
      const { exportAllTraktor } = await import('@/lib/api');
      const blob = await exportAllTraktor();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'TrackCue_Library_traktor.nml';
      a.click();
      URL.revokeObjectURL(url);
      addToast(`Export Traktor — ${tracks.length} tracks`, 'success');
    } catch (e: any) {
      addToast(`Erreur export: ${e.message || 'inconnue'}`, 'error');
    }
  }

  const unanalyzedCount = tracks.filter(t => t.status !== 'completed').length;

  // Sync unanalyzedCount to context so TopBar can read it
  useEffect(() => {
    setUnanalyzedCount(isDemo ? 0 : unanalyzedCount);
  }, [unanalyzedCount, isDemo, setUnanalyzedCount]);

  async function handleBatchAnalyze() {
    const unanalyzed = tracks.filter(t => t.status !== 'completed');
    if (unanalyzed.length === 0) {
      addToast('Toutes les tracks sont déjà analysées', 'info');
      return;
    }
    addToast(`Analyse de ${unanalyzed.length} tracks en parallèle…`, 'info');

    // Mark all as analyzing immediately
    for (const track of unanalyzed) {
      const title = track.title || track.original_filename || 'Track';
      setAnalyzingIds(prev => new Set(prev).add(track.id));
      setAnalysisProgress(prev => ({ ...prev, [track.id]: { pct: 0, title, isLocal: false } }));
    }

    // Run all analyses in parallel
    let ok = 0;
    const results = await Promise.allSettled(unanalyzed.map(async (track) => {
      const title = track.title || track.original_filename || 'Track';
      const id = track.id;
      try {
        const result = await analyzeTrack(id, {
          onProgress: (pct) => setAnalysisProgress(prev => ({ ...prev, [id]: { pct, title, isLocal: prev[id]?.isLocal ?? false } })),
        });
        if (!result.usedLocal) {
          await pollTrackUntilDone(id, (updated) => {
            setTracks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
          });
        }
        // Update single track in-place
        const fresh = await getTrack(id);
        setTracks(prev => prev.map(t => t.id === id ? fresh : t));
        ok++;
      } finally {
        setAnalyzingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        setAnalysisProgress(prev => { const n = { ...prev }; delete n[id]; return n; });
      }
    }));

    addToast(`${ok}/${unanalyzed.length} tracks analysées !`, ok === unanalyzed.length ? 'success' : 'error');
  }

  // ── Ré-analyser TOUS les tracks (même completed) — nouveau BPM v2 ──
  async function handleReanalyzeAll() {
    const completed = tracks.filter(t => t.status === 'completed');
    if (completed.length === 0) {
      addToast('Aucun track à ré-analyser', 'info');
      return;
    }
    if (!confirm(`Ré-analyser ${completed.length} tracks avec le nouvel algo BPM ? Ça peut prendre quelques minutes.`)) return;

    addToast(`Ré-analyse de ${completed.length} tracks lancée…`, 'info');

    for (const track of completed) {
      const title = track.title || track.original_filename || 'Track';
      setAnalyzingIds(prev => new Set(prev).add(track.id));
      setAnalysisProgress(prev => ({ ...prev, [track.id]: { pct: 0, title, isLocal: false } }));
    }

    let ok = 0;
    // Process in batches of 3 to avoid overload
    for (let i = 0; i < completed.length; i += 3) {
      const batch = completed.slice(i, i + 3);
      await Promise.allSettled(batch.map(async (track) => {
        const id = track.id;
        try {
          const result = await analyzeTrack(id, {
            onProgress: (pct) => setAnalysisProgress(prev => ({
              ...prev, [id]: { pct, title: track.title || 'Track', isLocal: false }
            })),
          });
          if (!result.usedLocal) {
            await pollTrackUntilDone(id, () => {
              setAnalysisProgress(prev => ({
                ...prev, [id]: { ...prev[id], pct: Math.min(98, (prev[id]?.pct ?? 0) + 5) }
              }));
            });
          }
          const fresh = await getTrack(id);
          setTracks(prev => prev.map(t => t.id === id ? fresh : t));
          ok++;
        } finally {
          setAnalyzingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
          setAnalysisProgress(prev => { const n = { ...prev }; delete n[id]; return n; });
        }
      }));
    }

    addToast(`${ok}/${completed.length} tracks ré-analysées avec le nouveau BPM !`, ok === completed.length ? 'success' : 'error');
  }

  // Register handleBatchAnalyze in context so TopBar can call it
  useEffect(() => {
    registerAnalyzeAllHandler(handleBatchAnalyze);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  // ── Multi-select batch operations ────────────────────────────────────
  function handleMultiSelect(trackId: number, e?: React.MouseEvent) {
    if (e?.shiftKey || e?.ctrlKey || e?.metaKey) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(trackId)) next.delete(trackId);
        else next.add(trackId);
        return next;
      });
    } else {
      // Normal click — find display track and select it
      const dt = displayTracks.find((t: any) => t.id === trackId);
      if (dt) setSelectedTrack(dt, 'multiSelect:click');
    }
  }

  async function handleBatchTag(tag: string) {
    const ids = Array.from(selectedIds);
    let ok = 0;
    await Promise.allSettled(ids.map(async (id) => {
      const track = tracks.find(t => t.id === id);
      const currentTags = track?.tags ? String(track.tags).split(',').map(t => t.trim()).filter(Boolean) : [];
      if (!currentTags.includes(tag)) {
        currentTags.push(tag);
        await updateTrack(id, { tags: currentTags.join(',') });
        setTracks(prev => prev.map(t => t.id === id ? { ...t, tags: currentTags.join(',') } : t));
        ok++;
      }
    }));
    addToast(`Tag "${tag}" ajouté à ${ok} tracks`, 'success');
  }

  async function handleBatchCategory(category: string) {
    const ids = Array.from(selectedIds);
    await Promise.allSettled(ids.map(async (id) => {
      await updateTrack(id, { category });
      setTracks(prev => prev.map(t => t.id === id ? { ...t, category } as any : t));
    }));
    addToast(`Catégorie "${category}" appliquée`, 'success');
  }

  async function handleBatchRating(rating: number) {
    const ids = Array.from(selectedIds);
    await Promise.allSettled(ids.map(async (id) => {
      await updateTrack(id, { rating });
      setTracks(prev => prev.map(t => t.id === id ? { ...t, rating } : t));
    }));
    addToast(`${ids.length} tracks notées ${rating}⭐`, 'success');
  }

  async function handleBatchColor(color: string) {
    const ids = Array.from(selectedIds);
    await Promise.allSettled(ids.map(async (id) => {
      await updateTrack(id, { color_code: color });
      setTracks(prev => prev.map(t => t.id === id ? { ...t, color_code: color } as any : t));
    }));
    addToast(`Couleur appliquée à ${ids.length} tracks`, 'success');
  }

  async function handleBatchAnalyzeSelected() {
    const ids = Array.from(selectedIds);
    addToast(`Analyse de ${ids.length} tracks en parallèle…`, 'info');

    // Mark all as analyzing
    for (const id of ids) {
      const t = tracks.find(t => t.id === id);
      const title = t?.title || t?.original_filename || 'Track';
      setAnalyzingIds(prev => new Set(prev).add(id));
      setAnalysisProgress(prev => ({ ...prev, [id]: { pct: 0, title, isLocal: false } }));
    }

    let ok = 0;
    await Promise.allSettled(ids.map(async (id) => {
      try {
        const result = await analyzeTrack(id, {
          onProgress: (pct) => setAnalysisProgress(prev => ({ ...prev, [id]: { ...prev[id], pct } })),
        });
        if (!result.usedLocal) {
          await pollTrackUntilDone(id, (updated) => {
            setTracks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
          });
        }
        const fresh = await getTrack(id);
        setTracks(prev => prev.map(t => t.id === id ? fresh : t));
        ok++;
      } finally {
        setAnalyzingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        setAnalysisProgress(prev => { const n = { ...prev }; delete n[id]; return n; });
      }
    }));

    addToast(`${ok}/${ids.length} tracks analysées !`, ok === ids.length ? 'success' : 'error');
  }

  async function handleBatchExportSelected() {
    const ids = Array.from(selectedIds);
    try {
      const blob = await exportBatchRekordbox(ids);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TrackCue_${ids.length}_tracks_rekordbox.xml`;
      a.click();
      URL.revokeObjectURL(url);
      addToast(`${ids.length} tracks exportées en Rekordbox XML`, 'success');
    } catch (e: any) {
      addToast(`Erreur export: ${e.message || 'inconnue'}`, 'error');
    }
  }

  async function handleBatchDeleteSelected() {
    const ids = Array.from(selectedIds);
    if (!window.confirm(`Supprimer ${ids.length} tracks ?`)) return;
    const previousTracks = tracks;
    const idSet = new Set(ids);
    setTracks(prev => prev.filter(t => !idSet.has(t.id)));
    setSelectedIds(new Set());
    setSelectedTrack(null, 'batchDelete');
    try {
      await batchDeleteTracks(ids);
      addToast(`${ids.length} tracks supprimées`, 'success');
    } catch (e: any) {
      console.error('[TrackCue] Batch delete failed, fallback un par un:', e?.message);
      // Fallback: supprimer un par un
      let deleted = 0;
      for (const id of ids) {
        try { await deleteTrack(id); deleted++; } catch {}
      }
      if (deleted === ids.length) {
        addToast(`${deleted} tracks supprimées`, 'success');
      } else if (deleted > 0) {
        addToast(`${deleted}/${ids.length} tracks supprimées (${ids.length - deleted} erreurs)`, 'error');
        await loadTracks();
      } else {
        setTracks(previousTracks);
        addToast(`Échec suppression : ${e?.message || 'erreur inconnue'}`, 'error');
      }
    }
  }

  async function handleDeleteAllTracks() {
    const realTracks = tracks.filter(t => t.id > 0);
    if (realTracks.length === 0) { addToast('Bibliothèque déjà vide', 'info'); return; }
    if (!window.confirm(`Supprimer les ${realTracks.length} tracks de ta bibliothèque ?\n\nCette action est irréversible.`)) return;
    const previousTracks = tracks;
    const count = realTracks.length;
    setTracks(prev => prev.filter(t => t.id <= 0));
    setSelectedIds(new Set());
    setSelectedTrack(null);
    try {
      await batchDeleteTracks(realTracks.map(t => t.id));
      addToast(`${count} tracks supprimées`, 'success');
    } catch (e: any) {
      console.error('[TrackCue] Delete all failed, fallback:', e?.message);
      let deleted = 0;
      for (const t of realTracks) {
        try { await deleteTrack(t.id); deleted++; } catch {}
      }
      if (deleted === count) {
        addToast(`${deleted} tracks supprimées`, 'success');
      } else if (deleted > 0) {
        addToast(`${deleted}/${count} supprimées (${count - deleted} erreurs)`, 'error');
        await loadTracks();
      } else {
        setTracks(previousTracks);
        addToast(`Échec suppression : ${e?.message || 'erreur inconnue'}`, 'error');
      }
    }
  }

  // Memoize TABS filter for optimal performance — recalculates only when desktop status or feature display changes
  const filteredTabs = useMemo(() => {
    return TABS.filter(t => {
      if ((t as any).desktopOnly && !isDesktopApp()) return false;
      const fk = (t as any).featureKey;
      if (fk && getFeatureDisplayMode(fk) === 'hidden') return false;
      return true;
    });
  }, [getFeatureDisplayMode]);

  return (
    <div
      className="p-2 sm:p-4 space-y-2 sm:space-y-3 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleFileDrop}
    >
      {/* ── Skip-to-content (a11y) ── */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-white focus:text-black">
        Aller au contenu principal
      </a>
      {/* ── Onboarding Tour — première visite ── */}
      <OnboardingTour />

      {/* ── Drag & Drop Overlay ── */}
      {isDragging && (
        <div className="absolute inset-0 z-[9998] bg-cyan-500/10 backdrop-blur-sm border-2 border-dashed border-cyan-400/60 rounded-xl flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 text-cyan-400">
            <Upload size={48} className="animate-bounce" />
            <span className="text-lg font-semibold">Dépose tes fichiers audio ici</span>
            <span className="text-sm text-cyan-400/60">MP3 · WAV · FLAC · AAC · OGG · M4A · AIF</span>
          </div>
        </div>
      )}

      {/* Demo banner (uniquement en mode demo) */}
      {isDemo && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-xl">
          <span className="text-sm">🎧</span>
          <span className="text-sm text-[var(--text-primary)]">
            <strong>Mode demo</strong> — Importe tes tracks pour commencer l'analyse !
          </span>
          <button
            onClick={() => fileRef.current?.click()}
            className="ml-auto px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer border-none hover:bg-blue-500 transition-colors"
          >
            Importer
          </button>
        </div>
      )}

      {/* ── Barre de progression d'analyse (bottom-right mini popup) ── */}
      <AnalysisProgressIndicator analysisProgress={analysisProgress} />

      {/* Duplicate Detection */}
      {!isDemo && tracks.length > 1 && (
        <DuplicateDetector
          tracks={tracks}
          onDeleteTrack={async (trackId) => {
            await deleteTrack(trackId);
            await loadTracks();
            addToast(tr('toast.duplicate_removed', lang), 'success');
          }}
          onSelectTrack={(track) => {
            const dt = toDisplayTrack(track);
            setSelectedTrack(dt, 'duplicateDetector:select');
          }}
        />
      )}

      {/* Player + Tabs — flex row, stacks on mobile */}
      <div className="flex flex-col lg:flex-row gap-2 sm:gap-3 items-stretch" style={{ minHeight: 0 }}>

        {/* Left: Player (waveform) + TrackList directement dessous */}
        <div className="flex-1 min-w-0 flex flex-col gap-3" style={{ flexBasis: '0%' }}>
          <PlayerCard
            key={`pc-${selectedTrack?.id}-${selectedTrack?.analyzed ? 'done' : 'pending'}-${selectedTrack?.bpm ?? 0}`}
            track={selectedTrack}
            cuePoints={effectiveCuePoints}
            beatPositions={(selectedTrack as any)?.analysis?.beat_positions ?? []}
            onImportClick={() => fileRef.current?.click()}
            onPrev={selectedTrackIdx > 0 ? handlePrev : undefined}
            onNext={selectedTrackIdx >= 0 && selectedTrackIdx < displayTracks.length - 1 ? handleNext : undefined}
            onWaveformClick={handleWaveformClick}
            onTimeUpdate={(ms) => { setCuePositionMs(ms); handleStemTimeUpdate(ms); }}
            onPlay={() => { handleTrackPlay(); handleStemPlay(); }}
            mutedStems={stemsStatus?.status === 'completed' ? stemMuted : undefined}
            playerRef={playerRef}
          />
          {/* TrackList sous le waveform */}
          <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] overflow-hidden flex flex-col" style={{ minHeight: 180 }}>
            {/* Barre outils bibliothèque */}
            {!isDemo && tracks.length > 0 && selectedIds.size === 0 && (
              <div className="flex items-center justify-end px-3 py-1.5 border-b border-[var(--border-subtle)]">
                <button
                  onClick={handleDeleteAllTracks}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-red-500/30 text-red-400/70 hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/50 transition-all cursor-pointer bg-transparent"
                  title="Supprimer tous les tracks du compte"
                >
                  <Trash2 size={12} /> {tr('dashboard.clear_library', lang)}
                </button>
                <button
                  onClick={handleReanalyzeAll}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-cyan-500/30 text-cyan-400/70 hover:bg-cyan-500/15 hover:text-cyan-400 hover:border-cyan-500/50 transition-all cursor-pointer bg-transparent"
                  title={tr('dashboard.reanalyze_all', lang)}
                >
                  <RefreshCw size={12} /> {tr('dashboard.reanalyze_all', lang)}
                </button>
              </div>
            )}
            <BatchActionBar
              selectedCount={selectedIds.size}
              onClearSelection={() => setSelectedIds(new Set())}
              onBatchTag={handleBatchTag}
              onBatchCategory={handleBatchCategory}
              onBatchRating={handleBatchRating}
              onBatchColor={handleBatchColor}
              onBatchAnalyze={handleBatchAnalyzeSelected}
              onBatchExport={handleBatchExportSelected}
              onBatchDelete={handleBatchDeleteSelected}
              onBatchEnrich={() => {
                const selected = rawTracksForTabs.filter((t: any) => selectedIds.has(t.id));
                if (selected.length > 0) setEnrichTracks(selected);
              }}
              onSelectAll={() => setSelectedIds(new Set(displayTracks.map((t: any) => t.id)))}
            />
            <TrackList
              tracks={displayTracks}
              selectedTrack={selectedTrack}
              playingTrackId={null}
              favoriteIds={favoriteIds}
              selectedIds={selectedIds}
              searchQuery={effectiveSearch}
              gridView={gridView}
              sortBy={sortBy}
              filters={filters}
              genres={genres}
              onSelect={(track: any, e?: React.MouseEvent) => {
                if (e?.shiftKey || e?.ctrlKey || e?.metaKey) {
                  setSelectedIds(prev => {
                    const next = new Set(prev);
                    if (next.has(track.id)) next.delete(track.id);
                    else next.add(track.id);
                    return next;
                  });
                } else {
                  handleSelectTrack(track);
                }
              }}
              onDoubleClick={handleSelectTrack}
              onContextMenu={handleContextMenu}
              onFavoriteToggle={handleFavorite}
              onRatingChange={async (trackId: number, rating: number) => {
                try {
                  await updateTrack(trackId, { rating });
                  setTracks(prev => prev.map(t => t.id === trackId ? { ...t, rating } : t));
                } catch {}
              }}
              onGridToggle={setGridView}
              onSearchChange={setSearchQuery}
              onSortChange={setSortBy}
              onFilterChange={(key, value) => setFilters(prev => ({ ...prev, [key]: value }))}
              onFilterReset={() => setFilters({ bpmMin: 0, bpmMax: 300, keyFilter: null, genreFilter: null, energyMin: 0, energyMax: 100, showAnalyzedOnly: false, showFavoritesOnly: false })}
              isLoading={loading}
              onImportClick={() => fileRef.current?.click()}
              analyzingIds={analyzingIds}
              unanalyzedCount={unanalyzedCount}
              autoAnalyze={autoAnalyze}
              onToggleAutoAnalyze={() => setAutoAnalyze(prev => !prev)}
              onAnalyzeAll={handleBatchAnalyze}
              onReanalyzeTrack={handleReanalyzeTrack}
              onDeleteTrack={handleDeleteTrack}
              onAddTagTrack={(trackId) => {
                // Ouvrir l'onglet Info pour le track sélectionné (tag editing)
                const t = displayTracks.find((dt: any) => dt.id === trackId);
                if (t) { handleSelectTrack(t); setActiveTab('info'); }
              }}
              onIdentifyTrack={handleIdentifyTrack}
              identifyingIds={identifyingIds}
            />
            {/* Charger plus */}
            {hasMoreTracks && (
              <div className="px-3 py-2 border-t border-[var(--border-subtle)]">
                <button
                  onClick={loadMoreTracks}
                  disabled={loadingMore}
                  className="w-full py-1.5 rounded-lg text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loadingMore ? '⏳ Chargement…' : `⬇ Charger plus (${tracksTotal - tracks.length} restantes)`}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Tab panel vertical — full width on mobile, fluid on desktop */}
        <div className="w-full lg:w-[clamp(260px,25vw,380px)] flex-shrink-0 bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] flex overflow-hidden max-h-[60vh] sm:max-h-[50vh] lg:max-h-none">

          {/* Tab Selector - Extracted Component */}
          <TabSelector
            tabs={filteredTabs}
            activeTab={activeTab}
            onTabSelect={setActiveTab}
            selectedTrack={selectedTrack}
            userPlan={userPlan}
            getFeatureDisplayMode={getFeatureDisplayMode}
          />

          {/* Tab Content Container */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {/* Tab Content - Extracted Component */}
            <TabContent
              activeTab={activeTab}
              selectedTrack={selectedTrack}
              selectedRawTrack={selectedRawTrack}
              effectiveCuePoints={effectiveCuePoints}
              cuePositionMs={cuePositionMs}
              userPlan={userPlan}
              getFeatureDisplayMode={getFeatureDisplayMode}
              lang={lang}
              playerRef={playerRef}
              stemsStatus={stemsStatus}
              stemMuted={stemMuted}
              fxParams={fxParams}
              sessionNotes={sessionNotes}
              playlists={playlists}
              rawTracksForTabs={rawTracksForTabs}
              onAutoCuePoints={handleAutoCuePoints}
              onCreateCue={handleCreateCue}
              onDeleteCue={handleDeleteCue}
              onBulkDeleteCues={handleBulkDeleteCues}
              onDeleteAllCues={handleDeleteAllCues}
              onRegenerateCues={handleRegenerateCues}
              onCueClick={(cue) => {
                if (cue.cue_type === 'loop' && cue.end_position_ms != null) {
                  playerRef.current?.setLoop?.(cue.position_ms, cue.end_position_ms);
                } else {
                  playerRef.current?.seekTo?.(cue.position_ms);
                }
              }}
              onPreviewCue={(cue) => {
                const posMs = cue.position_ms ?? 0;
                playerRef.current?.seekTo?.(posMs);
                const audio = playerRef.current?.getAudio?.();
                if (audio && audio.paused) {
                  audio.play().catch(() => {});
                }
                if ((window as any).__cuePreviewTimer) clearTimeout((window as any).__cuePreviewTimer);
                (window as any).__cuePreviewTimer = setTimeout(() => {
                  const a = playerRef.current?.getAudio?.();
                  if (a && !a.paused) a.pause();
                }, 5000);
              }}
              onSaveTrack={updateTrack}
              onToggleStemMute={toggleStemMute}
              onRequestStems={async () => {
                if (!selectedTrack || selectedTrack.id < 0) return;
                setStemsStatus({ status: 'processing' });
                const { getToken } = await import('@/lib/api');
                const token = getToken();
                const BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
                const headers: any = token ? { Authorization: `Bearer ${token}` } : {};
                const trackId = selectedTrack.id;
                try {
                  const res = await fetch(`${BASE}/advanced/stems/${trackId}`, {
                    method: 'POST', headers,
                  });
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || `HTTP ${res.status}`);
                  }
                  addToast('Séparation Demucs en cours… (~3-5 min)', 'info');
                  const poll = async () => {
                    const r = await fetch(`${BASE}/advanced/stems/${trackId}/status`, { headers });
                    if (!r.ok) return;
                    const d = await r.json();
                    if (d.status === 'completed') {
                      const origin = BASE.replace(/\/api\/v1\/?$/, '');
                      const abs = (u?: string) => u && !u.startsWith('http') ? `${origin}${u}` : u;
                      setStemsStatus({
                        status: 'completed',
                        vocals_url: abs(d.vocals_url),
                        drums_url:  abs(d.drums_url),
                        bass_url:   abs(d.bass_url),
                        other_url:  abs(d.other_url),
                      });
                      addToast(tr('toast.saved', lang), 'success');
                    } else if (d.status === 'failed') {
                      setStemsStatus({ status: 'failed', error: d.error || null });
                      addToast(d.error || tr('toast.error', lang), 'error');
                    } else {
                      setTimeout(poll, 5000);
                    }
                  };
                  setTimeout(poll, 5000);
                } catch (e: any) {
                  setStemsStatus({ status: 'failed', error: e.message || null });
                  addToast(e.message || tr('toast.error', lang), 'error');
                }
              }}
              onFxChange={(effect, value) => {
                setFxParams(prev => ({ ...prev, [effect]: value }));
                playerRef.current?.setFX?.(effect, value);
              }}
              onResetAllFx={() => {
                setFxParams({});
                ['reverb', 'delay', 'filter_lp', 'filter_hp', 'flanger', 'phaser', 'distortion', 'compressor'].forEach(fx => {
                  playerRef.current?.setFX?.(fx, 0);
                });
              }}
              onSessionNotesChange={(notes) => {
                setSessionNotes(notes);
                try { localStorage.setItem('trackcue_session_notes', notes); } catch {}
              }}
              onSelectTrack={handleSelectTrack}
              onPlaylistSelect={(pl) => {
                setActiveSection(`playlist_${pl.id}`);
                addToast(`Playlist "${pl.name}" chargée`, 'info');
              }}
              onPlaylistCreate={async (name) => {
                try {
                  const pl = await createPlaylist({ name });
                  setPlaylists(prev => [...prev, pl]);
                  addToast(`"${name}" créée`, 'success');
                } catch { addToast(tr('toast.error', lang), 'error'); }
              }}
              onPlaylistDelete={async (id) => {
                try {
                  await apiDeletePlaylist(id);
                  setPlaylists(prev => prev.filter(p => p.id !== id));
                  addToast('Playlist supprimée', 'success');
                } catch { addToast(tr('toast.error', lang), 'error'); }
              }}
              onToast={addToast}
              onLoadTracks={loadTracks}
            />
          </div>
        </div>

      </div>


      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".mp3,.wav,.flac,.aac,.ogg,.m4a,.aif,.aiff,.opus"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Upload indicator */}
      {uploading && (
        <div className="fixed bottom-4 right-4 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg z-50">
          <Loader2 size={16} className="text-blue-400 animate-spin" />
          <span className="text-sm text-[var(--text-primary)]">Upload en cours...</span>
        </div>
      )}

      {/* Toast notifications */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-xl border pointer-events-auto shadow-lg text-sm font-medium ${
              t.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : t.type === 'error'
                ? 'bg-red-500/15 border-red-500/30 text-red-400'
                : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {/* Export Bibliothèque Modal */}
      {showExport && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowExport(false)}>
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-md border border-[var(--border-default)] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Download size={17} className="text-cyan-400" /> Export Bibliothèque
              </h2>
              <button onClick={() => setShowExport(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer bg-transparent border-none p-1">
                <X size={15} />
              </button>
            </div>
            <div className="space-y-2.5">
              {[
                { label: 'Rekordbox XML', desc: 'Compatible Pioneer DJ, rekordbox 5/6', color: 'cyan', action: handleExportAllRekordbox },
                { label: 'Serato CSV', desc: 'Compatible Serato DJ Pro', color: 'blue', action: handleExportAllSerato },
                { label: 'Traktor NML', desc: 'Compatible Traktor Pro 3', color: 'orange', action: handleExportAllTraktor },
                { label: 'CSV Tracklist', desc: 'Titre, Artiste, BPM, Key, Genre, Energy…', color: 'emerald', action: handleExportAllCSV },
                { label: 'Tracklist TXT', desc: 'Format texte numéroté', color: 'violet', action: handleExportAllTXT },
              ].map(opt => (
                <button key={opt.label} onClick={opt.action}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-${opt.color}-500/40 hover:bg-${opt.color}-500/5 transition-all cursor-pointer text-left`}>
                  <div className={`w-9 h-9 rounded-xl bg-${opt.color}-500/10 flex items-center justify-center shrink-0`}>
                    <Download size={16} className={`text-${opt.color}-400`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{opt.label}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-4 text-center">
              {tracks.length} morceaux dans la bibliothèque
            </p>
          </div>
        </div>
      )}

      {/* Metadata Enrich Modal */}
      {enrichTracks.length > 0 && (
        <MetadataEnrichModal
          tracks={enrichTracks}
          onClose={() => setEnrichTracks([])}
          onTrackUpdated={(trackId, data) => {
            setTracks((prev: any[]) =>
              prev.map((t: any) => t.id === trackId ? { ...t, ...data } : t)
            );
            // Sync selectedTrack si c'est la piste courante
            if (selectedTrack?.id === trackId) {
              setSelectedTrack((prev: any) => prev ? { ...prev, ...data } : prev, 'onTrackUpdated');
            }
          }}
        />
      )}

      {/* Context Menu - Extracted Component */}
      <TrackContextMenu
        contextMenu={contextMenu}
        contextMenuRef={contextMenuRef}
        playlists={playlists}
        isDesktop={isDesktopApp()}
        onAnalyze={handleReanalyzeTrack}
        onAnalyzePro={async (trackId) => {
          addToast('Analyse Pro en cours… Stems IA + Cue Points', 'info');
          const { getToken } = await import('@/lib/api');
          const token = getToken();
          const BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
          const headers: any = token ? { Authorization: `Bearer ${token}` } : {};
          try {
            const stemsRes = await fetch(`${BASE}/advanced/stems/${trackId}`, { method: 'POST', headers });
            if (!stemsRes.ok) throw new Error((await stemsRes.json().catch(() => ({}))).detail || 'Erreur stems');
            const waitStems = async (): Promise<void> => {
              const r = await fetch(`${BASE}/advanced/stems/${trackId}/status`, { headers });
              const d = await r.json();
              if (d.status === 'completed') return;
              if (d.status === 'failed') throw new Error(d.error || 'Stems échoué');
              await new Promise(res => setTimeout(res, 5000));
              return waitStems();
            };
            await waitStems();
            addToast('Stems terminés ! Génération des cue points IA…', 'success');
            const cueRes = await fetch(`${BASE}/cues/${trackId}/generate`, { method: 'POST', headers });
            if (!cueRes.ok) throw new Error('Erreur génération cues');
            addToast('Analyse Pro terminée !', 'success');
            await loadTracks();
          } catch (e: any) {
            addToast(e.message || 'Erreur Analyse Pro', 'error');
          }
        }}
        onEnrich={(trackId) => handleIdentifyTrack(trackId)}
        onExportRekordbox={handleExportRekordbox}
        onExportCSV={handleExportCSV}
        onExportTXT={handleExportTXT}
        onAddToPlaylist={async (trackId, playlistId) => {
          try {
            await addTracksToPlaylist(playlistId, [trackId]);
            addToast(`Ajouté à "${playlists.find(p => p.id === playlistId)?.name}"`, 'success');
          } catch {
            addToast(tr('toast.error', lang), 'error');
          }
        }}
        onDelete={handleDeleteTrack}
        onClose={() => setContextMenu(null)}
      />
    </div>
  );
}
