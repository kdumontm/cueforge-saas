// @ts-nocheck
'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Upload, Loader2, Zap, RefreshCw, MoreVertical, Trash2, Copy, Download } from 'lucide-react';
import { uploadTrack, analyzeTrack, pollTrackUntilDone, listTracks, deleteTrack, getTrack, getCurrentUser, isAuthenticated, getTrackCuePoints, createCuePoint, deleteCuePoint, exportRekordbox, updateTrack, listPlaylists, createPlaylist, deletePlaylist as apiDeletePlaylist, getPlaylistTracks, addTracksToPlaylist, listSets, getCrateTracks, type Playlist } from '@/lib/api';
import type { Track } from '@/types';
import { useDashboardContext } from './DashboardContext';

import PlayerCard from '@/components/player/PlayerCard';
import TrackList from '@/components/tracks/TrackList';
import CuesTab from '@/components/tabs/CuesTab';
import BeatgridTab from '@/components/tabs/BeatgridTab';
import StemsTab from '@/components/tabs/StemsTab';
import EQTab from '@/components/tabs/EQTab';
import FXTab from '@/components/tabs/FXTab';
import MixTab from '@/components/tabs/MixTab';
import PlaylistsTab from '@/components/tabs/PlaylistsTab';
import StatsTab from '@/components/tabs/StatsTab';
import HistoryTab from '@/components/tabs/HistoryTab';
import InfoEditTab from '@/components/tabs/InfoEditTab';
import BatchActionBar from '@/components/tracks/BatchActionBar';
import KeyboardShortcutsModal from '@/components/KeyboardShortcutsModal';
import DuplicateDetector from '@/components/DuplicateDetector';

// ── Camelot conversion ─────────────────────────────────────────────────
const CAMELOT_WHEEL_MAP: Record<string, string> = {
  'C': '8B', 'Am': '8A', 'G': '9B', 'Em': '9A', 'D': '10B', 'Bm': '10A',
  'A': '11B', 'F#m': '11A', 'E': '12B', 'C#m': '12A', 'B': '1B', 'G#m': '1A',
  'F#': '2B', 'Ebm': '2A', 'Db': '3B', 'Bbm': '3A', 'Ab': '4B', 'Fm': '4A',
  'Eb': '5B', 'Cm': '5A', 'Bb': '6B', 'Gm': '6A', 'F': '7B', 'Dm': '7A',
  'C#': '3B', 'D#m': '2A', 'G#': '4B', 'A#': '6B', 'D#': '5B',
};

function toCamelot(key: string | null | undefined): string | null {
  if (!key) return null;
  return CAMELOT_WHEEL_MAP[key] || key;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || isNaN(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Tab config ─────────────────────────────────────────────────────────
const TABS = [
  { id: 'info',  label: 'Info',  icon: '📝' },
  { id: 'cues',  label: 'Cues',  icon: '🎯' },
  { id: 'stems', label: 'Stems', icon: '🎸' },
  { id: 'eq',    label: 'EQ',    icon: '〰' },
  { id: 'fx',    label: 'FX',    icon: '✨' },
  { id: 'mix',   label: 'Mix',   icon: '🎡' },
  { id: 'notes', label: 'Notes', icon: '📋' },
];

const GLOBAL_TABS: string[] = [];

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
  { id: -1, filename: 'shed_my_skin.mp3', original_filename: 'Shed My Skin.mp3', status: 'analyzed', created_at: '2025-03-28T10:00:00Z', title: 'Shed My Skin', artist: 'Ben Bohmer', genre: 'Melodic House', rating: 5, tags: 'peak,vocal', category: 'Peak Time', cue_points: DEMO_CUE_POINTS, analysis: makeDemoAnalysis(124, '6A', 0.72, 402000) },
  { id: -2, filename: 'lost_highway.mp3', original_filename: 'Lost Highway.mp3', status: 'analyzed', created_at: '2025-03-27T09:00:00Z', title: 'Lost Highway', artist: 'Stephan Bodzin', genre: 'Techno', rating: 4, tags: 'dark,peak', category: 'Peak Time', cue_points: [], analysis: makeDemoAnalysis(134, '10B', 0.88, 495000) },
  { id: -3, filename: 'equinox.mp3', original_filename: 'Equinox.mp3', status: 'analyzed', created_at: '2025-03-26T08:00:00Z', title: 'Equinox', artist: 'Solomun', genre: 'Deep House', rating: 4, tags: 'warmup', category: 'Warm Up', cue_points: [], analysis: makeDemoAnalysis(122, '3A', 0.65, 450000) },
  { id: -4, filename: 'disco_volante.mp3', original_filename: 'Disco Volante.mp3', status: 'analyzed', created_at: '2025-03-25T07:00:00Z', title: 'Disco Volante', artist: 'ANNA', genre: 'Techno', rating: 5, tags: 'peak,dark', category: 'Peak Time', cue_points: [], analysis: makeDemoAnalysis(136, '8A', 0.91, 425000) },
  { id: -5, filename: 'dreamer.mp3', original_filename: 'Dreamer.mp3', status: 'analyzed', created_at: '2025-03-24T06:00:00Z', title: 'Dreamer', artist: 'Tale Of Us', genre: 'Melodic House', rating: 3, tags: 'warmup,vocal', category: 'Warm Up', cue_points: [], analysis: makeDemoAnalysis(120, '1A', 0.58, 550000) },
  { id: -6, filename: 'bangalore.mp3', original_filename: 'Bangalore.mp3', status: 'analyzed', created_at: '2025-03-23T05:00:00Z', title: 'Bangalore', artist: 'Bicep', genre: 'House', rating: 4, tags: 'festival', category: 'Build Up', cue_points: [], analysis: makeDemoAnalysis(128, '4B', 0.80, 355000) },
];

const DEMO_DISPLAY_TRACKS: any[] = DEMO_RAW_TRACKS.map(t => ({
  id: t.id, title: t.title, artist: t.artist, genre: t.genre || '—',
  bpm: t.analysis?.bpm, key: t.analysis?.key, energy: t.analysis?.energy ? Math.round(t.analysis.energy * 100) : null,
  duration: (() => { const s = (t.analysis?.duration_ms || 0) / 1000; return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`; })(),
  rating: t.rating || 0, tags: t.tags ? String(t.tags).split(',') : [], analyzed: true, color: null,
}));

// ── Main Component ─────────────────────────────────────────────────────
export default function DashboardV2() {
  const {
    activeSection, globalSearch, registerImportHandler,
    autoAnalyze, setAutoAnalyze,
    setUnanalyzedCount, registerAnalyzeAllHandler,
  } = useDashboardContext();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<any | null>(null);
  // Ref to remember the last selected track ID — used to restore selection after loadTracks
  const selectedTrackIdRef = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState('cues');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<any>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [toasts, setToasts] = useState<{id: number; msg: string; type: 'success' | 'error' | 'info'}[]>([]);
  const toastIdRef = useRef(0);
  const [contextMenu, setContextMenu] = useState<{trackId: number; x: number; y: number} | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // autoAnalyze and setAutoAnalyze come from DashboardContext (shared with TopBar)

  // Session notes
  const [sessionNotes, setSessionNotes] = useState<string>(() => {
    try { return localStorage.getItem('cueforge_session_notes') || ''; } catch { return ''; }
  });
  // Keyboard shortcuts modal
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Playlists & crate state
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [crateTracks, setCrateTracks] = useState<Track[]>([]);

  // Register import handler so Sidebar/TopBar can trigger file upload
  useEffect(() => {
    registerImportHandler(() => fileRef.current?.click());
  }, [registerImportHandler]);

  // Load playlists
  useEffect(() => {
    listPlaylists().then(setPlaylists).catch(() => {});
  }, []);

  // Load playlist tracks when a playlist section is active
  useEffect(() => {
    if (activeSection.startsWith('playlist_')) {
      const playlistId = parseInt(activeSection.replace('playlist_', ''));
      if (!isNaN(playlistId)) {
        getPlaylistTracks(playlistId).then(setPlaylistTracks).catch(() => setPlaylistTracks([]));
      }
    } else {
      setPlaylistTracks([]);
    }
  }, [activeSection]);

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

  // Use demo tracks when no real tracks exist
  const isDemo = realDisplayTracks.length === 0 && !loading;
  const displayTracks = isDemo ? DEMO_DISPLAY_TRACKS : realDisplayTracks;
  const rawTracksForTabs = isDemo ? DEMO_RAW_TRACKS : sectionFilteredTracks;

  // Find the raw Track for the selected display track (needed by tabs)
  const selectedRawTrack = useMemo(() => {
    if (!selectedTrack) return null;
    return rawTracksForTabs.find(t => t.id === selectedTrack.id) || null;
  }, [selectedTrack, rawTracksForTabs]);

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
        if (prev) { setSelectedTrack(prev); return; }
      }
      // Otherwise fall back to first track
      setSelectedTrack(displayTracks[0]);
    }
  }, [displayTracks, loading]);

  // Load tracks from API
  useEffect(() => {
    loadTracks();
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
      // Delete = delete selected track
      if (e.code === 'Delete' && selectedTrack && selectedTrack.id > 0) {
        if (window.confirm('Delete this track?')) {
          deleteTrack(selectedTrack.id).then(() => {
            loadTracks();
            setSelectedTrack(null);
          }).catch(console.error);
        }
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

  async function loadTracks() {
    try {
      setLoading(true);
      if (!isAuthenticated()) return;
      const data = await listTracks();
      // Handle both array and {tracks: [...]} response formats
      const trackList = Array.isArray(data) ? data : (data?.tracks || []);
      setTracks(trackList);
      // Refresh selectedTrack with the new object from the fresh list (prevents stale reference)
      if (selectedTrackIdRef.current) {
        const freshRaw = trackList.find((t: Track) => t.id === selectedTrackIdRef.current);
        if (freshRaw) setSelectedTrack(toDisplayTrack(freshRaw));
      }
    } catch (e: any) {
      console.error('Failed to load tracks:', e);
      // If session expired, don't crash — just show empty state
      if (e?.message === 'Session expired' || e?.message === 'Not authenticated') {
        setTracks([]);
        return;
      }
    } finally {
      setLoading(false);
    }
  }

  // Toast system
  const addToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev.slice(-4), { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // Transform API track to display format
  function toDisplayTrack(t: Track) {
    const analysis = t.analysis || {} as any;
    return {
      id: t.id,
      title: t.title || t.original_filename || t.filename || 'Unknown',
      artist: t.artist || 'Unknown',
      genre: analysis.genre || '—',
      bpm: analysis.bpm ? Math.round(analysis.bpm * 10) / 10 : null,
      key: toCamelot(analysis.key),
      energy: analysis.energy ? Math.round(analysis.energy * 100) : null,
      duration: formatDuration(analysis.duration_ms ? analysis.duration_ms / 1000 : null),
      rating: t.rating || 0,
      tags: t.tags ? (typeof t.tags === 'string' ? t.tags.split(',').filter(Boolean) : t.tags) : [],
      analyzed: t.status === 'analyzed',
      color: null,
      waveformPeaks: analysis.waveform_peaks || null,
    };
  }

  // ── Cue points ────────────────────────────────────────────────────────
  const [cuePoints, setCuePoints] = useState<any[]>([]);
  const [cuePositionMs, setCuePositionMs] = useState<number | null>(null); // position courante du playhead (ms)

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
    } catch (e) {
      console.error('Failed to create cue point:', e);
    }
  }

  async function handleDeleteCue(cueId: number) {
    try {
      await deleteCuePoint(cueId);
      setCuePoints(prev => prev.filter(c => c.id !== cueId));
    } catch (e) {
      console.error('Failed to delete cue point:', e);
    }
  }

  // Clic sur la waveform → mémoriser la position pour pré-remplir le formulaire CuesTab
  function handleWaveformClick(positionMs: number) {
    setCuePositionMs(positionMs);
    setActiveTab('cues'); // ouvrir l'onglet Cues automatiquement
  }

  function handleSelectTrack(track: any) {
    setSelectedTrack(track);
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
      addToast('Analyzing track...', 'info');
      await analyzeTrack(trackId);
      await pollTrackUntilDone(trackId);
      await loadTracks();
      addToast('Track analyzed!', 'success');
      setContextMenu(null);
    } catch (e) {
      addToast('Analysis failed', 'error');
    }
  }

  async function handleDeleteTrack(trackId: number) {
    if (!window.confirm('Delete this track?')) return;
    try {
      await deleteTrack(trackId);
      await loadTracks();
      setSelectedTrack(null);
      addToast('Track deleted', 'success');
      setContextMenu(null);
    } catch (e) {
      addToast('Delete failed', 'error');
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
    const analysis = (track as any).analysis || {};
    const cues = cuePoints.filter(() => true); // all loaded cues
    const rows = [
      ['Field', 'Value'],
      ['Title', track.title || track.original_filename || ''],
      ['Artist', track.artist || ''],
      ['BPM', analysis.bpm?.toFixed(2) || ''],
      ['Key', analysis.key || ''],
      ['Energy', analysis.energy != null ? Math.round(analysis.energy * 100) : ''],
      ['Duration (ms)', analysis.duration_ms || ''],
      ['Genre', analysis.genre || ''],
      ['Rating', track.rating || ''],
      ['Tags', track.tags || ''],
      [''],
      ['#', 'Name', 'Type', 'Position (ms)', 'Color'],
      ...cues.map((c, i) => [i + 1, c.name || '', c.cue_type || 'hot_cue', c.position_ms, c.color || '']),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${track.title || 'track'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Export CSV OK', 'success');
    setContextMenu(null);
  }

  function handleExportTXT(trackId: number) {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    const analysis = (track as any).analysis || {};
    const cues = cuePoints;
    const lines = [
      `=== CueForge — ${track.title || track.original_filename} ===`,
      `Artist : ${track.artist || '—'}`,
      `BPM    : ${analysis.bpm?.toFixed(2) || '—'}`,
      `Key    : ${analysis.key || '—'}`,
      `Energy : ${analysis.energy != null ? Math.round(analysis.energy * 100) + '%' : '—'}`,
      `Genre  : ${analysis.genre || '—'}`,
      `Rating : ${'⭐'.repeat(track.rating || 0)}`,
      `Tags   : ${track.tags || '—'}`,
      '',
      '--- Cue Points ---',
      ...cues.map((c, i) => {
        const ms = c.position_ms;
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        const fmt = `${m}:${String(s).padStart(2, '0')}`;
        return `[${i + 1}] ${c.name || 'Cue'} @ ${fmt} (${c.cue_type || 'hot_cue'})`;
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${track.title || 'track'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Export TXT OK', 'success');
    setContextMenu(null);
  }

  async function handleAutoCuePoints() {
    if (!selectedTrack || selectedTrack.id < 0) {
      addToast('Sélectionne un vrai track', 'info');
      return;
    }
    const raw = rawTracksForTabs.find(t => t.id === selectedTrack.id);
    const analysis = (raw as any)?.analysis;
    if (!analysis) {
      addToast('Analyse le track d\'abord', 'info');
      return;
    }
    const autoColors = ['#22c55e', '#ef4444', '#3b82f6', '#f97316', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899'];
    const points: Array<{ name: string; position_ms: number; color: string; cue_type: string; number?: number }> = [];

    // From drop_positions
    if (analysis.drop_positions?.length > 0) {
      analysis.drop_positions.slice(0, 2).forEach((ms: number, i: number) => {
        points.push({ name: `Drop ${i + 1}`, position_ms: ms, color: '#ef4444', cue_type: 'drop', number: points.length });
      });
    }
    // From phrase_positions
    if (analysis.phrase_positions?.length > 0) {
      analysis.phrase_positions.slice(0, 4).forEach((ms: number, i: number) => {
        points.push({ name: `Phrase ${i + 1}`, position_ms: ms, color: autoColors[i % autoColors.length], cue_type: 'phrase', number: points.length });
      });
    }
    // From section_labels
    if (analysis.section_labels?.length > 0) {
      analysis.section_labels.slice(0, 4).forEach((section: any, i: number) => {
        points.push({ name: section.label || `Section ${i + 1}`, position_ms: section.start_ms || section.position_ms || 0, color: autoColors[(i + 3) % autoColors.length], cue_type: 'section', number: points.length });
      });
    }

    if (points.length === 0) {
      addToast('Pas de données pour auto-cues', 'info');
      return;
    }
    addToast(`Génération de ${points.length} cues...`, 'info');
    for (const p of points) {
      try { await handleCreateCue(p); } catch {}
    }
    addToast(`${points.length} cues générés !`, 'success');
  }

  // Navigation prev/next dans la liste
  function handlePrev() {
    if (!selectedTrack || displayTracks.length === 0) return;
    const idx = displayTracks.findIndex((t: any) => t.id === selectedTrack.id);
    if (idx > 0) setSelectedTrack(displayTracks[idx - 1]);
  }

  function handleNext() {
    if (!selectedTrack || displayTracks.length === 0) return;
    const idx = displayTracks.findIndex((t: any) => t.id === selectedTrack.id);
    if (idx < displayTracks.length - 1) setSelectedTrack(displayTracks[idx + 1]);
  }

  // File upload
  async function handleFiles(files: FileList) {
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const uploaded = await uploadTrack(file);
        if (uploaded?.id) {
          addToast(`Upload: ${file.name}`, 'info');
          if (autoAnalyze) {
            await analyzeTrack(uploaded.id);
            await pollTrackUntilDone(uploaded.id);
            addToast(`${file.name} analysé !`, 'success');
          } else {
            addToast(`${file.name} importé (analyse manuelle)`, 'info');
          }
        }
      } catch (e) {
        console.error('Upload failed:', e);
        addToast(`Failed to upload ${file.name}`, 'error');
      }
    }
    await loadTracks();
    setUploading(false);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) handleFiles(e.target.files);
  }

  const unanalyzedCount = tracks.filter(t => t.status !== 'analyzed').length;

  // Sync unanalyzedCount to context so TopBar can read it
  useEffect(() => {
    setUnanalyzedCount(isDemo ? 0 : unanalyzedCount);
  }, [unanalyzedCount, isDemo, setUnanalyzedCount]);

  async function handleBatchAnalyze() {
    const unanalyzed = tracks.filter(t => t.status !== 'analyzed');
    if (unanalyzed.length === 0) {
      addToast('No unanalyzed tracks', 'info');
      return;
    }
    addToast(`Analyzing ${unanalyzed.length} tracks...`, 'info');
    for (const track of unanalyzed) {
      try {
        await analyzeTrack(track.id);
        await pollTrackUntilDone(track.id);
      } catch (e) {
        console.error(`Failed to analyze track ${track.id}:`, e);
      }
    }
    await loadTracks();
    addToast(`Analyzed ${unanalyzed.length} tracks!`, 'success');
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
      if (dt) setSelectedTrack(dt);
    }
  }

  async function handleBatchTag(tag: string) {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        const track = tracks.find(t => t.id === id);
        const currentTags = track?.tags ? String(track.tags).split(',').map(t => t.trim()).filter(Boolean) : [];
        if (!currentTags.includes(tag)) {
          currentTags.push(tag);
          await updateTrack(id, { tags: currentTags.join(',') });
        }
      } catch {}
    }
    await loadTracks();
    addToast(`Tag "${tag}" ajouté à ${ids.length} tracks`, 'success');
  }

  async function handleBatchCategory(category: string) {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try { await updateTrack(id, { category }); } catch {}
    }
    await loadTracks();
    addToast(`Catégorie "${category}" appliquée`, 'success');
  }

  async function handleBatchRating(rating: number) {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try { await updateTrack(id, { rating }); } catch {}
    }
    await loadTracks();
    addToast(`${ids.length} tracks notées ${rating}⭐`, 'success');
  }

  async function handleBatchColor(color: string) {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try { await updateTrack(id, { color_code: color }); } catch {}
    }
    await loadTracks();
    addToast(`Couleur appliquée à ${ids.length} tracks`, 'success');
  }

  async function handleBatchAnalyzeSelected() {
    const ids = Array.from(selectedIds);
    addToast(`Analyse de ${ids.length} tracks...`, 'info');
    for (const id of ids) {
      try {
        await analyzeTrack(id);
        await pollTrackUntilDone(id);
      } catch {}
    }
    await loadTracks();
    addToast(`${ids.length} tracks analysées!`, 'success');
  }

  async function handleBatchExportSelected() {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        const blob = await exportRekordbox(id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `track_${id}.xml`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {}
    }
    addToast(`${ids.length} tracks exportées`, 'success');
  }

  async function handleBatchDeleteSelected() {
    const ids = Array.from(selectedIds);
    if (!window.confirm(`Supprimer ${ids.length} tracks ?`)) return;
    for (const id of ids) {
      try { await deleteTrack(id); } catch {}
    }
    setSelectedIds(new Set());
    setSelectedTrack(null);
    await loadTracks();
    addToast(`${ids.length} tracks supprimées`, 'success');
  }

  return (
    <div
      className="p-4 space-y-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleFileDrop}
    >
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

      {/* Duplicate Detection */}
      {!isDemo && tracks.length > 1 && (
        <DuplicateDetector
          tracks={tracks}
          onDeleteTrack={async (trackId) => {
            await deleteTrack(trackId);
            await loadTracks();
            addToast('Doublon supprimé', 'success');
          }}
          onSelectTrack={(track) => {
            const dt = toDisplayTrack(track);
            setSelectedTrack(dt);
          }}
        />
      )}

      {/* Player + Tabs — flex row */}
      <div className="flex gap-3 items-stretch">

        {/* Left: Player (waveform) + TrackList directement dessous */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <PlayerCard
            track={selectedTrack}
            cuePoints={effectiveCuePoints}
            onImportClick={() => fileRef.current?.click()}
            onPrev={selectedTrack && displayTracks.findIndex((t: any) => t.id === selectedTrack.id) > 0 ? handlePrev : undefined}
            onNext={selectedTrack && displayTracks.findIndex((t: any) => t.id === selectedTrack.id) < displayTracks.length - 1 ? handleNext : undefined}
            onWaveformClick={handleWaveformClick}
            onTimeUpdate={(ms) => setCuePositionMs(ms)}
            playerRef={playerRef}
          />
          {/* TrackList sous le waveform */}
          <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] overflow-hidden flex flex-col" style={{ minHeight: 220 }}>
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
              onGridToggle={setGridView}
              onSearchChange={setSearchQuery}
              onSortChange={setSortBy}
              onFilterChange={(key, value) => setFilters(prev => ({ ...prev, [key]: value }))}
              onFilterReset={() => setFilters({ bpmMin: 0, bpmMax: 300, keyFilter: null, genreFilter: null, energyMin: 0, energyMax: 100, showAnalyzedOnly: false, showFavoritesOnly: false })}
              isLoading={loading}
              onImportClick={() => fileRef.current?.click()}
            />
          </div>
        </div>

        {/* Right: Tab panel vertical */}
        <div className="w-[300px] flex-shrink-0 bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] flex overflow-hidden">

          {/* Onglets verticaux */}
          <div className="w-14 flex-shrink-0 flex flex-col bg-[var(--bg-primary)] border-r border-[var(--border-subtle)] py-1 overflow-y-auto">
            {TABS.map(t => {
              const disabled = !selectedTrack;
              return (
                <button
                  key={t.id}
                  onClick={() => !disabled && setActiveTab(t.id)}
                  disabled={disabled}
                  className={`relative flex flex-col items-center gap-1 py-3 px-1 transition-all border-none ${
                    activeTab === t.id
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                      : disabled
                        ? 'text-[var(--text-muted)] opacity-30 cursor-not-allowed'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer'
                  }`}
                >
                  {activeTab === t.id && (
                    <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-blue-500 rounded-r" />
                  )}
                  <span className="text-base leading-none">{t.icon}</span>
                  <span className="text-[8px] font-semibold uppercase tracking-wider leading-none">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Contenu de l'onglet */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {activeTab === 'info' && (
              <InfoEditTab
                track={selectedRawTrack}
                onSave={async (trackId, data) => {
                  await updateTrack(trackId, data);
                  addToast('Infos sauvegardées', 'success');
                  await loadTracks();
                }}
              />
            )}
            {activeTab === 'cues' && (
              <div className="flex flex-col h-full">
                {selectedTrack && selectedTrack.id > 0 && (
                  <div className="px-3 pt-2 pb-1 border-b border-[var(--border-subtle)] flex-shrink-0">
                    <button
                      onClick={handleAutoCuePoints}
                      className="w-full px-2 py-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 text-purple-400 text-xs font-semibold hover:bg-purple-500/20 transition-colors cursor-pointer"
                    >
                      ✨ Auto-générer les cue points
                    </button>
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <CuesTab
                    track={selectedTrack}
                    cuePoints={effectiveCuePoints}
                    onCreateCue={handleCreateCue}
                    onDeleteCue={handleDeleteCue}
                    initialPositionMs={cuePositionMs}
                    onCueClick={(cue) => {
                      if (cue.cue_type === 'loop' && cue.end_position_ms != null) {
                        // Activate loop and seek to start
                        playerRef.current?.setLoop?.(cue.position_ms, cue.end_position_ms);
                      } else {
                        // Simple seek to cue position
                        playerRef.current?.seekTo?.(cue.position_ms);
                      }
                    }}
                  />
                </div>
              </div>
            )}
            {activeTab === 'stems' && <StemsTab track={selectedTrack} />}
            {activeTab === 'eq' && <EQTab playerRef={playerRef} />}
            {activeTab === 'fx' && <FXTab />}
            {activeTab === 'mix' && <MixTab track={selectedRawTrack} tracks={rawTracksForTabs} />}
            {activeTab === 'notes' && (
              <div className="flex flex-col h-full p-3 gap-2">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">Notes de session</div>
                <textarea
                  value={sessionNotes}
                  onChange={e => {
                    const v = e.target.value;
                    setSessionNotes(v);
                    try { localStorage.setItem('cueforge_session_notes', v); } catch {}
                  }}
                  placeholder="Tes notes, idées, setlist, observations…"
                  className="flex-1 min-h-[200px] p-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-blue-500 resize-none leading-relaxed"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setSessionNotes(''); try { localStorage.removeItem('cueforge_session_notes'); } catch {} }}
                    className="px-2 py-1 rounded border border-[var(--border-default)] text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                  >
                    Effacer
                  </button>
                  <button
                    onClick={() => {
                      const blob = new Blob([sessionNotes], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = 'notes-session.txt'; a.click();
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
        </div>

      </div>


      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".mp3,.wav,.flac,.aac,.ogg,.m4a,.aif"
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

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-lg overflow-hidden"
          style={{left: `${contextMenu.x}px`, top: `${contextMenu.y}px`}}
        >
          <button
            onClick={() => {
              handleReanalyzeTrack(contextMenu.trackId);
            }}
            className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2"
          >
            <RefreshCw size={14} /> Analyze
          </button>
          <button
            onClick={() => handleExportRekordbox(contextMenu.trackId)}
            className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2"
          >
            <Download size={14} /> Export Rekordbox XML
          </button>
          <button
            onClick={() => handleExportCSV(contextMenu.trackId)}
            className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2"
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            onClick={() => handleExportTXT(contextMenu.trackId)}
            className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2"
          >
            <Download size={14} /> Export TXT
          </button>
          {playlists.length > 0 && (
            <div className="border-t border-[var(--border-subtle)]">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase">Ajouter à playlist</div>
              {playlists.slice(0, 5).map(pl => (
                <button
                  key={pl.id}
                  onClick={async () => {
                    try {
                      await addTracksToPlaylist(pl.id, [contextMenu.trackId]);
                      addToast(`Ajouté à "${pl.name}"`, 'success');
                      setContextMenu(null);
                    } catch { addToast('Erreur ajout playlist', 'error'); }
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2"
                >
                  <Copy size={12} /> {pl.name}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => handleDeleteTrack(contextMenu.trackId)}
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
