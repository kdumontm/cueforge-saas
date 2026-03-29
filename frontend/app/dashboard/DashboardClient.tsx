// @ts-nocheck
'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Upload, Music2, Loader2, CheckCircle2, XCircle, Download, Trash2, Clock,
  Activity, Hash, Disc3, ChevronDown, ChevronUp, ExternalLink, User, Tag,
  Calendar, AlbumIcon, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Search, MoreVertical, Zap, Wand2, Type, Disc, RefreshCw, Star, Filter,
  Grid3X3, List as ListIcon, Check, X, Music, Headphones, ArrowUpDown, Folder,
  ZoomIn, ZoomOut, CheckSquare, Square, AlertTriangle, Sparkles, Image
, SlidersHorizontal, ListMusic, Copy, BarChart3, Compass, FolderSearch, Lightbulb, PenSquare, LayoutGrid, ChevronLeft, ChevronRight, Palette, Eye, Layers, GitBranch, RotateCcw, Settings, Shield, Lock, Unlock, Crown} from 'lucide-react';
import { uploadTrack, analyzeTrack, pollTrackUntilDone, exportRekordbox, listTracks, deleteTrack, getTrack, createCuePoint, deleteCuePoint, getTrackCuePoints, getCurrentUser } from '@/lib/api';
import type { Track, CuePoint } from '@/types';
import TrackOrganizer from '@/components/TrackOrganizer';
import { CUE_COLORS as CUE_COLOR_MAP } from '@/types';

// âÂÂâÂÂ Constants âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
const CAMELOT_WHEEL: Record<string, string> = {
  'C': '8B', 'Am': '8A', 'G': '9B', 'Em': '9A', 'D': '10B', 'Bm': '10A',
  'A': '11B', 'F#m': '11A', 'E': '12B', 'C#m': '12A', 'B': '1B', 'G#m': '1A',
  'F#': '2B', 'Ebm': '2A', 'Db': '3B', 'Bbm': '3A', 'Ab': '4B', 'Fm': '4A',
  'Eb': '5B', 'Cm': '5A', 'Bb': '6B', 'Gm': '6A', 'F': '7B', 'Dm': '7A',
  'C#': '3B', 'D#m': '2A', 'G#': '4B', 'A#': '6B', 'D#': '5B',
};

function toCamelot(key: string | null | undefined): string {
  if (!key) return '\u2014';
  return CAMELOT_WHEEL[key] || key;
}

// Harmonic mixing: compatible Camelot keys (same, +/-1, relative major/minor)
function getCompatibleKeys(camelotKey) {
  if (!camelotKey) return [];
  const match = camelotKey.match(/(\d+)([AB])/);
  if (!match) return [];
  const num = parseInt(match[1]);
  const letter = match[2];
  const other = letter === 'A' ? 'B' : 'A';
  return [
    camelotKey,
    num + other,                              // relative major/minor
    ((num % 12) + 1) + letter,                // +1 semitone
    ((num - 2 + 12) % 12 + 1) + letter,      // -1 semitone
  ];
}


function msToTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function energyToRating(energy: number | null | undefined): string {
  if (energy == null) return '\u2014';
  return String(Math.min(10, Math.max(1, Math.round(energy * 10))));
}

const CUE_TYPE_COLORS: Record<string, string> = {
  hot_cue: '#e11d48', loop: '#0891b2', fade_in: '#16a34a', fade_out: '#ea580c',
  load: '#ca8a04', phrase: '#2563eb', drop: '#e11d48', section: '#7c3aed',
};

// ââ Camelot Wheel System (Harmonic Mixing) ââââââââââââââââââââââââââââââââ
const CAMELOT_MAP: Record<string, string> = {
  'C': '8B', 'Cm': '5A', 'C#': '3B', 'C#m': '12A',
  'D': '10B', 'Dm': '7A', 'D#': '5B', 'D#m': '2A',
  'E': '12B', 'Em': '9A', 'F': '7B', 'Fm': '4A',
  'F#': '2B', 'F#m': '11A', 'G': '9B', 'Gm': '6A',
  'G#': '4B', 'G#m': '1A', 'A': '11B', 'Am': '8A',
  'A#': '6B', 'A#m': '3A', 'B': '1B', 'Bm': '10A',
  'Db': '3B', 'Dbm': '12A', 'Eb': '5B', 'Ebm': '2A',
  'Gb': '2B', 'Gbm': '11A', 'Ab': '4B', 'Abm': '1A',
  'Bb': '6B', 'Bbm': '3A',
};

function keyCamelot(key: string): string {
  return CAMELOT_MAP[key] || '';
}


function mixScore(key1: string, bpm1: number, key2: string, bpm2: number) {
  const bpmDiff = Math.abs(bpm1 - bpm2);
  let bpmS = bpmDiff <= 0.5 ? 50 : bpmDiff <= 2 ? 45 : bpmDiff <= 5 ? 35 : Math.max(0, 25 - bpmDiff);
  const c1 = CAMELOT_MAP[key1] || '', c2 = CAMELOT_MAP[key2] || '';
  let keyS = 25;
  if (c1 && c2) {
    if (c1 === c2) keyS = 50;
    else {
      const n1 = parseInt(c1), l1 = c1.slice(-1), n2 = parseInt(c2), l2 = c2.slice(-1);
      if (l1 === l2) { const d = Math.min(Math.abs(n1 - n2), 12 - Math.abs(n1 - n2)); keyS = d === 1 ? 45 : d === 2 ? 30 : 15; }
      else if (n1 === n2) keyS = 40;
      else keyS = 15;
    }
  }
  const total = bpmS + keyS;
  return { total, verdict: total >= 90 ? 'Perfect' : total >= 75 ? 'Great' : total >= 60 ? 'Good' : total >= 40 ? 'OK' : 'Risky' };
}

// ââ BPM Tap Tempo utility âââââââââââââââââââââââââââââââââââââââââââââââââ
const tapTimesRef = { current: [] as number[] };


// ââ RGB DJ Waveform: Frequency-band spectral analysis (Rekordbox-style) ââ
async function filterBand(buf: AudioBuffer, type: BiquadFilterType, freq: number, freq2?: number): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, buf.length, buf.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (freq2) {
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = freq; hp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq2; lp.Q.value = 0.7;
    src.connect(hp).connect(lp).connect(ctx.destination);
  } else {
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.7;
    src.connect(f).connect(ctx.destination);
  }
  src.start(0);
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

async function computeRGBWaveform(buf: AudioBuffer, numBars = 1200): Promise<{r:number,g:number,b:number}[]> {
  const [lowBand, midBand, highBand] = await Promise.all([
    filterBand(buf, 'lowpass', 200),
    filterBand(buf, 'bandpass', 200, 4000),
    filterBand(buf, 'highpass', 4000),
  ]);
  const segLen = Math.floor(buf.length / numBars);
  const rawColors: {lo:number,mi:number,hi:number}[] = [];
  let maxLo = 0, maxMi = 0, maxHi = 0;
  for (let i = 0; i < numBars; i++) {
    const s = i * segLen, e = Math.min(s + segLen, buf.length);
    let le = 0, me = 0, he = 0;
    for (let j = s; j < e; j++) { le += lowBand[j]*lowBand[j]; me += midBand[j]*midBand[j]; he += highBand[j]*highBand[j]; }
    const n = e - s || 1;
    le = Math.sqrt(le/n); me = Math.sqrt(me/n); he = Math.sqrt(he/n);
    maxLo = Math.max(maxLo, le); maxMi = Math.max(maxMi, me); maxHi = Math.max(maxHi, he);
    rawColors.push({ lo: le, mi: me, hi: he });
  }
  return rawColors.map(c => {
    const lo = c.lo / (maxLo || 1);
    const mi = c.mi / (maxMi || 1);
    const hi = c.hi / (maxHi || 1);
    const r = Math.min(255, Math.floor(lo * 220 + mi * 60));
    const g = Math.min(255, Math.floor(mi * 200 + hi * 50 + lo * 25));
    const b = Math.min(255, Math.floor(hi * 240 + mi * 30));
    return { r: Math.max(25, r), g: Math.max(15, g), b: Math.max(35, b) };
  });
}

// âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
// MAIN DASHBOARD
// âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
export default function DashboardPage() {
  // âÂÂâÂÂ State âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [tracksLoading, setTracksLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [toasts, setToasts] = useState<{id: number; msg: string; type: 'success' | 'error' | 'info'}[]>([]);
  const toastIdRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{current: number; total: number} | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'bpm' | 'key' | 'title' | 'energy' | 'genre' | 'duration'>('date');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; track: Track } | null>(null);
  const [metadataPanel, setMetadataPanel] = useState<Track | null>(null);
  const [metadataSuggestions, setMetadataSuggestions] = useState<Record<string, string> | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [organizerTrack, setOrganizerTrack] = useState<Track | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [waveformReady, setWaveformReady] = useState(false);
  // ââ New feature states ââ
  const [loopIn, setLoopIn] = useState<number | null>(null);
  const [loopOut, setLoopOut] = useState<number | null>(null);
  const [loopActive, setLoopActive] = useState(false);

  // Sync loop refs for timeupdate callback
  // ── User & plan feature states (must be before callbacks that reference them) ──
  const [currentUser, setCurrentUser] = useState<{id:number;email:string;name?:string;subscription_plan:string;is_admin:boolean;tracks_today:number}|null>(null);
  const [planFeatures, setPlanFeatures] = useState<Record<string, Record<string, boolean>>>({});
  const [featureLabels, setFeatureLabels] = useState<Record<string, string>>({});

  // ── Fetch current user & plan features on mount ──
  useEffect(() => {
    const fetchUserAndFeatures = async () => {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
        // Fetch plan features matrix
        const token = localStorage.getItem('cueforge_token');
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
        const res = await fetch(apiBase + '/admin/plan-features', { headers: { 'Authorization': 'Bearer ' + token } });
        if (res.ok) {
          const data = await res.json();
          setPlanFeatures(data.features || {});
          setFeatureLabels(data.feature_labels || {});
        }
      } catch (e) { console.error('Failed to fetch user/features:', e); }
    };
    fetchUserAndFeatures();
  }, []);

  // ── Helper: check if feature is enabled for current user's plan ──
  const isFeatureEnabled = useCallback((featureName: string) => {
    if (!currentUser) return true; // default allow while loading
    const plan = currentUser.subscription_plan || 'free';
    return planFeatures[plan]?.[featureName] ?? true;
  }, [currentUser, planFeatures]);

  // ── Toggle plan feature (admin only) ──
  const togglePlanFeature = useCallback(async (planName: string, featureName: string, enabled: boolean) => {
    try {
      const token = localStorage.getItem('cueforge_token');
      if (!token) return;
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      const res = await fetch(apiBase + '/admin/plan-features/' + planName + '/' + featureName, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ is_enabled: enabled })
      });
      if (res.ok) {
        setPlanFeatures(prev => ({ ...prev, [planName]: { ...prev[planName], [featureName]: enabled } }));
      }
    } catch (e) { console.error('Failed to toggle feature:', e); }
  }, []);

  // ── Reset plan features to defaults (admin only) ──
  const resetPlanFeatures = useCallback(async () => {
    try {
      const token = localStorage.getItem('cueforge_token');
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      const res = await fetch(apiBase + '/admin/plan-features/reset', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        const data = await res.json();
        setPlanFeatures(data.features || {});
        setFeatureLabels(data.feature_labels || {});
      }
    } catch (e) { console.error('Failed to reset features:', e); }
  }, []);

  useEffect(() => { loopActiveRef.current = loopActive; }, [loopActive]);
  useEffect(() => { loopInRef.current = loopIn; }, [loopIn]);
  useEffect(() => { loopOutRef.current = loopOut; }, [loopOut]);

  // Reset loop when track changes
  useEffect(() => {
    setLoopIn(null);
    setLoopOut(null);
    setLoopActive(false);
    if (loopRegionRef.current) { try { loopRegionRef.current.remove(); } catch {} loopRegionRef.current = null; }
  }, [selectedTrack]);
  const [showAddCue, setShowAddCue] = useState(false);
  const [newCueName, setNewCueName] = useState('');
  const [newCuePos, setNewCuePos] = useState('');
  const [newCueType, setNewCueType] = useState('hot_cue');
  const [newCueColor, setNewCueColor] = useState('blue');
  const [showMixPanel, setShowMixPanel] = useState(false);
  const [filterBpmMin, setFilterBpmMin] = useState<number>(0);
  const [filterBpmMax, setFilterBpmMax] = useState<number>(999);
  const [filterEnergyMin, setFilterEnergyMin] = useState<number>(0);
  const [filterEnergyMax, setFilterEnergyMax] = useState<number>(100);
  const [filterKey, setFilterKey] = useState<string>('');
  const [showCompatibleOnly, setShowCompatibleOnly] = useState(false);
  const [bpmTapTimes, setBpmTapTimes] = useState<number[]>([]);
  const [bpmTapResult, setBpmTapResult] = useState<number | null>(null);
  const [showBpmTap, setShowBpmTap] = useState(false);
  const [playHistory, setPlayHistory] = useState<{trackId: number; timestamp: number}[]>([]);
  const [mixLog, setMixLog] = useState<{fromId: number; toId: number; score: number; timestamp: number}[]>([]);
  const [filterGenre, setFilterGenre] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const loopRegionRef = useRef<any>(null);
  const [waveformZoom, setWaveformZoom] = useState<number>(1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Toast notification system ──
  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev.slice(-4), { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // ── Column header sort toggle ──
  const handleHeaderSort = useCallback((col: typeof sortBy) => {
    if (sortBy === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
    else { setSortBy(col); setSortDir('asc'); }
  }, [sortBy]);

  // ── Drag & Drop Upload ──
  const dragCountRef = useRef(0);
  const lastClickedIdxRef = useRef<number>(-1);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewingTrackId, setPreviewingTrackId] = useState<number | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showBulkGenre, setShowBulkGenre] = useState(false);
  const [bulkGenreValue, setBulkGenreValue] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Column filters
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [colFilterTitle, setColFilterTitle] = useState('');
  const [colFilterArtist, setColFilterArtist] = useState('');
  const [colFilterGenre, setColFilterGenre] = useState('');
  const [colFilterKey, setColFilterKey] = useState('');
  const [colFilterBpmMin, setColFilterBpmMin] = useState('');
  const [colFilterBpmMax, setColFilterBpmMax] = useState('');
  const [colFilterEnergyMin, setColFilterEnergyMin] = useState('');
  const [colFilterEnergyMax, setColFilterEnergyMax] = useState('');
  // Column visibility
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({ artist: true, album: false, genre: true, bpm: true, key: true, energy: true, duration: true });
  const [showColSettings, setShowColSettings] = useState(false);

  useEffect(() => {
    try { const s = localStorage.getItem('cueforge_columns'); if (s) setVisibleCols(JSON.parse(s)); } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem('cueforge_columns', JSON.stringify(visibleCols));
  }, [visibleCols]);

  const gridTemplate = useMemo(() => {
    return ['28px', '2fr', visibleCols.artist ? '1.2fr' : '0px', visibleCols.album ? '1fr' : '0px', visibleCols.genre ? '0.8fr' : '0px', visibleCols.bpm ? '60px' : '0px', visibleCols.key ? '45px' : '0px', visibleCols.energy ? '45px' : '0px', visibleCols.duration ? '60px' : '0px', '50px', '30px'].join(' ');
  }, [visibleCols]);

  const toggleCol = (col: string) => setVisibleCols(prev => ({ ...prev, [col]: !prev[col] }));

  // Close column settings on outside click
  useEffect(() => {
    if (!showColSettings) return;
    const handler = () => setShowColSettings(false);
    document.addEventListener('click', handler);
      // Track play history and mix transitions
  const prevSelectedRef = useRef<any>(null);
  useEffect(() => {
    if (selectedTrack) {
      setPlayHistory(prev => [{trackId: selectedTrack.id, timestamp: Date.now()}, ...prev].slice(0, 50));
      if (prevSelectedRef.current && prevSelectedRef.current.id !== selectedTrack.id && prevSelectedRef.current.analysis?.key && selectedTrack.analysis?.key) {
        const score = mixScore(prevSelectedRef.current.analysis.key, prevSelectedRef.current.analysis.bpm || 0, selectedTrack.analysis.key, selectedTrack.analysis.bpm || 0);
        setMixLog(prev => [{fromId: prevSelectedRef.current.id, toId: selectedTrack.id, score: score.total, timestamp: Date.now()}, ...prev].slice(0, 100));
      }
      prevSelectedRef.current = selectedTrack;
    }
  }, [selectedTrack?.id]);

return () => document.removeEventListener('click', handler);
  }, [showColSettings]);

    // Dynamic CSS for hidden columns - only min-width:0 on cells in 0px tracks
  useEffect(() => {
    const style = document.createElement('style');
    const rules: string[] = [];
    const positions: Record<string, number> = { genre: 3, bpm: 4, key: 5, energy: 6, duration: 7 };
    Object.entries(positions).forEach(([col, pos]) => {
      if (!visibleCols[col as keyof typeof visibleCols]) {
        rules.push(`.track-grid > :nth-child(${pos}) { min-width: 0 !important; overflow: hidden !important; padding: 0 !important; }`);
      }
    });
    style.textContent = rules.join('\n');
    document.head.appendChild(style);
    return () => style.remove();
  }, [visibleCols]);

  const bulkUpdateGenre = async () => {
    if (!bulkGenreValue.trim() || selectedIds.size === 0) return;
    setBulkUpdating(true);
    const token = localStorage.getItem('cueforge_token');
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
    let updated = 0;
    for (const id of selectedIds) {
      try {
        const res = await fetch(apiBase + '/tracks/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ genre: bulkGenreValue.trim() }),
        });
        if (res.ok) {
          const data = await res.json();
          setTracks(prev => prev.map(t => t.id === data.id ? data : t));
          updated++;
        }
      } catch {}
    }
    setBulkUpdating(false);
    setShowBulkGenre(false);
    setBulkGenreValue('');
    showToast(updated + ' morceau' + (updated > 1 ? 'x' : '') + ' mis à jour', 'success');
  };


  // Load favorites from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cueforge_favorites');
      if (saved) setFavoriteIds(new Set(JSON.parse(saved)));
    } catch {}
  }, []);

  // Save favorites to localStorage
  useEffect(() => {
    if (favoriteIds.size > 0) {
      localStorage.setItem('cueforge_favorites', JSON.stringify([...favoriteIds]));
    } else {
      localStorage.removeItem('cueforge_favorites');
    }
  }, [favoriteIds]);

  const toggleFavorite = (id: number) => {
    setFavoriteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  
  // Cleanup audio preview on unmount
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCountRef.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current === 0) setIsDragging(false);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    dragCountRef.current = 0;
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav|flac|aac|ogg|m4a|aif|aiff)$/i));
    if (files.length === 0) { showToast('Aucun fichier audio d\u00e9tect\u00e9', 'error'); return; }
    setUploading(true);
    showToast(`Upload de ${files.length} fichier(s)...`, 'info');
    try {
      setUploadProgress({current: 0, total: files.length});
      for (let i = 0; i < files.length; i++) { 
        setUploadProgress({current: i + 1, total: files.length});
        await uploadTrack(files[i]); 
      }
      setUploadProgress(null);
      showToast(`${files.length} fichier(s) upload\u00e9(s)`, 'success');
      loadTracks();
    } catch (err) { showToast('Erreur lors de l\'upload', 'error'); }
    setUploading(false);
  }, [showToast, loadTracks]);
  const [showBeatGrid, setShowBeatGrid] = useState(false);
  const [trackNotes, setTrackNotes] = useState<Record<number, string>>({});
  const [trackRatings, setTrackRatings] = useState<Record<number, number>>({});
  const [trackColors, setTrackColors] = useState<Record<number, string>>({});
  const [setLists, setSetLists] = useState<{name: string; trackIds: number[]}[]>([]);
  const [activeSetList, setActiveSetList] = useState<number>(-1);
  const [newSetListName, setNewSetListName] = useState('');
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [tapBpm, setTapBpm] = useState<number>(0);
  const [filterColor, setFilterColor] = useState<string | null>(null);
  const [filterRating, setFilterRating] = useState<number>(0);
  const [bpmMin, setBpmMin] = useState<number>(0);
  const [bpmMax, setBpmMax] = useState<number>(300);
  const [transitionNotes, setTransitionNotes] = useState<Record<string, string>>({});
  const [showNotes, setShowNotes] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showRemainingTime, setShowRemainingTime] = useState(false);
  const [waveformTheme, setWaveformTheme] = useState<string>('neon');
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [eqLow, setEqLow] = useState(50);
  const [eqMid, setEqMid] = useState(50);
  const [eqHigh, setEqHigh] = useState(50);
  const [activeFx, setActiveFx] = useState('');
  const [fxWet, setFxWet] = useState(30);
  const [masterGain, setMasterGain] = useState(80);
  const [crossfader, setCrossfader] = useState(50);
  const [pitchShift, setPitchShift] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [djHistory, setDjHistory] = useState([]);
  const [playlists, setPlaylists] = useState({});
  const [currentPlaylist, setCurrentPlaylist] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');

  // Smart Playlist & Advanced Features State
  const [showSmartPlaylist, setShowSmartPlaylist] = useState(false);
  const [smartRules, setSmartRules] = useState([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [showStats, setShowStats] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState('rekordbox');
  const [batchSelected, setBatchSelected] = useState([]);
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchField, setBatchField] = useState('genre');
  const [batchValue, setBatchValue] = useState('');
  const [showCamelotWheel, setShowCamelotWheel] = useState(false);
  const [selectedWheelKey, setSelectedWheelKey] = useState<string | null>(null);
  const [showPlanAdmin, setShowPlanAdmin] = useState(false);
  const [showWatchFolder, setShowWatchFolder] = useState(false);
  const [watchFolderPath, setWatchFolderPath] = useState('');
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineEditField, setInlineEditField] = useState('');
  const [inlineEditValue, setInlineEditValue] = useState('');
  const [showMixSuggestions, setShowMixSuggestions] = useState(false);
  const [showAnalyzed, setShowAnalyzed] = useState(false);
  const [selectedForMix, setSelectedForMix] = useState(null);
  const [gridView, setGridView] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState('cues');
  const [rightPanelExpanded, setRightPanelExpanded] = useState(false);
  const [showModuleView, setShowModuleView] = useState(false);
  const [cueColors, setCueColors] = useState<Record<number, string>>({});
  const [colorPickerCue, setColorPickerCue] = useState<number | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState<{x: number, y: number}>({x: 0, y: 0});

  // Rekordbox-style cue colors
  const WAVEFORM_THEMES: Record<string, { wave: string; progress: string; label: string; cursor: string; gradient?: boolean }> = {
    neon: { wave: '#7c3aed', progress: 'rgba(124,58,237,0.45)', cursor: '#ffffff', label: 'Néon', gradient: true },
    sunset: { wave: '#f97316', progress: 'rgba(249,115,22,0.45)', cursor: '#ffffff', label: 'Sunset', gradient: true },
    ocean: { wave: '#06b6d4', progress: 'rgba(6,182,212,0.45)', cursor: '#ffffff', label: 'Océan', gradient: true },
    forest: { wave: '#22c55e', progress: 'rgba(34,197,94,0.45)', cursor: '#ffffff', label: 'Forêt', gradient: true },
    fire: { wave: '#ef4444', progress: 'rgba(239,68,68,0.45)', cursor: '#ffffff', label: 'Feu', gradient: true },
    aurora: { wave: '#a855f7', progress: 'rgba(168,85,247,0.45)', cursor: '#ffffff', label: 'Aurora', gradient: true },
  };

  const REKORDBOX_COLORS = [
    { name: "Red", hex: "#E13535" },
    { name: "Orange", hex: "#FF8C00" },
    { name: "Yellow", hex: "#E2D420" },
    { name: "Green", hex: "#1DB954" },
    { name: "Aqua", hex: "#21C8DE" },
    { name: "Blue", hex: "#2B7FFF" },
    { name: "Purple", hex: "#A855F7" },
    { name: "Pink", hex: "#FF69B4" },
  ];

  // Default cue colors by index (Rekordbox convention)
  const getDefaultCueColor = (index: number) => {
    const defaults = ["#E13535", "#FF8C00", "#E2D420", "#1DB954", "#21C8DE", "#2B7FFF", "#A855F7", "#FF69B4"];
    return defaults[index % defaults.length];
  };

  // ── Re-analyze a track ──
  const reanalyzeTrack = async (trackId) => {
    try {
      const resp = await fetch(API + '/tracks/' + trackId + '/analyze', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (resp.ok) {
        // Update track status locally
        setTracks(prev => prev.map(t => t.id === trackId ? {...t, status: 'analyzing'} : t));
      }
    } catch(e) { console.error('Re-analyze failed:', e); }
  };

  const getCueColor = (cueId: number, index: number) => {
    return cueColors[cueId] || getDefaultCueColor(index);
  };
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<string>('eq');

  const waveformRef = useRef<HTMLDivElement>(null);
  const [showEditMeta, setShowEditMeta] = useState(false);
  const [editForm, setEditForm] = useState({title:'',artist:'',album:'',genre:'',year:0,comment:''});
  const [savingMeta, setSavingMeta] = useState(false);

  const openEditMeta = () => {
    if (!selectedTrack) return;
    setEditForm({
      title: selectedTrack.title || selectedTrack.original_filename || '',
      artist: selectedTrack.artist || '',
      album: selectedTrack.album || '',
      genre: selectedTrack.genre || '',
      year: selectedTrack.year || 0,
      comment: selectedTrack.comment || '',
    });
    setShowEditMeta(true);
  };

  const saveMetadata = async () => {
    if (!selectedTrack || !token) return;
    setSavingMeta(true);
    try {
      const body = {};
      if (editForm.title) body.title = editForm.title;
      if (editForm.artist) body.artist = editForm.artist;
      if (editForm.album) body.album = editForm.album;
      if (editForm.genre) body.genre = editForm.genre;
      if (editForm.year) body.year = editForm.year;
      if (editForm.comment) body.comment = editForm.comment;
      const res = await fetch(API + '/tracks/' + selectedTrack.id, {
        method: 'PATCH',
        headers: {'Content-Type':'application/json','Authorization':'Bearer '+token},
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const updated = await res.json();
        setTracks((prev) => prev.map((t) => t.id === updated.id ? updated : t));
        setSelectedTrack(updated);
        setShowEditMeta(false);
      }
    } catch(e) { console.error(e); }
    setSavingMeta(false);
  };

  const exportRekordbox = async (trackId) => {
    if (!token) return;
    try {
      const res = await fetch(API + '/export/' + trackId + '/rekordbox', {
        headers: {'Authorization':'Bearer '+token},
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (selectedTrack?.title || 'track') + '_rekordbox.xml';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch(e) { console.error(e); }
  };

  const exportAllRekordbox = async () => {
    if (!token) return;
    try {
      const res = await fetch(API + '/export/rekordbox/all', {
        headers: {'Authorization':'Bearer '+token},
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'CueForge_Library_rekordbox.xml';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch(e) { console.error(e); }
  }

;


  const wavesurferRef = useRef<any>(null);
  const loopActiveRef = useRef(false);
  const loopInRef = useRef<number | null>(null);
  const loopOutRef = useRef<number | null>(null);
  const regionsRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const spectralColorsRef = useRef<{r:number,g:number,b:number}[] | null>(null);
  // ── EQ / FX Web Audio API ──
  const audioCtxRef = useRef<AudioContext | null>(null);
  const eqLowRef = useRef<BiquadFilterNode | null>(null);
  const eqMidRef = useRef<BiquadFilterNode | null>(null);
  const eqHighRef = useRef<BiquadFilterNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const [eqValues, setEqValues] = useState({ low: 0, mid: 0, high: 0 });
  const [fxParams, setFxParams] = useState<Record<string, number>>({ reverb: 0, delay: 0, filterLP: 20000, filterHP: 20, flanger: 0, phaser: 0, distortion: 0, compressor: 0 });
  const [eqConnected, setEqConnected] = useState(false);


  // âÂÂâÂÂ Load tracks on mount âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
  useEffect(() => { loadTracks(); }, []);

  async function loadTracks() {
    try {
      setTracksLoading(true);
      const data = await listTracks(1, 100);
      setTracks(data.tracks);
    } catch {} finally { setTracksLoading(false); }
  }

  // âÂÂâÂÂ Wavesurfer init (ALWAYS render the div, never unmount it) âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
  useEffect(() => {
    if (typeof window === 'undefined' || !waveformRef.current) return;
    let ws: any = null;

    async function initWavesurfer() {
      const WaveSurfer = (await import('wavesurfer.js')).default;
      const RegionsPlugin = (await import('wavesurfer.js/dist/plugins/regions.esm.js')).default;

      const regions = RegionsPlugin.create();
      regionsRef.current = regions;

      ws = WaveSurfer.create({
        container: waveformRef.current!,
        cursorColor: '#ffffff',
        cursorWidth: 2,
        height: 128,
        normalize: true,
        fillParent: true,
        minPxPerSec: 1,
        autoScroll: true,
        autoCenter: true,
        interact: true,
        dragToSeek: true,
        hideScrollbar: false,
        barWidth: 0,
        barGap: 0,
        barRadius: 0,
        plugins: [regions],
        waveColor: WAVEFORM_THEMES[waveformTheme].wave,
        progressColor: WAVEFORM_THEMES[waveformTheme].progress,
        renderFunction: (peaks: any, ctx: CanvasRenderingContext2D) => {
            const colors = spectralColorsRef.current;
            const { width, height } = ctx.canvas;
            const ch = peaks[0] as Float32Array;
            const mid = height / 2;
            ctx.clearRect(0, 0, width, height);
            // Draw center line
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, mid);
            ctx.lineTo(width, mid);
            ctx.stroke();
            const totalSamples = ch.length / 2;
            // Draw filled waveform - Lexicon style (1px per column, mirrored)
            for (let x = 0; x < width; x++) {
              const sampleIdx = Math.min(Math.floor((x / width) * totalSamples) * 2, ch.length - 2);
              // Use max of nearby samples for smoother look
              let amp = 0;
              for (let s = -1; s <= 1; s++) {
                const si = Math.max(0, Math.min(ch.length - 2, sampleIdx + s * 2));
                amp = Math.max(amp, Math.abs(ch[si] || 0), Math.abs(ch[si + 1] || 0));
              }
              const barH = Math.max(1, amp * mid * 0.92);
              // Color from spectral data
              const ci = colors ? Math.min(Math.floor((x / width) * colors.length), colors.length - 1) : -1;
              const c = ci >= 0 && colors ? colors[ci] : { r: 124, g: 58, b: 237 };
              const brightness = 0.55 + amp * 0.45;
              const r = Math.min(255, Math.round(c.r * brightness));
              const g = Math.min(255, Math.round(c.g * brightness));
              const b = Math.min(255, Math.round(c.b * brightness));
              // Top half (main waveform)
              ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
              ctx.fillRect(x, mid - barH, 1, barH);
              // Bottom half (mirror, dimmer)
              ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.45)';
              ctx.fillRect(x, mid, 1, barH * 0.75);
            }
          },
        })

      ws.on('play', () => setIsPlaying(true));
      ws.on('pause', () => setIsPlaying(false));
      ws.on('timeupdate', (t: number) => { setCurrentTime(t); if (loopActiveRef.current && typeof loopInRef.current === 'number' && typeof loopOutRef.current === 'number' && loopInRef.current < loopOutRef.current && t >= loopOutRef.current) { const dur = ws.getDuration(); if (dur > 0) ws.seekTo(loopInRef.current / dur); } });
      ws.on('ready', () => {
        setDuration(ws.getDuration());
        setWaveformReady(true);
      });

      // RGB spectral analysis: compute frequency colors on decode
      ws.on('decode', () => {
        const audioData = ws.getDecodedData();
        if (audioData) {
          computeRGBWaveform(audioData).then(colors => {
            spectralColorsRef.current = colors;
            try { ws.drawBuffer(); } catch {}
          }).catch(() => {});
        }
      });

      wavesurferRef.current = ws;
    }

    initWavesurfer();
    return () => { if (ws) ws.destroy(); };
  }, []);



  // ── EQ Web Audio API Setup ──
  const connectEQ = useCallback(() => {
    const ws = wavesurferRef.current;
    if (!ws || eqConnected) return;
    try {
      const media = ws.getMediaElement();
      if (!media) return;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaElementSource(media);
      sourceNodeRef.current = source;
      const low = ctx.createBiquadFilter();
      low.type = 'lowshelf'; low.frequency.value = 320; low.gain.value = 0;
      eqLowRef.current = low;
      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.5; mid.gain.value = 0;
      eqMidRef.current = mid;
      const high = ctx.createBiquadFilter();
      high.type = 'highshelf'; high.frequency.value = 3200; high.gain.value = 0;
      eqHighRef.current = high;
      source.connect(low).connect(mid).connect(high).connect(ctx.destination);
      setEqConnected(true);
    } catch(e) { console.warn('EQ connect failed:', e); }
  }, [eqConnected]);

  const updateEQ = useCallback((band: 'low' | 'mid' | 'high', value: number) => {
    setEqValues(prev => ({ ...prev, [band]: value }));
    const ref = band === 'low' ? eqLowRef : band === 'mid' ? eqMidRef : eqHighRef;
    if (ref.current) ref.current.gain.value = value;
  }, []);

  // âÂÂâÂÂ Zoom handler âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
  function handleZoom(direction: 'in' | 'out') {
      if (!wavesurferRef.current) return;
      const ws = wavesurferRef.current;
      let newZoom = zoomLevel;
      if (direction === 'in') {
        newZoom = Math.min(zoomLevel * 1.5, 500);
      } else {
        newZoom = Math.max(zoomLevel / 1.5, 1);
      }
      setZoomLevel(newZoom);
      try { ws.zoom(newZoom); } catch {}
      ws.options.autoScroll = newZoom > 1;
      ws.options.autoCenter = newZoom > 1;
    }

  // Wheel zoom listener on waveform
    useEffect(() => {
      const container = waveformRef.current;
      if (!container) return;
      const handler = (e: WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const ws = wavesurferRef.current;
        if (!ws) return;
        const dir = e.deltaY < 0 ? 'in' : 'out';
        handleZoom(dir);
      };
      container.addEventListener('wheel', handler, { passive: false });
      return () => container.removeEventListener('wheel', handler);
    }, [zoomLevel]);

    // âÂÂâÂÂ Load track into waveform âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
  useEffect(() => {
    if (!selectedTrack || !wavesurferRef.current) return;
    const ws = wavesurferRef.current;
    const regions = regionsRef.current;

    setZoomLevel(1);
    setWaveformReady(false);
    try { ws.zoom(1); } catch {}

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
    const authToken = typeof window !== 'undefined' ? localStorage.getItem('cueforge_token') : '';
    const audioUrl = `${apiUrl}/tracks/${selectedTrack.id}/audio?token=${authToken}`;

    ws.load(audioUrl);
    ws.once('decode', () => {
      if (!regions) return;
      regions.clearRegions();

      selectedTrack.cue_points?.forEach((cue: CuePoint, i: number) => {
        const color = CUE_COLOR_MAP[cue.color as keyof typeof CUE_COLOR_MAP] || '#2563eb';
        if (cue.end_position_ms) {
          regions.addRegion({
            start: cue.position_ms / 1000,
            end: cue.end_position_ms / 1000,
            content: cue.name,
            color: color + '30',
            drag: false,
            resize: false,
          });
        } else {
          regions.addRegion({
            start: cue.position_ms / 1000,
            content: `${i + 1} ${cue.name}`,
            color: color + '90',
          });
        }
      });

      // Use sections for labeled cue markers instead of just drops
      selectedTrack.analysis?.sections?.forEach((sec: any) => {
        const sColors = { INTRO: 'rgba(59,130,246,0.35)', VERSE: 'rgba(34,197,94,0.35)', CHORUS: 'rgba(234,179,8,0.35)', BUILD: 'rgba(249,115,22,0.35)', DROP: 'rgba(239,68,68,0.35)', BREAK: 'rgba(6,182,212,0.35)', OUTRO: 'rgba(139,92,246,0.35)' } as Record<string, string>;
        regions.addRegion({
          start: sec.start,
          content: sec.label,
          color: sColors[sec.label] || 'rgba(107,114,128,0.35)',
        });
      });
      // Fallback: if no sections, use drop_positions
      if (!selectedTrack.analysis?.sections?.length && selectedTrack.analysis?.drop_positions?.length) {
        selectedTrack.analysis.drop_positions.forEach((ms: number, i: number) => {
          regions.addRegion({
            start: ms / 1000,
            content: 'DROP ' + (i + 1),
            color: 'rgba(239,68,68,0.35)',
          });
        });
      }
    });
  }, [selectedTrack, waveformTheme]);

  // âÂÂâÂÂ Keyboard shortcuts (Ctrl+A) âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        if (selectedIds.size === filtered.length) {
          setSelectedIds(new Set());
        } else {
          setSelectedIds(new Set(filtered.map(t => t.id)));
        }
      }
    
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcutsModal(p => !p);
      }
      // Space = play/pause
      const isInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
      if (e.key === ' ' && !isInput) {
        e.preventDefault();
        if (wavesurferRef.current) wavesurferRef.current.playPause();
      }
      // Arrow Up/Down = navigate tracks
      if (e.key === 'ArrowDown' && !isInput) {
        e.preventDefault();
        const idx = tracks.findIndex(t => t.id === selectedTrack?.id);
        if (idx < tracks.length - 1) setSelectedTrack(tracks[idx + 1]);
      }
      if (e.key === 'ArrowUp' && !isInput) {
        e.preventDefault();
        const idx = tracks.findIndex(t => t.id === selectedTrack?.id);
        if (idx > 0) setSelectedTrack(tracks[idx - 1]);
      }
      // 1-5 = rate selected track
      if (['1','2','3','4','5'].includes(e.key) && !isInput && selectedTrack) {
        const star = parseInt(e.key);
        setTrackRatings(prev => ({...prev, [selectedTrack.id]: prev[selectedTrack.id] === star ? 0 : star}));
      }
      // Escape = deselect
      if (e.key === 'Escape') {
        setShowShortcutsModal(false);
        setSelectedIds(new Set());
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // âÂÂâÂÂ Player controls âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
  function togglePlay() {
    if (!wavesurferRef.current) return;
    wavesurferRef.current.playPause();
  }
  function skipBack() {
    if (!wavesurferRef.current) return;
    wavesurferRef.current.skip(-5);
  }
  function skipForward() {
    if (!wavesurferRef.current) return;
    wavesurferRef.current.skip(5);
  }
  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (wavesurferRef.current) wavesurferRef.current.setVolume(next ? 0 : volume);
  }

  // âÂÂâÂÂ Multi-select toggle âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
  function toggleSelect(trackId: number, e: React.MouseEvent) {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (e.ctrlKey || e.metaKey) {
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
    } else {
      if (next.has(trackId) && next.size === 1) next.clear();
      else { next.clear(); next.add(trackId); }
    }
    setSelectedIds(next);
  }

  // âÂÂâÂÂ File handling âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
  async function handleFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (!file.name.match(/\.(mp3|wav|flac|aiff|aif|m4a|ogg)$/i)) {
        setError(`Format non supporté: ${file.name}`);
        continue;
      }
      setError('');
      setUploading(true);
      setBatchProgress(`Upload: ${file.name}...`);
      try {
        const uploaded = await uploadTrack(file);
        setBatchProgress('');
        setUploading(false);
        loadTracks();
        showToast('Track uploadé avec succès', 'success');
        if (!selectedTrack) setSelectedTrack(uploaded);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erreur inattendue');
        showToast('Erreur lors de l\'upload', 'error');
        setUploading(false);
        setBatchProgress('');
      }
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, []);

  // âÂÂâÂÂ Batch Analyze Audio (BPM, Key, Cues) âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
  async function batchAnalyzeAudio(trackIds: number[]) {
    if (trackIds.length === 0) return;
    setAnalyzing(true);
    let done = 0;
    for (const id of trackIds) {
      setBatchProgress(`Analyse audio ${done + 1}/${trackIds.length}...`);
      try {
        await analyzeTrack(id);
        await pollTrackUntilDone(id);
      } catch {}
      done++;
    }
    setBatchProgress('');
    setAnalyzing(false);
    loadTracks();
    // Refresh selected track if it was analyzed
    if (selectedTrack && trackIds.includes(selectedTrack.id)) {
      try {
        const fresh = await getTrack(selectedTrack.id);
        setSelectedTrack(fresh);
      } catch {}
    }
  }

  // âÂÂâÂÂ Batch Analyze Metadata (Spotify, Genre, Cover) âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
  async function batchAnalyzeMetadata(trackIds: number[]) {
    if (trackIds.length === 0) return;
    setAnalyzing(true);
    let done = 0;
    for (const id of trackIds) {
      setBatchProgress(`Recherche metadata ${done + 1}/${trackIds.length}...`);
      try {
        await analyzeTrack(id);
        await pollTrackUntilDone(id);
      } catch {}
      done++;
    }
    setBatchProgress('');
    setAnalyzing(false);
    loadTracks();
    if (selectedTrack && trackIds.includes(selectedTrack.id)) {
      try {
        const fresh = await getTrack(selectedTrack.id);
        setSelectedTrack(fresh);
      } catch {}
    }
  }

  // âÂÂâÂÂ Context menu handler âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
  async function handleCtxAction(action: string, track: Track) {
    setCtxMenu(null);
    switch (action) {
      case 'analyze':
        batchAnalyzeAudio([track.id]);
        break;
      case 'analyze_metadata':
        setMetadataPanel(track);
        setMetadataSuggestions(null);
        launchSpotifySearch(track);
        break;
      case 'cue_points':
        setAnalyzing(true);
        setBatchProgress('Génération des cue points...');
        try {
          await analyzeTrack(track.id);
          const done = await pollTrackUntilDone(track.id);
          setSelectedTrack(done);
          showToast('Analyse terminée', 'success');
          loadTracks();
        } catch {}
        setAnalyzing(false);
        setBatchProgress('');
        break;
      case 'organize':
        setOrganizerTrack(track);
        break;
      case 'export_rekordbox':
        try {
          const blob = await exportRekordbox(track.id);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `cueforge_${track.id}.xml`;
          a.click();
            showToast('Export Rekordbox XML téléchargé', 'success');
          URL.revokeObjectURL(url);
        } catch {}
        break;
      case 'delete':
        if (!confirm('Supprimer ce morceau ?')) return;
        try {
          await deleteTrack(track.id);
          if (selectedTrack?.id === track.id) setSelectedTrack(null);
          selectedIds.delete(track.id);
          setSelectedIds(new Set(selectedIds));
          showToast('Track supprimé', 'success');
          loadTracks();
        } catch {}
        break;
    }
  }

  // âÂÂâÂÂ Spotify search for metadata panel âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
  async function launchSpotifySearch(track: Track) {
    setMetadataLoading(true);
    setMetadataSuggestions(null);
    try {
      await analyzeTrack(track.id);
      const result = await pollTrackUntilDone(track.id);
      const suggestions: Record<string, string> = {};
      if (result.artist && result.artist !== track.artist) suggestions['artist'] = result.artist;
      if (result.title && result.title !== track.title) suggestions['title'] = result.title;
      if (result.album && result.album !== track.album) suggestions['album'] = result.album;
      if (result.genre && result.genre !== track.genre) suggestions['genre'] = result.genre;
      if (result.artwork_url) suggestions['artwork_url'] = result.artwork_url;
      if (result.spotify_url) suggestions['spotify_url'] = result.spotify_url;
      if (result.year && result.year !== track.year) suggestions['year'] = String(result.year);
      setMetadataSuggestions(suggestions);
      // Update the panel track with fresh data
      setMetadataPanel(result);
      loadTracks();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Recherche metadata échouée');
    }
    setMetadataLoading(false);
  }

  // âÂÂâÂÂ Filtered + sorted tracks âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
  const filtered = tracks
    .filter(t => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.original_filename.toLowerCase().includes(q) ||
        t.title?.toLowerCase().includes(q) ||
        t.artist?.toLowerCase().includes(q) ||
        t.genre?.toLowerCase().includes(q)
      );
    })
    .filter(t => !showFavoritesOnly || favoriteIds.has(t.id))
    .filter(t => {
      if (colFilterTitle && !(t.title || t.original_filename || '').toLowerCase().includes(colFilterTitle.toLowerCase())) return false;
      if (colFilterArtist && !(t.artist || '').toLowerCase().includes(colFilterArtist.toLowerCase())) return false;
      if (colFilterGenre && (t.genre || '') !== colFilterGenre) return false;
      if (colFilterKey && (t.analysis?.key || '') !== colFilterKey) return false;
      if (colFilterBpmMin && (t.analysis?.bpm || 0) < parseFloat(colFilterBpmMin)) return false;
      if (colFilterBpmMax && (t.analysis?.bpm || 999) > parseFloat(colFilterBpmMax)) return false;
      if (colFilterEnergyMin && ((t.analysis?.energy || 0) * 100) < parseFloat(colFilterEnergyMin)) return false;
      if (colFilterEnergyMax && ((t.analysis?.energy || 0) * 100) > parseFloat(colFilterEnergyMax)) return false;
      return true;
    })
    .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;
        switch (sortBy) {
          case 'bpm': return dir * ((a.analysis?.bpm || 0) - (b.analysis?.bpm || 0));
          case 'key': return dir * ((toCamelot(a.analysis?.key) || '').localeCompare(toCamelot(b.analysis?.key) || ''));
          case 'title': return dir * ((a.title || a.original_filename).localeCompare(b.title || b.original_filename)); case 'artist': return dir * ((a.artist || '').localeCompare(b.artist || '')); case 'album': return dir * ((a.album || '').localeCompare(b.album || ''));
          case 'energy': return dir * ((a.analysis?.energy || 0) - (b.analysis?.energy || 0));
          case 'genre': return dir * ((a.genre || '').localeCompare(b.genre || ''));
          case 'duration': return dir * ((a.analysis?.duration_ms || a.duration_ms || 0) - (b.analysis?.duration_ms || b.duration_ms || 0));
          default: return dir * (new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }
      })

  const isLoading = uploading || analyzing;
  const selectedCount = selectedIds.size;

  // âÂÂâÂÂ Context Menu Actions âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
  const CONTEXT_ACTIONS = [
    { label: 'Analyser Audio (BPM/Key/Cues)', icon: <Zap size={14} />, action: 'analyze' },
    { label: 'Rechercher Metadata (Spotify)', icon: <Sparkles size={14} />, action: 'analyze_metadata' },
    { label: 'Générer les Cue Points', icon: <Disc3 size={14} />, action: 'cue_points', separator: true },
    { label: 'Organiser (Catégorie/Tags)', icon: <Folder size={14} />, action: 'organize', separator: true },
    { label: 'Export Rekordbox XML', icon: <Download size={14} />, action: 'export_rekordbox' },
    { label: 'Supprimer', icon: <Trash2 size={14} />, action: 'delete', separator: true },
  ];

  // âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
  // RENDER
  // âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ

  // Computed: filtered + sorted tracks

  const filteredTracks = filtered.filter(t => {
    const bpm = t.analysis?.bpm || 0;
    if (filterBpmMin > 0 && bpm < filterBpmMin) return false;
    if (filterBpmMax < 999 && bpm > filterBpmMax) return false;
    if (filterKey && t.analysis?.key !== filterKey) return false;
    if (filterGenre && t.genre !== filterGenre) return false;
          const energy = Math.round((t.analysis?.energy || 0) * 100);
      if (filterEnergyMin > 0 && energy < filterEnergyMin) return false;
      if (filterEnergyMax < 100 && energy > filterEnergyMax) return false;
            if (filterColor && trackColors[t.id] !== filterColor) return false;
      if (filterRating > 0 && (trackRatings[t.id] || 0) < filterRating) return false;
      if (bpmMin > 0 && t.bpm < bpmMin) return false;
      if (bpmMax < 300 && t.bpm > bpmMax) return false;
          if (showCompatibleOnly && selectedTrack && selectedTrack.analysis?.key && t.id !== selectedTrack.id) {
      const selCamelot = toCamelot(selectedTrack.analysis.key);
      const trackCamelot = toCamelot(t.analysis?.key || '');
      if (selCamelot && trackCamelot && !getCompatibleKeys(selCamelot).includes(trackCamelot)) return false;
    }
  return true;
  });



  // Keyboard navigation for track list
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!filteredTracks.length) return;
      
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIdx = selectedTrack ? filteredTracks.findIndex(t => t.id === selectedTrack.id) : -1;
        let newIdx: number;
        if (e.key === 'ArrowDown') {
          newIdx = currentIdx < filteredTracks.length - 1 ? currentIdx + 1 : 0;
        } else {
          newIdx = currentIdx > 0 ? currentIdx - 1 : filteredTracks.length - 1;
        }
        setSelectedTrack(filteredTracks[newIdx]);
        // Auto-scroll to selected row
        setTimeout(() => {
          const row = document.querySelector(`[data-track-id="${filteredTracks[newIdx].id}"]`);
          row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 0);
      }
      // Space = play/pause
      if (e.key === ' ' && selectedTrack) {
        e.preventDefault();
        const audio = document.querySelector('audio');
        if (audio) { audio.paused ? audio.play() : audio.pause(); setIsPlaying(!audio.paused); }
      }
      // Delete = remove track
      if (e.key === 'Delete' && selectedTrack) {
        e.preventDefault();
        deleteTrack(selectedTrack.id).then(() => { loadTracks(); setSelectedTrack(null); showToast('Track supprimé', 'success'); });
      }
      // Ctrl+F = focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      // Escape = clear search / blur
      if (e.key === 'Escape') {
        if (searchQuery) { setSearchQuery(''); }
        (document.activeElement as HTMLElement)?.blur();
      
      // Q = Quick Mix (jump to best matching track)
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        if (selectedTrack && selectedTrack.analysis?.key && selectedTrack.analysis?.bpm) {
          let bestTrack = null;
          let bestScore = -1;
          filteredTracks.forEach(t => {
            if (t.id === selectedTrack.id || !t.analysis?.key || !t.analysis?.bpm) return;
            const score = mixScore(selectedTrack.analysis.key, selectedTrack.analysis.bpm, t.analysis.key, t.analysis.bpm);
            if (score.total > bestScore) { bestScore = score.total; bestTrack = t; }
          });
          if (bestTrack) { setSelectedTrack(bestTrack); }
        }
      }
      // T = Toggle BPM Tap tool
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setShowBpmTap(prev => !prev);
      }
      // C = Toggle compatible-only filter
      if (e.key === 'c' || e.key === 'C') {
        if (selectedTrack) {
          e.preventDefault();
          setShowCompatibleOnly(prev => !prev);
        }
      }
    }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTrack, filteredTracks]);

  const getTrackCompat = (t: any) => {
    if (!selectedTrack?.analysis?.bpm || !t?.analysis?.bpm) return null;
    return mixScore(
      selectedTrack.analysis.key || '', selectedTrack.analysis.bpm,
      t.analysis.key || '', t.analysis.bpm
    );
  };

  const sortedFilteredTracks = [...(typeof filteredTracks !== 'undefined' ? filteredTracks : [])].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'bpm') return dir * ((a.analysis?.bpm || 0) - (b.analysis?.bpm || 0));
    if (sortBy === 'key') return dir * ((a.analysis?.key || '').localeCompare(b.analysis?.key || ''));
    if (sortBy === 'title') return dir * ((a.title || '').localeCompare(b.title || ''));
      if (sortBy === 'genre') return dir * ((a.analysis?.genre || '').localeCompare(b.analysis?.genre || ''));
      if (sortBy === 'energy') return dir * ((a.analysis?.energy || 0) - (b.analysis?.energy || 0));
      if (sortBy === 'duration') return dir * ((a.analysis?.duration || 0) - (b.analysis?.duration || 0));
    return dir * (new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  });

  // ââ Keyboard Shortcuts ââââââââââââââââââââââââââââââââââââââââââââââââââ
  
  // Waveform zoom effect
  useEffect(() => {
    if (wavesurferRef.current) {
      if (waveformZoom <= 1) { try { wavesurferRef.current.zoom(1); } catch(e) {} } else { try { wavesurferRef.current.zoom(Math.max(1, waveformZoom * 20)); } catch(e) {} } setZoomLevel(Math.max(1, waveformZoom * 20));
    }
  }, [waveformZoom]);

  // Sort tracks

useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      const ws = wavesurferRef.current;
      if (!ws) return;
      if (e.key === '?') { setShowShortcuts(prev => !prev); return; }
      switch (e.code) {
        case 'ArrowLeft': if (wavesurferRef.current) wavesurferRef.current.skip(-5); e.preventDefault(); break;
          case 'ArrowRight': if (wavesurferRef.current) wavesurferRef.current.skip(5); e.preventDefault(); break;
          case 'KeyM': { const next = !muted; setMuted(next); if (wavesurferRef.current) wavesurferRef.current.setVolume(next ? 0 : volume); break; }
          case 'Equal': case 'NumpadAdd': { const r = Math.min(2.0, playbackRate + 0.05); setPlaybackRate(r); if (wavesurferRef.current) wavesurferRef.current.setPlaybackRate(r); e.preventDefault(); break; }
          case 'Minus': case 'NumpadSubtract': { const r = Math.max(0.5, playbackRate - 0.05); setPlaybackRate(r); if (wavesurferRef.current) wavesurferRef.current.setPlaybackRate(r); e.preventDefault(); break; }
          case 'Digit0': case 'Numpad0': { setPlaybackRate(1.0); if (wavesurferRef.current) wavesurferRef.current.setPlaybackRate(1.0); e.preventDefault(); break; }
          case 'Space':
          e.preventDefault();
          ws.playPause();
          break;
        case 'KeyL':
          if (loopIn !== null && loopOut !== null) {
            setLoopActive(prev => !prev);
          } else if (loopIn === null) {
            setLoopIn(ws.getCurrentTime());
          } else {
            setLoopOut(ws.getCurrentTime());
            setLoopActive(true);
          }
          break;
        case 'Escape':
          setLoopIn(null); setLoopOut(null); setLoopActive(false);
          if (loopRegionRef.current) { try { loopRegionRef.current.remove(); } catch {} loopRegionRef.current = null; }
          break;
        case 'BracketLeft':
          setLoopIn(ws.getCurrentTime());
          break;
        case 'BracketRight':
          setLoopOut(ws.getCurrentTime());
          if (loopIn !== null) setLoopActive(true);
          break;
        default:
          if (e.code.startsWith('Digit')) {
            const num = parseInt(e.code.replace('Digit', '')) - 1;
            if (selectedTrack?.cue_points?.[num]) {
              const pos = selectedTrack.cue_points[num].position_ms / 1000;
              ws.seekTo(pos / ws.getDuration());
            }
          }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTrack, loopIn, loopOut, showShortcuts, muted, volume, playbackRate]);

  // ââ Loop playback logic âââââââââââââââââââââââââââââââââââââââââââââââââ
  useEffect(() => {
    const ws = wavesurferRef.current;
    const regions = regionsRef.current;
    // Always clean up old region first
    if (loopRegionRef.current) { try { loopRegionRef.current.remove(); } catch {} loopRegionRef.current = null; }
    if (!ws || !loopActive || loopIn === null || loopOut === null || loopIn >= loopOut) return;
    // Add visual loop region on waveform
    if (regions) {
      loopRegionRef.current = regions.addRegion({
        start: loopIn,
        end: loopOut,
        color: 'rgba(236,72,153,0.18)',
        drag: true,
        resize: true,
      });
      // Update loop points when user drags/resizes region
      loopRegionRef.current.on('update-end', () => {
        const r = loopRegionRef.current;
        if (r) { setLoopIn(r.start); setLoopOut(r.end); }
      });
    }
    // Seeking is handled by ref-based timeupdate in ws init - no duplicate needed
    return () => {
      if (loopRegionRef.current) { try { loopRegionRef.current.remove(); } catch {} loopRegionRef.current = null; }
    };
  }, [loopActive, loopIn, loopOut]);




  return (
        <div className="flex w-full h-[calc(100vh-3.5rem)] relative" onClick={() =>
       setCtxMenu(null)} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
      {/* ── Drag & Drop Overlay ── */}
      {isDragging && (
        <div className="absolute inset-0 z-[9998] bg-cyan-500/10 backdrop-blur-sm border-2 border-dashed border-cyan-400/60 rounded-xl flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 text-cyan-400">
            <Upload size={48} className="animate-bounce" />
            <span className="text-lg font-semibold">D\u00e9pose tes fichiers audio ici</span>
            <span className="text-sm text-cyan-400/60">MP3, WAV, FLAC, AAC, OGG, M4A, AIF</span>
          </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: "@keyframes eqBar { 0%,100% { height: 3px; } 50% { height: 12px; } } .eq-bar { display: inline-block; width: 2px; margin: 0 0.5px; border-radius: 1px; animation: eqBar 0.4s ease infinite; } .eq-bar:nth-child(1) { animation-delay: 0s; } .eq-bar:nth-child(2) { animation-delay: 0.15s; } .eq-bar:nth-child(3) { animation-delay: 0.3s; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.3); border-radius: 3px; } ::-webkit-scrollbar-thumb:hover { background: rgba(100,116,139,0.5); }" }} ></style>
      {/* Metadata Edit Modal */}
      {showEditMeta && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowEditMeta(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-600 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">✏️ Edit Track Metadata</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Title</label>
                <input type="text" value={editForm.title} onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Artist</label>
                <input type="text" value={editForm.artist} onChange={(e) => setEditForm({...editForm, artist: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Album</label>
                <input type="text" value={editForm.album} onChange={(e) => setEditForm({...editForm, album: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 block mb-1">Genre</label>
                  <input type="text" value={editForm.genre} onChange={(e) => setEditForm({...editForm, genre: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none" />
                </div>
                <div className="w-20">
                  <label className="text-xs text-gray-400 block mb-1">Year</label>
                  <input type="number" value={editForm.year || ''} onChange={(e) => setEditForm({...editForm, year: parseInt(e.target.value) || 0})}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Comment</label>
                <textarea value={editForm.comment} onChange={(e) => setEditForm({...editForm, comment: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none h-16 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowEditMeta(false)} className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm text-white font-medium">Cancel</button>
              <button onClick={saveMetadata} disabled={savingMeta}
                className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-sm text-white font-bold disabled:opacity-50">
                {savingMeta ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LEFT SIDEBAR - Module Buttons */}
      <div className="w-12 bg-gray-950/90 border-r border-gray-800/50 flex flex-col items-center py-2 gap-1 flex-shrink-0 overflow-y-auto">
        <button onClick={() => fileRef.current?.click()} className="w-10 h-10 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex flex-col items-center justify-center mb-2" title="Ajouter un son"><Upload size={16} /><span className="text-[8px]">Add</span></button>
        <div className="w-8 border-t border-gray-700/50 mb-1"></div>
        {[
          { key: 'smart', icon: <Sparkles size={16} />, label: 'Smart' },
          { key: 'duplicates', icon: <Copy size={16} />, label: 'Dupes' },
          { key: 'export', icon: <Download size={16} />, label: 'Export' },
          { key: 'stats', icon: <BarChart3 size={16} />, label: 'Stats' },
          { key: 'batch', icon: <ListIcon size={16} />, label: 'Batch' },
          { key: 'camelot', icon: <Disc3 size={16} />, label: 'Wheel' },
          { key: 'watch', icon: <Folder size={16} />, label: 'Watch' },
          { key: 'ai', icon: <Wand2 size={16} />, label: 'AI Mix' },
          { key: 'grid', icon: <Grid3X3 size={16} />, label: 'Grid' },
          { key: 'mixable', icon: <Music2 size={16} />, label: 'Mix' },
          { key: 'analyzed', icon: <CheckSquare size={16} />, label: 'Done' },
        ].filter((mod) => {
          const featureMap: Record<string, string> = { smart: 'playlists', duplicates: 'playlists', export: 'rekordbox_export', stats: 'stats', batch: 'batch_analysis', camelot: 'camelot_wheel', watch: 'watch_folder', ai: 'mix', grid: 'waveform', mixable: 'mix', analyzed: 'analysis' };
          return isFeatureEnabled(featureMap[mod.key] || mod.key);
        }).map((mod) => (
          <button key={mod.key} onClick={() => { const closing = activeModule === mod.key; setActiveModule(closing ? null : mod.key); setShowSmartPlaylist(false); setShowDuplicates(false); setShowExport(false); setShowStats(false); setShowBatchEdit(false); setShowCamelotWheel(false); setShowWatchFolder(false); setShowMixSuggestions(false); setShowBeatGrid(false); setShowAnalyzed(false); if (!closing) { const m = {smart: setShowSmartPlaylist, duplicates: setShowDuplicates, export: setShowExport, stats: setShowStats, batch: setShowBatchEdit, camelot: setShowCamelotWheel, watch: setShowWatchFolder, ai: setShowMixSuggestions, grid: setShowBeatGrid, analyzed: setShowAnalyzed}; if (m[mod.key]) m[mod.key](true); } }} className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg text-[9px] w-full transition-all ${activeModule === mod.key ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
            {mod.icon}
            <span>{mod.label}</span>
          </button>
        ))}
      </div>
      {/* CENTER CONTENT */}
      <div className="flex-1 flex flex-col overflow-y-auto min-w-0">

      {/* âÂÂâÂÂ TOP: Waveform Player (ALWAYS mounted) âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ */}
      <div className="bg-bg-secondary border-b border-slate-800/60 px-2 py-0.5 flex-shrink-0 sticky top-0 z-10">
        {selectedTrack && (
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-3 min-w-0">
              {/* Cover art */}
              {selectedTrack.artwork_url ? (
                <img src={selectedTrack.artwork_url} alt="" className="w-6 h-6 rounded object-cover" />
              ) : (
                <div className="w-6 h-6 rounded bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                  <Music2 size={12} className="text-slate-500" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  {selectedTrack.title || selectedTrack.original_filename}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {selectedTrack.artist || 'Artiste inconnu'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-slate-400 flex-shrink-0">
              {selectedTrack.analysis?.bpm && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/20">
                  <Activity size={12} className="text-blue-400" />
                  <span className="text-blue-400 font-bold">{selectedTrack.analysis.bpm.toFixed(1)}</span>
                  <span className="text-blue-400/60">BPM</span>
                </div>
              )}
              {selectedTrack.analysis?.key && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20">
                  <Music2 size={12} className="text-cyan-400" />
                  <span className="text-cyan-400 font-bold">{toCamelot(selectedTrack.analysis.key)}</span>
                </div>
              )}
              {selectedTrack.analysis?.energy != null && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                  <Zap size={12} className="text-yellow-400" />
                  <span className="text-yellow-400 font-bold">{energyToRating(selectedTrack.analysis.energy)}</span>
                  <span className="text-yellow-400/60">/10</span>
                </div>
              )}
              {selectedTrack.genre && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-500/10 border border-purple-500/20">
                  <Disc3 size={12} className="text-purple-400" />
                  <span className="text-purple-400 font-bold text-[11px]">{selectedTrack.genre}</span>
                </div>
              )}
              <span onClick={() => setShowRemainingTime(!showRemainingTime)} className="text-white font-mono text-sm tabular-nums bg-black/40 px-2 py-0.5 rounded cursor-pointer hover:bg-black/60 transition-colors select-none" title="Cliquer pour basculer temps restant">{showRemainingTime ? (`-${msToTime(Math.max(0, (duration - currentTime)) * 1000)}`) : msToTime(currentTime * 1000)} <span className="text-slate-500">/</span> {msToTime(duration * 1000)}</span>
            </div>
          </div>
          )}

        {/* Waveform container - ALWAYS mounted, never conditionally unmounted */}
        <div className="relative w-full rounded-lg bg-bg-primary border border-slate-800/40" style={{ height: 110, overflow: 'visible' }} onWheel={(e) => { e.preventDefault(); if (e.deltaY < 0) setWaveformZoom((z) => Math.min(20, z + 1)); else setWaveformZoom((z) => Math.max(1, z - 1)); }}>
                {/* WAVEFORM TOOLBAR */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setWaveformZoom(Math.max(1, waveformZoom - 1))} className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors" title="Zoom Out">
                      <ZoomOut size={14} />
                    </button>
                    <span className="text-[10px] text-gray-500 min-w-[30px] text-center">{waveformZoom}x</span>
                    <button onClick={() => setWaveformZoom(Math.min(10, waveformZoom + 1))} className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors" title="Zoom In">
                      <ZoomIn size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowBeatGrid(!showBeatGrid)} className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${showBeatGrid ? 'bg-purple-500/30 text-cyan-400/80 border border-purple-500/50' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}>
                      <Grid3X3 size={10} /> Beat Grid
                    </button>
                    <button onClick={() => setShowNotes(!showNotes)} className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${showNotes ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}>
                      Notes
                    </button>
                    <button onClick={() => setShowShortcuts(!showShortcuts)} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors text-gray-500 hover:text-cyan-400 hover:bg-cyan-400/10" title="Raccourcis clavier (?)">
                      <span className="font-bold">?</span>
                    </button>
              {/* Waveform Theme */}
              <div className="flex items-center gap-1 ml-1">
                <Palette size={10} className="text-gray-600" />
                {Object.entries(WAVEFORM_THEMES).map(([key, t]) => (
                  <button key={key} onClick={() => setWaveformTheme(key as any)} className={"w-3 h-3 rounded-full border transition-all " + (waveformTheme === key ? "border-white scale-125 ring-1 ring-white/30" : "border-gray-600 hover:border-gray-400")} style={{ backgroundColor: t.cursor === '#fff' ? '#7c3aed' : t.cursor }} title={t.label} />
                ))}
              </div>
                  </div>
                </div>

          <div className="relative w-full h-full">
                <div ref={waveformRef} className="w-full h-full" style={{ overflow: 'hidden' }} />
                {/* Beat Grid Lines Overlay */}
                {showBeatGrid && selectedTrack?.analysis?.bpm && duration > 0 && (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 2, pointerEvents: 'none' }}>
                    {(() => {
                      const bpm = selectedTrack.analysis.bpm;
                      const beatDuration = 60 / bpm;
                      const barDuration = beatDuration * 4;
                      const totalBars = Math.ceil(duration / barDuration);
                      const lines = [];
                      for (let i = 0; i <= totalBars; i++) {
                        const pct = (i * barDuration / duration) * 100;
                        if (pct > 100) break;
                        const isPhrase = i % 8 === 0;
                        const is4Bar = i % 4 === 0;
                        lines.push(
                          <div key={i} className="absolute top-0 bottom-0" style={{
                            left: pct + '%',
                            width: isPhrase ? '2px' : is4Bar ? '1.5px' : '1px',
                            background: isPhrase ? 'rgba(6,182,212,0.5)' : is4Bar ? 'rgba(6,182,212,0.25)' : 'rgba(148,163,184,0.12)',
                          }} />
                        );
                      }
                      return lines;
                    })()}
                  </div>
                )}
                {/* Cue Point Markers Overlay */}
                {selectedTrack?.cue_points && duration > 0 && (
                  <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 3, pointerEvents: 'none' }}>
                    {selectedTrack.cue_points.map((cue, i) => {
                      const timeMs = cue.position_ms || cue.time;
                      if (!timeMs) return null;
                      const pct = (timeMs / (duration * 1000)) * 100;
                      if (pct < 0 || pct > 100) return null;
                      const color = getCueColor(cue.id, i);
                      return (
                        <div key={cue.id || i} className="absolute top-0" style={{ left: pct + '%', transform: 'translateX(-50%)' }}>
                          <div style={{ width: 2, height: '100%', backgroundColor: color, opacity: 0.6 }} />
                          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 text-[7px] font-bold text-white px-0.5 rounded-sm" style={{ backgroundColor: color }}>{i + 1}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
                {/* Overview Bar with Section Labels */}
                {duration > 0 && (
                  <div className="w-full mt-1.5 space-y-0.5">
                    {/* Section labels bar */}
                    {selectedTrack?.analysis?.sections && selectedTrack.analysis.sections.length > 0 && (
                      <div className="relative w-full h-5 rounded overflow-hidden bg-gray-900/50">
                        {selectedTrack.analysis.sections.map((sec: any, i: number) => {
                          const startPct = (sec.start / duration) * 100;
                          const endTime = i < selectedTrack.analysis.sections.length - 1 ? selectedTrack.analysis.sections[i + 1].start : duration;
                          const widthPct = ((endTime - sec.start) / duration) * 100;
                          const sectionColors: Record<string, string> = { 'INTRO': '#3b82f6', 'VERSE': '#22c55e', 'CHORUS': '#eab308', 'BUILD': '#f97316', 'DROP': '#ef4444', 'BREAK': '#06b6d4', 'OUTRO': '#8b5cf6' };
                          const bg = sectionColors[sec.label] || '#6b7280';
                          return (
                            <div key={i} className="absolute top-0 h-full flex items-center justify-center overflow-hidden border-r border-gray-800/50" style={{ left: startPct + '%', width: widthPct + '%', backgroundColor: bg + '33' }}>
                              <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: bg }}>{sec.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Progress bar */}
                    <div className="relative w-full h-1.5 bg-gray-800/60 rounded-full overflow-hidden cursor-pointer" onClick={(e) => {
                      if (wavesurferRef.current && duration > 0) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pct = (e.clientX - rect.left) / rect.width;
                        wavesurferRef.current.seekTo(Math.max(0, Math.min(1, pct)));
                      }
                    }}>
                      <div className="h-full rounded-full bg-gradient-to-r from-purple-500 via-cyan-400 to-blue-500 transition-all duration-75" style={{ width: (currentTime / duration * 100) + '%' }} />
                      <div className="absolute top-0 h-full w-0.5 bg-white rounded" style={{ left: (currentTime / duration * 100) + '%', transform: 'translateX(-50%)' }} />
                    </div>
                  </div>
                )}
              {/* TRACK NOTES */}
                {showNotes && selectedTrack && (
                  <div className="mt-2 bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider">DJ Notes</span>
                      <span className="text-[10px] text-gray-600">{(trackNotes[selectedTrack.id] || '').length}/500</span>
                    </div>
                    <textarea
                      value={trackNotes[selectedTrack.id] || ''}
                      onChange={e => setTrackNotes(prev => ({...prev, [selectedTrack.id]: e.target.value.slice(0, 500)}))}
                      placeholder="Mix notes: transition ideas, EQ settings, energy flow..."
                      className="w-full bg-gray-900/50 border border-gray-700 rounded p-2 text-xs text-gray-300 placeholder-gray-600 resize-none focus:border-purple-500/50 focus:outline-none"
                      rows={2}
                    />
                  </div>
                )}
                {/* BEAT GRID OVERLAY */}
                {showBeatGrid && selectedTrack?.analysis?.bpm && (
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-500">
                    <Grid3X3 size={10} className="text-cyan-500/70" />
                    <span>Beat Grid: {selectedTrack.analysis.bpm} BPM</span>
                    <span className="text-gray-700">|</span>
                    <span>Beat: {(60 / selectedTrack.analysis.bpm * 1000).toFixed(0)}ms</span>
                    <span className="text-gray-700">|</span>
                    <span>Bar: {(60 / selectedTrack.analysis.bpm * 4).toFixed(2)}s</span>
                    <span className="text-gray-700">|</span>
                    <span>Phrase (8bar): {(60 / selectedTrack.analysis.bpm * 32).toFixed(1)}s</span>
                  </div>
                )}
          {!selectedTrack && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3">
              <Disc3 size={32} className="text-slate-600 animate-spin" style={{ animationDuration: '3s' }} />
              <p className="text-slate-500 text-sm">Sélectionne un morceau pour voir la waveform</p>
              <p className="text-slate-600 text-[10px]">Clique sur un track dans la liste ci-dessous</p>
            </div>
          )}
          {selectedTrack && (
            <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
              <button
                onClick={() => handleZoom('out')}
                disabled={zoomLevel <= 1}
                className="w-7 h-7 flex items-center justify-center bg-slate-900/80 hover:bg-slate-800 disabled:opacity-30 text-white rounded-md border border-slate-700/50 transition-all"
                title="Zoom out"
              >
                <ZoomOut size={14} />
              </button>
              <span className="text-[10px] font-mono text-slate-400 min-w-[32px] text-center">
                {zoomLevel <= 1 ? 'Full' : `${zoomLevel}x`}
              </span>
              <button
                onClick={() => handleZoom('in')}
                disabled={zoomLevel >= 200}
                className="w-7 h-7 flex items-center justify-center bg-slate-900/80 hover:bg-slate-800 disabled:opacity-30 text-white rounded-md border border-slate-700/50 transition-all"
                title="Zoom in"
              >
                <ZoomIn size={14} />
              </button>
            </div>
          )}
        </div>

                {/* DECK CONTROLS */}
        {selectedTrack && (
          <div className="bg-gray-900/95 backdrop-blur-md border-t border-b border-gray-800/60 px-4 py-2">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-1">
                <button onClick={skipBack} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"><SkipBack size={16} /></button>
                <button onClick={togglePlay} className="w-12 h-12 flex items-center justify-center bg-gradient-to-b from-cyan-400 to-cyan-600 rounded-full shadow-cyan-500/30 hover:from-cyan-300 hover:to-cyan-500 transition-all">{isPlaying ? <Pause size={22} className="text-white" /> : <Play size={22} className="text-white ml-0.5" />}</button>
                <button onClick={skipForward} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"><SkipForward size={16} /></button>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {selectedTrack.cue_points && selectedTrack.cue_points.map((cue, i) => (
                  <button key={i} onClick={() => { if (wavesurferRef.current && wavesurferRef.current.getDuration() > 0) { wavesurferRef.current.seekTo((cue.position_ms || cue.time) / (wavesurferRef.current.getDuration() * 1000)); } }}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border bg-black/40"
                    style={{ backgroundColor: (CUE_COLOR_MAP[cue.cue_type || cue.type] || '#6366f1') + '22', borderColor: CUE_COLOR_MAP[cue.cue_type || cue.type] || '#6366f1', color: CUE_COLOR_MAP[cue.cue_type || cue.type] || '#6366f1' }}>
                    <span>{i + 1}</span><span className="uppercase opacity-70 ml-0.5 truncate max-w-[50px]">{cue.name || cue.label || cue.cue_type || 'CUE'}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={toggleMute} className="text-gray-400 hover:text-white transition-colors">{volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
                <input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => { const v = parseFloat(e.target.value); setVolume(v); setMuted(false); if (wavesurferRef.current) wavesurferRef.current.setVolume(v); }} className="w-20 h-1 accent-cyan-400" />
                    <span className="text-[9px] text-gray-500 min-w-[28px] text-right tabular-nums">{Math.round(volume * 100)}%</span>
              </div>
              {/* Playback Speed */}
              <div className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-800">
                <button onClick={() => { const r = Math.max(0.5, playbackRate - 0.05); setPlaybackRate(r); if (wavesurferRef.current) wavesurferRef.current.setPlaybackRate(r); }} className="text-gray-500 hover:text-white text-[10px] px-1 rounded hover:bg-white/10">-</button>
                <button onClick={() => { setPlaybackRate(1.0); if (wavesurferRef.current) wavesurferRef.current.setPlaybackRate(1.0); }} className={"text-[10px] font-mono min-w-[32px] text-center px-1 rounded cursor-pointer " + (playbackRate === 1.0 ? "text-gray-400" : "text-cyan-400 font-bold")} title="Cliquer pour reset">{playbackRate.toFixed(2)}x</button>
                <button onClick={() => { const r = Math.min(2.0, playbackRate + 0.05); setPlaybackRate(r); if (wavesurferRef.current) wavesurferRef.current.setPlaybackRate(r); }} className="text-gray-500 hover:text-white text-[10px] px-1 rounded hover:bg-white/10">+</button>
              </div>
            </div>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4 bg-black/40 rounded-lg border border-gray-800/40 p-2">
                <div className="text-[9px] font-bold text-cyan-400/60 tracking-[0.2em] mb-1">HOT CUES</div>
                <div className="grid grid-cols-8 gap-1">
                  {Array.from({length: 8}).map((_, i) => (
                    <button key={i} onContextMenu={(e) => { e.preventDefault(); if (selectedTrack.cue_points && selectedTrack.cue_points[i] && selectedTrack.cue_points[i].id) { setColorPickerCue(selectedTrack.cue_points[i].id); setColorPickerPos({x: e.clientX, y: e.clientY}); } }} onClick={() => { if (selectedTrack.cue_points && selectedTrack.cue_points[i] && wavesurferRef.current) { const dur = wavesurferRef.current.getDuration(); if (dur > 0) { wavesurferRef.current.seekTo((selectedTrack.cue_points[i].position_ms || selectedTrack.cue_points[i].time) / (dur * 1000)); } } }}
                      className={'h-8 rounded text-[10px] font-bold transition-all ' + (selectedTrack.cue_points && selectedTrack.cue_points[i] ? 'text-white shadow-lg' : 'bg-gray-800/60 text-gray-600')}
                      style={selectedTrack.cue_points && selectedTrack.cue_points[i] ? {backgroundColor: getCueColor(selectedTrack.cue_points[i].id, i), boxShadow: '0 0 8px ' + (getCueColor(selectedTrack.cue_points[i].id, i)) + '40'} : {}}>
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-4 bg-black/40 rounded-lg border border-gray-800/40 p-2">
                <div className="text-[9px] font-bold text-cyan-400/60 tracking-[0.2em] mb-1">LOOP</div>
                <div className="flex gap-1.5">
                  <button onClick={() => { const t = wavesurferRef.current?.getCurrentTime(); if (t != null) { if (loopOut !== null && t >= loopOut) return; setLoopIn(t); } }} className={'flex-1 h-8 rounded text-[10px] font-bold transition-all ' + (loopIn !== null ? 'bg-green-600/30 text-green-400 border border-green-500/40' : 'bg-gray-800/60 hover:bg-cyan-500/20 text-gray-400 hover:text-cyan-400 border border-transparent hover:border-cyan-500/30')}>{loopIn !== null ? 'IN ' + Math.floor(loopIn / 60) + ':' + String(Math.floor(loopIn % 60)).padStart(2,'0') : 'IN'}</button>
                  <button onClick={() => { const t = wavesurferRef.current?.getCurrentTime(); if (t != null) { if (loopIn !== null && t <= loopIn) return; setLoopOut(t); } }} className={'flex-1 h-8 rounded text-[10px] font-bold transition-all ' + (loopOut !== null ? 'bg-orange-600/30 text-orange-400 border border-orange-500/40' : 'bg-gray-800/60 hover:bg-cyan-500/20 text-gray-400 hover:text-cyan-400 border border-transparent hover:border-cyan-500/30')}>{loopOut !== null ? 'OUT ' + Math.floor(loopOut / 60) + ':' + String(Math.floor(loopOut % 60)).padStart(2,'0') : 'OUT'}</button>
                  <button onClick={() => { if (!loopActive && (loopIn === null || loopOut === null)) return; setLoopActive(prev => !prev); }} onDoubleClick={() => { setLoopIn(null); setLoopOut(null); setLoopActive(false); }} className={'flex-1 h-8 rounded text-[10px] font-bold transition-all ' + (loopActive ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30' : (loopIn !== null && loopOut !== null) ? 'bg-gray-800/60 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/40 hover:border-cyan-500/60' : 'bg-gray-800/60 text-gray-600 border border-transparent cursor-not-allowed')}>LOOP</button>
                </div>
              </div>
              <div className="col-span-2 bg-black/40 rounded-lg border border-gray-800/40 p-2">
                <div className="text-[9px] font-bold text-cyan-400/60 tracking-[0.2em] mb-1">KEY</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-black text-white tracking-tight">{selectedTrack.analysis?.key ? (CAMELOT_WHEEL[selectedTrack.analysis.key] || selectedTrack.analysis.key) : '--'}</span>
                </div>
                {selectedTrack.analysis?.key && CAMELOT_WHEEL[selectedTrack.analysis.key] && (
                  <div className="flex gap-1 mt-1">
                    {[
                      String((parseInt(CAMELOT_WHEEL[selectedTrack.analysis.key]) % 12) + 1) + CAMELOT_WHEEL[selectedTrack.analysis.key].replace(/[0-9]/g, ''),
                      String(((parseInt(CAMELOT_WHEEL[selectedTrack.analysis.key]) - 2 + 12) % 12) + 1) + CAMELOT_WHEEL[selectedTrack.analysis.key].replace(/[0-9]/g, ''),
                      String(parseInt(CAMELOT_WHEEL[selectedTrack.analysis.key])) + (CAMELOT_WHEEL[selectedTrack.analysis.key].replace(/[0-9]/g, '') === 'A' ? 'B' : 'A')
                    ].map(c => (
                      <span key={c} className="text-[8px] px-1 py-0.5 bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/30">{c}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="col-span-2 bg-black/40 rounded-lg border border-gray-800/40 p-2">
                <div className="text-[9px] font-bold text-cyan-400/60 tracking-[0.2em] mb-1">ENERGY</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-blue-500 transition-all" style={{width: String((selectedTrack.analysis?.energy || 0) * 100) + '%'}} />
                  </div>
                  <span className="text-xs font-bold text-gray-300 w-8 text-right">{((selectedTrack.analysis?.energy || 0) * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>

{/* âÂÂâÂÂ TOOLBAR: Upload, Search, Batch Actions âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ */}
      <div
        className={`flex items-center gap-2 px-4 py-2 border-b border-slate-800/40 flex-shrink-0 transition-colors ${dragOver ? 'bg-blue-600/10 border-blue-500/40' : 'bg-bg-secondary/50'}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {/* Upload button */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all"
        >
          <Upload size={13} />
          Ajouter
        </button>
        <input ref={fileRef} type="file" multiple accept=".mp3,.wav,.flac,.aiff,.aif,.m4a,.ogg,audio/*" className="hidden"
          onChange={e => e.target.files && handleFiles(e.target.files)} />

        {/* Batch action buttons */}
        {selectedCount > 0 && (
          <>
            <div className="w-px h-5 bg-slate-700/60" />
            <span className="text-[10px] text-slate-400 font-medium">{selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}</span>
            <button
              onClick={() => batchAnalyzeAudio(Array.from(selectedIds))}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-600/80 hover:bg-purple-500 disabled:opacity-50 text-white text-[11px] font-semibold rounded-lg transition-all"
            >
              <Zap size={12} />
              Analyser Audio
            </button>
            <button
              onClick={() => batchAnalyzeMetadata(Array.from(selectedIds))}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-600/80 hover:bg-green-500 disabled:opacity-50 text-white text-[11px] font-semibold rounded-lg transition-all"
            >
              <Sparkles size={12} />
              Rechercher Infos
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="flex items-center gap-1 px-2 py-1.5 text-slate-400 hover:text-white text-[11px] transition-colors"
            >
              <X size={12} />
              Désélectionner
            </button>
          </>
        )}

        {/* Loading indicator */}
        {isLoading && batchProgress && (
          <div className="flex items-center gap-2 text-xs text-blue-400">
            <Loader2 size={13} className="animate-spin" />
            {batchProgress}
          </div>
        )}

        {dragOver && <span className="text-blue-400 text-xs font-medium">Dépose tes fichiers ici...</span>}
        <div className="flex-1" />

        {/* Select all shortcut hint */}
        <span className="text-[10px] text-slate-600 hidden md:block">Ctrl+A = tout sélectionner</span>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input ref={searchInputRef} type="text" placeholder="Rechercher..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)} autoFocus
            className="pl-8 pr-7 py-1.5 bg-bg-primary border border-slate-800/50 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-600/50 w-44" />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
              <X size={12} />
            </button>
          )}
        </div>
        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          className="px-2 py-1.5 bg-bg-primary border border-slate-800/50 rounded-lg text-xs text-slate-300 focus:outline-none">
          <option value="date">Date Added</option>
                            <option value="title">Title</option>
                            <option value="bpm">BPM</option>
                            <option value="key">Key</option>
                            <option value="energy">Energy</option>
                            <option value="genre">Genre</option>
                            <option value="duration">Duration</option></select>
        <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} className="px-2 py-1.5 bg-bg-primary border border-slate-800/50 rounded-lg text-xs text-slate-400 hover:text-cyan-400 transition-colors" title={sortDir === 'asc' ? 'Croissant' : 'Décroissant'}>{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</button>
      </div>

      {error && (
        <div className="mx-4 mt-2 flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs flex-shrink-0">
          <XCircle size={14} />{error}
          <button onClick={() => setError('')} className="ml-auto"><X size={12} /></button>
        </div>
      )}

                {/* MODULE TABS ROW */}
<div className="flex items-center gap-1 px-4 py-1.5 border-b border-slate-800/30 bg-gray-950/50">
  {[
    { id: 'tracks', label: 'TRACKS', icon: 'ListMusic' },
    { id: 'cues', label: 'CUES', icon: 'Disc3' },
    { id: 'eq', label: 'EQ', icon: 'SlidersHorizontal' },
    { id: 'fx', label: 'FX', icon: 'Wand2' },
    { id: 'mix', label: 'MIX', icon: 'Disc' },
    { id: 'playlists', label: 'PLAYLISTS', icon: 'List' },
    { id: 'history', label: 'HISTORY', icon: 'Clock' },
    { id: 'stats', label: 'STATS', icon: 'BarChart3' },
  ].map(tab => (
    <button key={tab.id} onClick={() => {
      if (tab.id === 'tracks') { setShowModuleView(false); setActiveBottomTab('cues'); } else if (['playlists', 'history', 'stats'].includes(tab.id)) { setShowModuleView(true); setActiveBottomTab(tab.id); } else { setShowModuleView(true); setActiveBottomTab(tab.id); }}} className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] rounded-md transition-all duration-200 ${
      (tab.id === 'tracks' && activeBottomTab === 'cues' && !showModuleView) || (tab.id !== 'tracks' && activeBottomTab === tab.id)
        ? 'text-cyan-400 bg-cyan-400/10 border border-cyan-400/30'
        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
    }`}>
      {tab.id === 'tracks' && <ListMusic size={12} />}
      {tab.id === 'cues' && <Disc3 size={12} />}
      {tab.id === 'eq' && <SlidersHorizontal size={12} />}
      {tab.id === 'fx' && <Wand2 size={12} />}
      {tab.id === 'mix' && <Disc size={12} />}
      {tab.id === 'playlists' && <ListIcon size={12} />}
      {tab.id === 'history' && <Clock size={12} />}
      {tab.id === 'stats' && <BarChart3 size={12} />}
      {tab.label}
    </button>
  ))}
</div>
{!showModuleView ? (
<>
{/* TRACK STATS */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-300">{filteredTracks.length} track{filteredTracks.length !== 1 ? 's' : ''}</span>
                    {filteredTracks.length !== tracks.length && (
                      <span className="text-[10px] text-gray-600">/ {tracks.length} total</span>
                    )}
                    {selectedTrack && (
                      <button onClick={() => setShowCompatibleOnly(prev => !prev)} className={"flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors " + (showCompatibleOnly ? "bg-green-500/30 text-green-300 border border-green-500/50" : "bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:bg-gray-600/50")}>
                        <Zap className="w-3 h-3" /> {showCompatibleOnly ? 'Compatible' : 'All Keys'}
                      </button>
                    )}
                    {selectedTrack && (
                      <button onClick={() => {
                        if (!selectedTrack.analysis?.key || !selectedTrack.analysis?.bpm) return;
                        let bestTrack = null;
                        let bestScore = -1;
                        filteredTracks.forEach(t => {
                          if (t.id === selectedTrack.id || !t.analysis?.key || !t.analysis?.bpm) return;
                          const score = mixScore(selectedTrack.analysis.key, selectedTrack.analysis.bpm, t.analysis.key, t.analysis.bpm);
                          if (score.total > bestScore) { bestScore = score.total; bestTrack = t; }
                        });
                        if (bestTrack) { setSelectedTrack(bestTrack); }
                      }} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/30 text-purple-300 border border-purple-500/50 hover:bg-purple-500/50 transition-colors" title="Jump to best matching track">
                        <Sparkles className="w-3 h-3" /> Quick Mix
                      </button>
                    )}
                    <button onClick={() => setShowBpmTap(prev => !prev)} className={"flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors " + (showBpmTap ? "bg-orange-500/30 text-orange-300 border border-orange-500/50" : "bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:bg-gray-600/50")} title="Tap to detect BPM">
                      <Activity className="w-3 h-3" /> Tap BPM
                    </button>
                    {filteredTracks.length > 0 && (() => {
                      const totalMs = filteredTracks.reduce((sum, t) => sum + (t.analysis?.duration_ms || t.duration_ms || 0), 0);
                      const bpmTracks = filteredTracks.filter(t => t.analysis?.bpm);
                      const avgBpm = bpmTracks.length > 0 ? bpmTracks.reduce((s, t) => s + (t.analysis?.bpm || 0), 0) / bpmTracks.length : 0;
                      return (
                        <>
                          <span className="text-[10px] text-gray-600">·</span>
                          <span className="text-[10px] text-gray-500">{Math.floor(totalMs / 60000)}min</span>
                          {avgBpm > 0 && <><span className="text-[10px] text-gray-600">·</span><span className="text-[10px] text-gray-500">~{avgBpm.toFixed(0)} BPM</span></>}
                        </>
                      );
                    })()}
                  </div>
                  {selectedTrack && filteredTracks.length > 1 && (() => {
                    const best = filteredTracks
                      .filter(t => t.id !== selectedTrack.id && t.analysis?.key)
                      .map(t => ({track: t, score: mixScore(selectedTrack.analysis?.key || '', selectedTrack.analysis?.bpm || 0, t.analysis?.key || '', t.analysis?.bpm || 0)}))
                      .sort((a, b) => b.score.total - a.score.total)[0];
                    return best ? (
                      <button onClick={() => setSelectedTrack(best.track)} className="flex items-center gap-1 text-[10px] text-green-400 hover:text-green-300 transition-colors" title="Best harmonic match">
                        <Sparkles size={10} /> Next: {best.track.title?.slice(0, 15)}... ({best.score.total}%)
                      </button>
                    ) : null;
                  })()}
                </div>

      {/* âÂÂâÂÂ TRACK LIST âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ */}

                {/* FILTER BAR */}
                <div className="mb-2 space-y-2">
                  <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors">
                    <Filter size={12} /> {showFilters ? 'Hide Filters' : 'Filter & Sort'}{(() => { const n = (filterBpmMin > 0 ? 1 : 0) + (filterBpmMax < 999 ? 1 : 0) + (filterKey ? 1 : 0) + (filterGenre ? 1 : 0) + (filterEnergyMin > 0 ? 1 : 0) + (filterEnergyMax < 100 ? 1 : 0); return n > 0 ? ` (${n})` : ''; })()}
                  </button>
                  {showFilters && (
                    <div className="bg-gray-800/50 rounded-lg p-2 space-y-2 border border-gray-700/50">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-[10px] text-gray-500 uppercase">BPM Min</label>
                          <input type="number" value={filterBpmMin || ''} onChange={e => setFilterBpmMin(Number(e.target.value) || 0)} placeholder="60" className="w-full bg-gray-900/50 border border-gray-700 rounded px-2 py-1 text-xs text-white" />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] text-gray-500 uppercase">BPM Max</label>
                          <input type="number" value={filterBpmMax >= 999 ? '' : filterBpmMax} onChange={e => setFilterBpmMax(Number(e.target.value) || 999)} placeholder="200" className="w-full bg-gray-900/50 border border-gray-700 rounded px-2 py-1 text-xs text-white" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase">Key</label>
                        <select value={filterKey} onChange={e => setFilterKey(e.target.value)} className="w-full bg-gray-900/50 border border-gray-700 rounded px-2 py-1 text-xs text-white">
                          <option value="">All Keys</option>
                          {Object.entries(CAMELOT_MAP).map(([k, v]) => <option key={k} value={k}>{v} - {k}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase">Genre</label>
                        <select value={filterGenre} onChange={e => setFilterGenre(e.target.value)} className="w-full bg-gray-900/50 border border-gray-700 rounded px-2 py-1 text-xs text-white">
                          <option value="">All Genres</option>
                          {[...new Set(tracks.map(t => t.genre).filter(Boolean))].sort().map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                    {/* Energy Filter */}
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Énergie</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0" max="100" step="5"
                          value={filterEnergyMin}
                          onChange={e => setFilterEnergyMin(Number(e.target.value))}
                          className="flex-1 h-1 accent-orange-500"
                          title={`Min: ${filterEnergyMin}%`}
                        />
                        <span className="text-[10px] text-slate-400 font-mono min-w-[60px] text-center">{filterEnergyMin}%-{filterEnergyMax}%</span>
                        <input
                          type="range"
                          min="0" max="100" step="5"
                          value={filterEnergyMax}
                          onChange={e => setFilterEnergyMax(Number(e.target.value))}
                          className="flex-1 h-1 accent-orange-500"
                          title={`Max: ${filterEnergyMax}%`}
                        />
                      </div>
                    </div>
                      
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase">Sort by</label>
                        <div className="flex gap-1">
                          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="flex-1 bg-gray-900/50 border border-gray-700 rounded px-2 py-1 text-xs text-white">
                            <option value="date">Date Added</option>
                            <option value="bpm">BPM</option>
                            <option value="key">Key</option>
                            <option value="title">Title</option>
                          </select>
                          <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} className="px-2 py-1 bg-gray-900/50 border border-gray-700 rounded text-xs text-gray-400 hover:text-white">
                            {sortDir === 'asc' ? '\u2191' : '\u2193'}
                          </button>
                        </div>
                      </div>
{(filterBpmMin > 0 || filterBpmMax < 999 || filterKey || filterGenre || filterEnergyMin > 0 || filterEnergyMax < 100) && (
                        <button onClick={() => { setFilterBpmMin(0); setFilterBpmMax(999); setFilterKey(''); setFilterGenre(''); setFilterEnergyMin(0); setFilterEnergyMax(100); }} className="text-[10px] text-red-400 hover:text-red-300">Clear filters</button>
                      )}
                    </div>
                  )}
                </div>
      <div className="flex-1 overflow-y-auto max-h-[35vh] min-h-[120px]">
        
                {/* Selection action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 bg-purple-500/10 border-b border-purple-500/20">
            <span className="text-xs font-medium text-purple-300">{selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
            <button onClick={() => { const ids = Array.from(selectedIds); showToast(`Analyse de ${ids.length} track(s) lanc\u00e9e`, 'info'); ids.forEach(id => { analyzeTrack(id).then(() => pollTrackUntilDone(id)).then(updated => { setTracks(prev => prev.map(t => t.id === updated.id ? updated : t)); }); }); }} className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 transition-colors">Analyser</button>
            <button onClick={() => { const ids = Array.from(selectedIds); Promise.all(ids.map(id => deleteTrack(id))).then(() => { setTracks(prev => prev.filter(t => !ids.includes(t.id))); setSelectedIds(new Set()); showToast(`${ids.length} track(s) supprim\u00e9(s)`, 'success'); }); }} className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors">Supprimer</button>
            <button onClick={() => setSelectedIds(new Set())} className="text-[10px] px-2 py-0.5 rounded bg-slate-500/20 text-slate-300 hover:bg-slate-500/30 transition-colors ml-auto">Désélectionner</button>
          </div>
        )}
        {/* ── Upload Progress Bar ── */}
        {uploadProgress && (
          <div className="mx-4 mb-2">
            <div className="flex items-center gap-2 text-xs text-cyan-400 mb-1">
              <Upload size={12} className="animate-bounce" />
              <span>Upload {uploadProgress.current}/{uploadProgress.total}</span>
              <span className="text-slate-500">({Math.round((uploadProgress.current / uploadProgress.total) * 100)}%)</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300 ease-out" style={{width: `${(uploadProgress.current / uploadProgress.total) * 100}%`}} />
            </div>
          </div>
        )}
        {/* Column visibility toggle */}
        <div className="relative inline-block">
          {/* Quick Filters */}
          <div className="flex items-center gap-1 flex-wrap mb-1">
            <span className="text-[9px] text-gray-500 mr-1">Quick:</span>
            {['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#a855f7','#ec4899'].map(c => (
              <button key={c} onClick={() => setFilterColor(filterColor === c ? null : c)}
                className={`w-4 h-4 rounded-full border transition-all ${filterColor === c ? 'border-white scale-125 ring-1 ring-white/30' : 'border-gray-600 opacity-50 hover:opacity-100'}`}
                style={{backgroundColor: c}} />
            ))}
            <span className="text-gray-600 mx-1">|</span>
            {[1,2,3,4,5].map(r => (
              <button key={r} onClick={() => setFilterRating(filterRating === r ? 0 : r)}
                className={`text-[10px] transition-colors ${filterRating >= r ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400/50'}`}>
                <Star className={`w-3 h-3 ${filterRating >= r ? 'fill-yellow-400' : ''}`} />
              </button>
            ))}
            {(filterColor || filterRating > 0) && (
              <button onClick={() => {setFilterColor(null); setFilterRating(0);}}
                className="text-[9px] text-red-400 hover:text-red-300 ml-1">Clear</button>
            )}
          </div>
          {/* BPM Range Filter */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] text-gray-500">BPM:</span>
            <input type="range" min="0" max="300" step="5" value={bpmMin}
              onChange={e => setBpmMin(Number(e.target.value))}
              className="w-16 h-1 accent-cyan-500 cursor-pointer" />
            <span className="text-[9px] text-cyan-400 font-mono w-6">{bpmMin}</span>
            <span className="text-[9px] text-gray-600">-</span>
            <input type="range" min="0" max="300" step="5" value={bpmMax}
              onChange={e => setBpmMax(Number(e.target.value))}
              className="w-16 h-1 accent-cyan-500 cursor-pointer" />
            <span className="text-[9px] text-cyan-400 font-mono w-6">{bpmMax}</span>
            {(bpmMin > 0 || bpmMax < 300) && (
              <button onClick={() => {setBpmMin(0); setBpmMax(300);}}
                className="text-[9px] text-red-400 hover:text-red-300">Reset</button>
            )}
          </div>
          <button onClick={() => setShowColSettings(p => !p)} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-slate-400 hover:text-cyan-400 hover:bg-slate-800/50 transition-colors mb-1" title="Colonnes visibles">
            <SlidersHorizontal size={12} /> Colonnes
          </button>
          <button onClick={() => setShowColumnFilters(prev => !prev)} className={"flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors " + (showColumnFilters ? "bg-purple-500/30 text-purple-300 border border-purple-500/50" : "bg-slate-700/50 text-slate-400 hover:text-white border border-slate-600/50")}>
            <Filter className="w-3 h-3" /> Filters {(colFilterTitle || colFilterArtist || colFilterGenre || colFilterKey || colFilterBpmMin || colFilterBpmMax || colFilterEnergyMin || colFilterEnergyMax) ? '*' : ''}
          </button>
          {showColSettings && (
            <div className="absolute top-full left-0 z-50 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-2 min-w-[140px]" onClick={e => e.stopPropagation()}>
              {[['artist','Artiste'],['album','Album'],['genre','Genre'],['bpm','BPM'],['key','Key'],['energy','Energy'],['duration','Durée']].map(([k,label]) => (
                <label key={k} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-700/50 cursor-pointer text-xs text-slate-300">
                  <input type="checkbox" checked={visibleCols[k]} onChange={() => toggleCol(k)} className="accent-cyan-500 w-3 h-3" />
                  {label}
                </label>
              ))}
            </div>
          )}
        </div>
        {/* Batch Operations Toolbar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 mb-1 p-2 bg-gradient-to-r from-blue-900/40 to-purple-900/40 rounded-lg border border-blue-500/30">
              <span className="text-[10px] text-blue-300 font-bold">{selectedIds.size} selected</span>
              <div className="flex gap-1 ml-2">
                {['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#a855f7','#ec4899'].map(c => (
                  <button key={c} onClick={() => { selectedIds.forEach(id => setTrackColors(prev => ({...prev, [id]: c}))); }}
                    className="w-4 h-4 rounded-full border border-gray-500 hover:scale-125 transition-transform"
                    style={{backgroundColor: c}} title={'Color all ' + c} />
                ))}
              </div>
              <div className="flex gap-0.5 ml-2">
                {[1,2,3,4,5].map(s => (
                  <button key={s} onClick={() => { selectedIds.forEach(id => setTrackRatings(prev => ({...prev, [id]: s}))); }}
                    className="text-[10px] text-yellow-400 hover:scale-125 transition-transform">
                    <Star className="w-3 h-3 fill-yellow-400" />
                  </button>
                ))}
              </div>
              {activeSetList >= 0 && (
                <button onClick={() => { setSetLists(prev => prev.map((sl, i) => i === activeSetList ? {...sl, trackIds: [...new Set([...sl.trackIds, ...Array.from(selectedIds)])]} : sl)); }}
                  className="text-[9px] bg-green-600/30 text-green-300 px-2 py-0.5 rounded hover:bg-green-600/50 transition-colors ml-1">
                  + Set List
                </button>
              )}
              <button onClick={() => { setTracks(prev => prev.filter(t => !selectedIds.has(t.id))); setSelectedIds(new Set()); }}
                className="text-[9px] bg-red-600/30 text-red-300 px-2 py-0.5 rounded hover:bg-red-600/50 transition-colors ml-1">
                Delete
              </button>
              <button onClick={() => setSelectedIds(new Set())}
                className="text-[9px] text-gray-400 hover:text-white ml-auto">Clear</button>
            </div>
          )}
          {/* Table header */}
        <div className="grid track-grid gap-2 px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800/30 sticky top-0 bg-bg-primary z-10" style={{gridTemplateColumns: gridTemplate}}>
          <input type="checkbox" className="rounded border-slate-600 bg-transparent cursor-pointer accent-purple-500" checked={selectedIds.size === filteredTracks.length && filteredTracks.length > 0} onChange={() => { if (selectedIds.size === filteredTracks.length) { setSelectedIds(new Set()); } else { setSelectedIds(new Set(filteredTracks.map(t => t.id))); } }} />
          <span onClick={() => handleHeaderSort('title')} className={"cursor-pointer hover:text-cyan-400 select-none transition-colors " + (sortBy === 'title' ? "text-cyan-400" : "")}>Titre {sortBy === 'title' && (sortDir === 'asc' ? '\u25B2' : '\u25BC')}</span>
          {visibleCols.artist && <span onClick={() => handleHeaderSort('artist')} className={"cursor-pointer hover:text-cyan-400 select-none transition-colors " + (sortBy === 'artist' ? "text-cyan-400" : "")}>Artiste {sortBy === 'artist' && (sortDir === 'asc' ? '\u25B2' : '\u25BC')}</span>}
              {visibleCols.album && <span onClick={() => handleHeaderSort('album')} className={"cursor-pointer hover:text-cyan-400 select-none transition-colors " + (sortBy === 'album' ? "text-cyan-400" : "")}>Album {sortBy === 'album' && (sortDir === 'asc' ? '\u25B2' : '\u25BC')}</span>}
              <span onClick={() => handleHeaderSort('genre')} className={"cursor-pointer hover:text-cyan-400 select-none transition-colors " + (sortBy === 'genre' ? "text-cyan-400" : "")}>Genre {sortBy === 'genre' && (sortDir === 'asc' ? '\u25B2' : '\u25BC')}</span>
          <span onClick={() => handleHeaderSort('bpm')} className={"text-center cursor-pointer hover:text-cyan-400 select-none transition-colors " + (sortBy === 'bpm' ? "text-cyan-400" : "")}>BPM {sortBy === 'bpm' && (sortDir === 'asc' ? '\u25B2' : '\u25BC')}</span>
          <span onClick={() => handleHeaderSort('key')} className={"text-center cursor-pointer hover:text-cyan-400 select-none transition-colors " + (sortBy === 'key' ? "text-cyan-400" : "")}>Key {sortBy === 'key' && (sortDir === 'asc' ? '\u25B2' : '\u25BC')}</span>
          <span onClick={() => handleHeaderSort('energy')} className={"text-center cursor-pointer hover:text-cyan-400 select-none transition-colors " + (sortBy === 'energy' ? "text-cyan-400" : "")}>Energy {sortBy === 'energy' && (sortDir === 'asc' ? '\u25B2' : '\u25BC')}</span>
          <span onClick={() => handleHeaderSort('duration')} className={"text-center cursor-pointer hover:text-cyan-400 select-none transition-colors " + (sortBy === 'duration' ? "text-cyan-400" : "")}>Durée {sortBy === 'duration' && (sortDir === 'asc' ? '\u25B2' : '\u25BC')}</span>
          <span />
          {/* Column Filter Row */}
          {showColumnFilters && (
          <div className="grid track-grid gap-2 px-4 py-2 text-[9px] border-b border-slate-700/50 bg-slate-900/50">
            <span />
            <input type="text" placeholder="Filter title..." value={colFilterTitle} onChange={e => setColFilterTitle(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-slate-300 text-[9px] w-full" />
            {visibleCols.artist && <input type="text" placeholder="Filter artist..." value={colFilterArtist} onChange={e => setColFilterArtist(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-slate-300 text-[9px]" />}
            {visibleCols.album && <span />}
            <select value={colFilterGenre} onChange={e => setColFilterGenre(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-slate-300 text-[9px]">
              <option value="">All Genres</option>
              {Array.from(new Set(tracks.map(t => t.genre).filter(Boolean))).sort().map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <div className="flex gap-1">
              <input type="number" placeholder="Min" value={colFilterBpmMin} onChange={e => setColFilterBpmMin(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-slate-300 text-[9px] w-12" />
              <input type="number" placeholder="Max" value={colFilterBpmMax} onChange={e => setColFilterBpmMax(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-slate-300 text-[9px] w-12" />
            </div>
            <select value={colFilterKey} onChange={e => setColFilterKey(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-slate-300 text-[9px]">
              <option value="">All Keys</option>
              {Array.from(new Set(tracks.map(t => t.analysis?.key).filter(Boolean))).sort().map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <div className="flex gap-1">
              <input type="number" placeholder="Min" min="0" max="100" value={colFilterEnergyMin} onChange={e => setColFilterEnergyMin(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-slate-300 text-[9px] w-12" />
              <input type="number" placeholder="Max" min="0" max="100" value={colFilterEnergyMax} onChange={e => setColFilterEnergyMax(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-slate-300 text-[9px] w-12" />
            </div>
            <button onClick={() => { setColFilterTitle(''); setColFilterArtist(''); setColFilterGenre(''); setColFilterKey(''); setColFilterBpmMin(''); setColFilterBpmMax(''); setColFilterEnergyMin(''); setColFilterEnergyMax(''); }} className="text-slate-400 hover:text-white text-[8px]">Clear</button>
          </div>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            {tracks.length > 0 ? (
              <>
                <Search size={48} className="mb-4 opacity-30" />
                <p className="text-sm font-medium">Aucun résultat</p>
                <p className="text-xs mt-1">Aucun morceau ne correspond à ta recherche</p>
                {searchQuery && <button onClick={() => setSearchQuery('')} className="mt-3 px-3 py-1 text-xs bg-cyan-600/20 text-cyan-400 rounded-lg hover:bg-cyan-600/30 transition-colors">Effacer la recherche</button>}
              </>
            ) : (
              <>
                <Headphones size={48} className="mb-4 opacity-30" />
                <p className="text-sm font-medium">Aucun morceau</p>
                <p className="text-xs mt-1">Glisse des fichiers audio ici ou clique sur &quot;Ajouter&quot;</p>
              </>
            )}
          </div>
        ) : tracksLoading ? (
          <div className="space-y-1 p-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 rounded bg-white/[0.03] animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
            ))}
          </div>
        ) : (
          filteredTracks.map((track, trackIdx) => {
            const a = track.analysis;
            const isActive = selectedTrack?.id === track.id;
            const isSelected = selectedIds.has(track.id);
            const isAnalyzing = track.status === 'analyzing' || track.status === 'pending';
                  const statusDot = track.status === 'completed' ? 'bg-green-400'
                    : track.status === 'failed' ? 'bg-red-400'
                    : isAnalyzing ? 'bg-yellow-400 animate-pulse' : 'bg-slate-500';
            return (
              <div
                key={track.id}
                data-track-id={track.id}
                className={`grid track-grid gap-2 px-4 py-2.5 items-center border-b border-slate-800/20 hover:bg-white/[0.04] cursor-pointer transition-all duration-150 group ${isActive ? 'bg-blue-500/15 border-l-2 border-l-blue-400 shadow-[inset_0_0_20px_rgba(59,130,246,0.05)]' : isSelected ? 'bg-purple-600/10 border-l-2 border-l-purple-500' : 'border-l-2 border-l-transparent'} ${trackIdx % 2 === 1 ? 'bg-white/[0.015]' : ''}`}
                style={{gridTemplateColumns: gridTemplate}}
                onClick={(e) => {
                  if (e.shiftKey && lastClickedIdxRef.current >= 0) {
                    // Shift+click range selection
                    const start = Math.min(lastClickedIdxRef.current, trackIdx);
                    const end = Math.max(lastClickedIdxRef.current, trackIdx);
                    const next = new Set(selectedIds);
                    for (let i = start; i <= end; i++) {
                      const t = filteredTracks[i];
                      if (t) next.add(t.id);
                    }
                    setSelectedIds(next);
                  } else if (e.ctrlKey || e.metaKey) {
                    toggleSelect(track.id, e);
                  } else {
                    setSelectedTrack(track);
                    setSelectedIds(new Set([track.id]));
                  }
                  lastClickedIdxRef.current = trackIdx;
                }}
                onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, track }); }}
              >
                {/* Checkbox / Play */}
                <div
                  className="flex items-center justify-center cursor-pointer relative"
                  onClick={(e) => { e.stopPropagation(); toggleSelect(track.id, e); }}
                >
                  <div className="group-hover:hidden">
                    {isSelected ? (
                      <CheckSquare size={15} className="text-cyan-500/70" />
                    ) : previewingTrackId === track.id ? (
                      <Pause size={15} className="text-cyan-400 animate-pulse" />
                    ) : (
                      <Square size={15} className="text-slate-700 transition-colors" />
                    )}
                  </div>
                  <button
                    className="hidden group-hover:flex items-center justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      const token = localStorage.getItem('cueforge_token');
                      if (previewingTrackId === track.id) {
                        previewAudioRef.current?.pause();
                        setPreviewingTrackId(null);
                      } else {
                        if (previewAudioRef.current) previewAudioRef.current.pause();
                        const audio = new Audio(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/tracks/${track.id}/audio?token=${token}`);
                        audio.volume = 0.5;
                        audio.play();
                        audio.onended = () => setPreviewingTrackId(null);
                        previewAudioRef.current = audio;
                        setPreviewingTrackId(track.id);
                      }
                    }}
                    title={previewingTrackId === track.id ? 'Arrêter' : 'Écouter'}
                  >
                    {previewingTrackId === track.id ? (
                      <Pause size={15} className="text-cyan-400" />
                    ) : (
                      <Play size={15} className="text-cyan-400" />
                    )}
                  </button>
                </div>

                {/* Title + Artist + Cover */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot}`} />
                  {track.artwork_url ? (
                    <img src={track.artwork_url} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0 shadow" />
                  ) : (
                    <div className="w-9 h-9 rounded bg-gradient-to-br from-slate-700/80 to-slate-800/80 flex items-center justify-center flex-shrink-0 relative">
                      <Music2 size={14} className="text-slate-600 group-hover:opacity-0 transition-opacity" />
                      <Play size={14} className="text-white absolute opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">
                      <button onClick={(e) => { e.stopPropagation(); toggleFavorite(track.id); }} className="inline-flex mr-1 hover:scale-125 transition-transform" title={favoriteIds.has(track.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
                        <Star size={12} className={favoriteIds.has(track.id) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600 hover:text-yellow-400'} />
                      </button>
                      {trackColors[track.id] && <span className="w-2 h-2 rounded-full inline-block mr-1 flex-shrink-0" style={{backgroundColor: trackColors[track.id]}} />}{track.title || track.original_filename}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {track.artist || '\u2014'}
                    </p>
                  </div>
                </div>
                {/* Artist */}
              <span className="text-xs text-slate-400 truncate">{track.artist || '—'}</span>
              {/* Album */}
              <span className="text-xs text-slate-400 truncate">{track.album || '—'}</span>
              {/* Genre */}
                <span className="text-xs text-slate-400 truncate cursor-pointer hover:text-yellow-400 hover:bg-gray-800/50 px-1 rounded transition-colors" title="Double-click to edit" onDoubleClick={() => { setInlineEditId(track.id); setInlineEditField('genre'); setInlineEditValue(track.genre || ''); }}>
                  {inlineEditId === track.id && inlineEditField === 'genre' ? (
                    <input autoFocus type="text" value={inlineEditValue} onChange={(e) => setInlineEditValue(e.target.value)} onBlur={() => { setTracks(prev => prev.map(t => t.id === track.id ? {...t, genre: inlineEditValue} : t)); setInlineEditId(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { setTracks(prev => prev.map(t => t.id === track.id ? {...t, genre: inlineEditValue} : t)); setInlineEditId(null); } if (e.key === 'Escape') setInlineEditId(null); }} className="bg-gray-900 text-yellow-400 text-xs px-1 py-0 rounded border border-yellow-500/50 outline-none w-20" onClick={(e) => e.stopPropagation()} />
                  ) : (track.genre?.split(',')[0]?.trim() || 'â')}
                </span>
                {/* BPM */}
                <div className="flex flex-col items-center">
                  <span title={a?.bpm ? `BPM: ${a.bpm.toFixed(2)} | ${a.bpm < 100 ? "Slow" : a.bpm < 130 ? "Medium" : a.bpm < 150 ? "Fast" : "Very Fast"}` : ""} className="text-xs text-blue-400 font-mono text-center font-bold cursor-help">
                  {a?.bpm ? a.bpm.toFixed(1) : '\u2014'}
                </span>
                  {selectedTrack && selectedTrack.id !== track.id && a?.bpm && selectedTrack.analysis?.bpm ? (() => { const diff = a.bpm - selectedTrack.analysis.bpm; const absDiff = Math.abs(diff); return <span className={"text-[8px] font-mono " + (absDiff < 3 ? "text-green-400" : absDiff < 8 ? "text-yellow-400" : "text-red-400")}>{diff > 0 ? '+' : ''}{diff.toFixed(1)}</span>; })() : null}
                </div>
                {/* Key (Camelot) + Compatibility */}
                <div title={a?.key ? `Tonalité: ${a.key} | Camelot: ${toCamelot(a.key)}` : ""} className="flex items-center justify-center gap-1 cursor-help">
                  <span className={"text-xs font-mono text-center font-bold " + (selectedTrack && selectedTrack.analysis?.key && a?.key && selectedTrack.id !== track.id && getCompatibleKeys(toCamelot(selectedTrack.analysis.key)).includes(toCamelot(a.key)) ? "text-green-400" : "text-cyan-400")} title={a?.key ? toCamelot(a.key) + (selectedTrack && selectedTrack.analysis?.key && a?.key && selectedTrack.id !== track.id && getCompatibleKeys(toCamelot(selectedTrack.analysis.key)).includes(toCamelot(a.key)) ? ' ✓ Compatible' : '') : ''}>
                    {toCamelot(a?.key)}
                  </span>
                  {selectedTrack && selectedTrack.id !== track.id && track.analysis?.key && selectedTrack.analysis?.key && (() => {
                    const score = mixScore(selectedTrack.analysis.key, selectedTrack.analysis.bpm || 0, track.analysis.key, track.analysis.bpm || 0);
                    const color = score.total >= 80 ? 'text-green-400 bg-green-500/20' : score.total >= 50 ? 'text-yellow-400 bg-yellow-500/20' : 'text-red-400 bg-red-500/20';
                    return <span className={`text-[10px] px-1 py-0.5 rounded font-bold ${color}`}>{score.total}%</span>;
                  })()}
                </div>
{/* Energy */}
                <div title={a?.energy != null ? `Énergie: ${Math.round(a.energy * 100)}% | ${a.energy < 0.3 ? "Calme" : a.energy < 0.6 ? "Modéré" : a.energy < 0.8 ? "Énergique" : "Très énergique"}` : ""} className="flex items-center justify-center gap-1 cursor-help">
                  <div className="w-10 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: ((a?.energy || 0) * 100) + '%', background: (a?.energy || 0) > 0.7 ? '#f59e0b' : (a?.energy || 0) > 0.4 ? '#22d3ee' : '#64748b' }} />
                  </div>
                  <span className="text-[10px] text-yellow-400 font-mono font-bold min-w-[12px]">{energyToRating(a?.energy)}</span>
                </div>
                {/* Duration */}
                <span title={(a?.duration_ms || track.duration_ms) ? `Durée: ${Math.floor((a?.duration_ms || track.duration_ms) / 60000)}m ${Math.floor(((a?.duration_ms || track.duration_ms) % 60000) / 1000)}s (${Math.round((a?.duration_ms || track.duration_ms) / 1000)}s total)` : ""} className="text-xs text-slate-500 font-mono text-center cursor-help">
                  {(a?.duration_ms || track.duration_ms) ? msToTime(a?.duration_ms || track.duration_ms) : '\u2014'}
                </span>
                {/* Status & Actions */}
                {track.status === 'analyzing' && (
                  <span className="text-sm text-cyan-400 animate-pulse" title="Analyse en cours...">⏳</span>
                )}
                {track.status === 'failed' && (
                  <button onClick={(e) => { e.stopPropagation(); reanalyzeTrack(track.id); }} className="text-sm text-orange-400 hover:text-orange-300 transition-colors cursor-pointer" title="Réanalyser">🔄</button>
                )}
                <button
                  onClick={e => { e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, track }); }}
                  className="p-1 text-slate-600 hover:text-slate-300 transition-colors"
                >
                  <MoreVertical size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* âÂÂâÂÂ Context Menu âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-bg-secondary border border-slate-700/80 rounded-xl shadow-2xl py-1 min-w-[260px]"
          style={{ left: Math.min(ctxMenu.x, window.innerWidth - 280), top: Math.min(ctxMenu.y, window.innerHeight - 350) }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-slate-800/40">
            <p className="text-xs font-bold text-white truncate">
              {ctxMenu.track.title || ctxMenu.track.original_filename}
            </p>
            <p className="text-[10px] text-slate-500">{ctxMenu.track.artist || ''}</p>
          </div>
          {CONTEXT_ACTIONS.map((a) => (
            <div key={a.action}>
              {a.separator && <div className="my-1 border-t border-slate-800/40" />}
              <button
                onClick={() => handleCtxAction(a.action, ctxMenu.track)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-300 hover:bg-bg-elevated hover:text-white transition-colors ${a.action === 'delete' ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10' : ''}`}
              >
                {a.icon}
                {a.label}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* BPM Tap Tool */}
      {showBpmTap && (
        <div className="fixed bottom-20 right-6 z-50 bg-gray-900 border border-gray-600/50 rounded-xl p-4 shadow-2xl backdrop-blur-xl w-64">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5"><Activity className="w-4 h-4 text-orange-400" /> BPM Tap</h3>
            <button onClick={() => { setShowBpmTap(false); setBpmTapTimes([]); setBpmTapResult(null); }} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="text-center mb-3">
            <div className="text-3xl font-bold text-orange-400 font-mono">{bpmTapResult ? bpmTapResult.toFixed(1) : '---'}</div>
            <div className="text-[10px] text-gray-500 mt-1">{bpmTapTimes.length} taps</div>
          </div>
          <button onClick={() => {
            const now = Date.now();
            setBpmTapTimes(prev => {
              const times = (prev.length > 0 && now - prev[prev.length - 1] > 3000) ? [now] : [...prev, now];
              if (times.length >= 2) {
                const intervals = [];
                for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i-1]);
                const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                setBpmTapResult(60000 / avgInterval);
              }
              return times.slice(-16);
            });
          }} className="w-full py-3 bg-orange-600/30 text-orange-300 rounded-lg hover:bg-orange-600/50 text-sm font-bold transition-colors border border-orange-500/30 active:scale-95">
            TAP
          </button>
          <div className="flex gap-2 mt-2">
            <button onClick={() => { setBpmTapTimes([]); setBpmTapResult(null); }} className="flex-1 py-1.5 bg-gray-700/50 text-gray-400 rounded text-[10px] hover:bg-gray-600/50 transition-colors">Reset</button>
            {bpmTapResult && selectedTrack && (
              <button onClick={() => {
                setTracks(prev => prev.map(t => t.id === selectedTrack.id ? {...t, analysis: {...(t.analysis || {}), bpm: Math.round(bpmTapResult * 10) / 10}} : t));
                setSelectedTrack(prev => prev ? {...prev, analysis: {...(prev.analysis || {}), bpm: Math.round(bpmTapResult * 10) / 10}} : prev);
                setShowBpmTap(false); setBpmTapTimes([]); setBpmTapResult(null);
              }} className="flex-1 py-1.5 bg-green-600/30 text-green-300 rounded text-[10px] hover:bg-green-600/50 transition-colors">Apply to Track</button>
            )}
          </div>
        </div>
      )}
      {/* Mix Transition Log */}
      {mixLog.length > 0 && (
        <div className="fixed top-20 right-4 z-40 bg-gray-900/95 border border-gray-700/50 rounded-xl p-3 shadow-xl backdrop-blur-xl w-56 max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1"><Clock className="w-3 h-3" /> Mix Log</h4>
            <button onClick={() => setMixLog([])} className="text-gray-500 hover:text-gray-300 text-[9px]">Clear</button>
          </div>
          {mixLog.slice(0, 8).map((entry, i) => {
            const fromTrack = tracks.find(t => t.id === entry.fromId);
            const toTrack = tracks.find(t => t.id === entry.toId);
            const scoreColor = entry.score >= 80 ? 'text-green-400' : entry.score >= 60 ? 'text-yellow-400' : 'text-red-400';
            return (
              <div key={i} className="flex items-center gap-1.5 py-1 border-b border-gray-800/50 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] text-gray-400 truncate">{fromTrack?.title || '?'}</div>
                  <div className="text-[8px] text-gray-600 flex items-center gap-0.5"><ArrowUpDown className="w-2.5 h-2.5" /></div>
                  <div className="text-[9px] text-gray-400 truncate">{toTrack?.title || '?'}</div>
                </div>
                <span className={"text-[10px] font-bold font-mono " + scoreColor}>{entry.score}%</span>
              </div>
            );
          })}
        </div>
      )}
      {/* Batch Actions Floating Bar */}
      {selectedIds.size > 1 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border border-gray-600/50 rounded-xl px-5 py-3 shadow-2xl flex items-center gap-4 backdrop-blur-xl">
          <span className="text-sm font-medium text-white">{selectedIds.size} tracks</span>
          <div className="w-px h-6 bg-gray-600" />
          <button onClick={() => { const ids = Array.from(selectedIds); setSetLists(prev => prev.map((s, i) => i === activeSetList ? {...s, trackIds: [...new Set([...s.trackIds, ...ids])]} : s)); setSelectedIds(new Set()); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/30 text-blue-300 rounded-lg hover:bg-blue-600/50 text-xs font-medium transition-colors">
            <ListPlus className="w-3.5 h-3.5" /> Add to Set List
          </button>
          <button onClick={async () => { if (!confirm('Delete ' + selectedIds.size + ' tracks?')) return; for (const id of selectedIds) { try { await deleteTrack(id); } catch(e) {} } setTracks(prev => prev.filter(t => !selectedIds.has(t.id))); if (selectedTrack && selectedIds.has(selectedTrack.id)) setSelectedTrack(null); setSelectedIds(new Set()); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/30 text-red-300 rounded-lg hover:bg-red-600/50 text-xs font-medium transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg hover:bg-gray-600/50 text-xs font-medium transition-colors">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      )}
      {/* âÂÂâÂÂ Track Organizer Panel âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ */}
      {organizerTrack && (
        <TrackOrganizer
          track={organizerTrack}
          onClose={() => setOrganizerTrack(null)}
          onUpdate={(updated) => {
            setOrganizerTrack(null);
            setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            if (selectedTrack?.id === updated.id) setSelectedTrack(updated);
          }}
        />
      )}

      {/* âÂÂâÂÂ Metadata / Spotify Panel (slide-in, closable) âÂÂâÂÂâÂÂâÂÂ */}
      {metadataPanel && (
        <>
          {/* Backdrop overlay */}
          <div className="fixed inset-0 bg-black/30 z-30" onClick={() => setMetadataPanel(null)} />
          <div className="fixed inset-y-0 right-0 w-[420px] max-w-full bg-bg-secondary border-l border-slate-800/60 z-40 shadow-2xl overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/40 sticky top-0 bg-bg-secondary z-10">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles size={16} className="text-green-400" />
                Metadata & Spotify
              </h3>
              <button onClick={() => setMetadataPanel(null)} className="p-1 text-slate-500 hover:text-white rounded-lg hover:bg-slate-700/50 transition-all">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Current cover + info */}
              <div className="flex items-start gap-4">
                {metadataPanel.artwork_url ? (
                  <img src={metadataPanel.artwork_url} alt="" className="w-24 h-24 rounded-xl object-cover shadow-xl" />
                ) : (
                  <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center shadow-xl">
                    <Image size={28} className="text-slate-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-white font-bold truncate">{metadataPanel.title || metadataPanel.original_filename}</p>
                  <p className="text-sm text-slate-400 truncate">{metadataPanel.artist || 'Artiste inconnu'}</p>
                  <p className="text-xs text-slate-500 truncate">{metadataPanel.album || 'Album inconnu'}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {metadataPanel.genre && (
                      <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-cyan-400/80 rounded-full border border-purple-500/30">
                        {metadataPanel.genre.split(',')[0].trim()}
                      </span>
                    )}
                    {metadataPanel.year && (
                      <span className="text-[10px] px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded-full">
                        {metadataPanel.year}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Spotify link if available */}
              {metadataPanel.spotify_url && (
                <a href={metadataPanel.spotify_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-600/10 hover:bg-green-600/20 border border-green-500/30 rounded-xl text-green-400 text-xs font-semibold transition-all">
                  <ExternalLink size={14} />
                  Ouvrir sur Spotify
                </a>
              )}

              {/* Current metadata */}
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Informations actuelles</p>
                <div className="space-y-2 text-xs">
                  <MetaRow label="Fichier" value={metadataPanel.original_filename} />
                  <MetaRow label="Artiste" value={metadataPanel.artist || '\u2014'} />
                  <MetaRow label="Titre" value={metadataPanel.title || '\u2014'} />
                  <MetaRow label="Album" value={metadataPanel.album || '\u2014'} />
                  <MetaRow label="Genre" value={metadataPanel.genre || '\u2014'} />
                  <MetaRow label="Année" value={metadataPanel.year?.toString() || '\u2014'} />
                </div>
              </div>

              {/* Suggestions from analysis */}
              {metadataLoading && (
                <div className="flex items-center justify-center gap-3 py-8">
                  <Loader2 size={20} className="animate-spin text-green-400" />
                  <span className="text-sm text-slate-400">Recherche en cours...</span>
                </div>
              )}

              {metadataSuggestions && !metadataLoading && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    {Object.keys(metadataSuggestions).length > 0 ? 'Suggestions trouvées' : 'Aucune suggestion'}
                  </p>
                  {Object.keys(metadataSuggestions).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(metadataSuggestions)
                        .filter(([k]) => k !== 'artwork_url' && k !== 'spotify_url')
                        .map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between p-2.5 bg-green-500/5 border border-green-500/20 rounded-lg">
                            <div className="min-w-0">
                              <span className="text-[10px] text-slate-500 uppercase">{key}</span>
                              <p className="text-xs text-green-400 font-medium truncate">{value}</p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                              <span className="text-[10px] text-yellow-400/70 flex items-center gap-0.5">
                                <AlertTriangle size={10} />
                                Suggestion
                              </span>
                            </div>
                          </div>
                        ))}
                      <p className="text-[10px] text-slate-500 mt-2 italic">
                        Les suggestions ont été appliquées automatiquement. Si elles sont incorrectes, vous pouvez modifier les tags manuellement.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-4">
                      Aucune nouvelle information trouvée pour ce morceau.
                    </p>
                  )}
                </div>
              )}




              {/* Search button if no suggestions yet */}
              {!metadataSuggestions && !metadataLoading && (
                <div className="text-center py-4">
                  <button
                    onClick={() => launchSpotifySearch(metadataPanel)}
                    className="px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-green-600/20"
                  >
                    <Search size={13} className="inline mr-2" />
                    Lancer la recherche Spotify
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      </>
) : (
<div className="flex-1 flex flex-col overflow-y-auto p-4">
  {/* Module View - replaces track list */}
  {activeBottomTab === 'cues' && selectedTrack && (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Cue Points — {selectedTrack.title}</h3>
      <div className="grid grid-cols-8 gap-2">
        {Array.from({length: 8}).map((_, i) => {
          const cue = selectedTrack.cue_points?.[i];
          return (
            <button key={i} onClick={() => {
              if (cue && wavesurferRef.current) {
                wavesurferRef.current.seekTo(cue.time_ms / (selectedTrack.analysis?.duration_ms || selectedTrack.duration_ms || 1));
              }
            }} className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${cue ? 'border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 cursor-pointer' : 'border-gray-800/40 bg-gray-900/30 opacity-40'}`}>
              <span className="text-lg font-bold" style={{color: cueColors[i] || '#06b6d4'}}>{String.fromCodePoint(0x2776 + i)}</span>
              <span className="text-[10px] text-gray-400">{cue ? cue.label || 'Cue ' + (i+1) : '—'}</span>
              <span className="text-[9px] text-gray-600">{cue ? (cue.time_ms / 1000).toFixed(1) + 's' : ''}</span>
            </button>
          );
        })}
      </div>
      {selectedTrack.cue_points && selectedTrack.cue_points.length > 0 && (
        <div className="space-y-1 mt-4">
          <h4 className="text-xs font-semibold text-gray-400">Détails des cues</h4>
          {selectedTrack.cue_points.map((cue: any, i: number) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 bg-gray-900/50 rounded-lg border border-gray-800/30 hover:bg-gray-800/50 transition-colors cursor-pointer" onClick={() => wavesurferRef.current?.seekTo(cue.time_ms / (selectedTrack.analysis?.duration_ms || selectedTrack.duration_ms || 1))}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{backgroundColor: (cueColors[i] || '#06b6d4') + '30', color: cueColors[i] || '#06b6d4'}}>{i+1}</span>
              <span className="text-xs text-white font-medium flex-1">{cue.label || 'Cue ' + (i+1)}</span>
              <span className="text-[10px] text-gray-500">{(cue.time_ms / 1000).toFixed(2)}s</span>
              <span className="text-[10px] text-gray-600">{cue.type || 'hot_cue'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )}
  {activeBottomTab === 'eq' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                    <SlidersHorizontal size={16} /> EQ Controls
                  </h3>
                  <div className="flex items-center gap-2">
                    {!eqConnected && <button onClick={connectEQ} className="px-3 py-1 text-[10px] font-bold bg-cyan-500/20 text-cyan-400 rounded-md border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors">Connect Audio</button>}
                    {eqConnected && <span className="text-[10px] text-green-400 flex items-center gap-1"><Check size={10} /> Connected</span>}
                    <button onClick={() => { updateEQ('low', 0); updateEQ('mid', 0); updateEQ('high', 0); }} className="px-2 py-1 text-[10px] font-bold bg-gray-800 text-gray-400 rounded-md hover:bg-gray-700 transition-colors">Reset</button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {([['low', 'LOW', '#ef4444', eqValues.low], ['mid', 'MID', '#eab308', eqValues.mid], ['high', 'HIGH', '#3b82f6', eqValues.high]] as const).map(([band, label, color, val]) => (
                    <div key={band} className="flex flex-col items-center gap-2 p-3 bg-gray-900/60 rounded-xl border border-gray-800/40">
                      <span className="text-xs font-bold" style={{color}}>{label}</span>
                      <div className="relative w-full h-32 bg-gray-950 rounded-lg overflow-hidden">
                        <div className="absolute bottom-0 w-full rounded-b-lg transition-all duration-150" style={{height: `${Math.max(5, 50 + (val as number) / 12 * 50)}%`, background: `linear-gradient(to top, ${color}44, ${color}bb)`}} />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-lg font-bold text-white drop-shadow-lg">{(val as number) > 0 ? '+' : ''}{(val as number).toFixed(1)}</span>
                        </div>
                      </div>
                      <input type="range" min={-12} max={12} step={0.5} value={val as number} onChange={(e) => updateEQ(band as 'low'|'mid'|'high', parseFloat(e.target.value))} className="w-full h-2 rounded-lg appearance-none cursor-pointer" style={{accentColor: color}} />
                      <span className="text-[10px] text-gray-500">dB</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  {[{name: 'Flat', l: 0, m: 0, h: 0}, {name: 'Bass Boost', l: 6, m: 0, h: -2}, {name: 'Vocal', l: -3, m: 4, h: 2}, {name: 'Treble', l: -4, m: 0, h: 6}].map(p => (
                    <button key={p.name} onClick={() => { updateEQ('low', p.l); updateEQ('mid', p.m); updateEQ('high', p.h); }} className="flex-1 px-2 py-1.5 text-[10px] font-bold bg-gray-800/60 text-gray-300 rounded-lg border border-gray-700/40 hover:bg-cyan-500/10 hover:border-cyan-500/30 hover:text-cyan-400 transition-all">{p.name}</button>
                  ))}
                </div>
                {!eqConnected && <p className="text-[10px] text-amber-500/80 italic">Click "Connect Audio" to enable real-time EQ via Web Audio API</p>}
              </div>
            )}
            {activeBottomTab === 'fx' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2"><Wand2 size={16} /> FX Rack</h3>
                <div className="grid grid-cols-3 gap-2">
                  {[{id: 'reverb', name: 'Reverb', icon: '~'}, {id: 'delay', name: 'Delay', icon: '...'}, {id: 'echo', name: 'Echo', icon: '))'}, {id: 'flanger', name: 'Flanger', icon: 'F'}, {id: 'phaser', name: 'Phaser', icon: 'P'}, {id: 'filter', name: 'Filter', icon: 'V'}].map(fx => (
                    <button key={fx.id} onClick={() => setActiveFx(activeFx === fx.id ? null : fx.id)} className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${activeFx === fx.id ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 shadow-lg shadow-purple-500/10' : 'bg-gray-900/50 border-gray-800/40 text-gray-400 hover:border-purple-500/30 hover:text-purple-300'}`}>
                      <span className="text-lg font-bold">{fx.icon}</span>
                      <span className="text-[10px] font-semibold uppercase">{fx.name}</span>
                    </button>
                  ))}
                </div>
                {activeFx && (
                  <div className="p-4 bg-gray-900/60 rounded-xl border border-purple-500/20">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-purple-300 uppercase">{activeFx} Parameters</span>
                      <button onClick={() => setFxParams(prev => ({...prev, [activeFx]: 0}))} className="text-[10px] text-gray-500 hover:text-white">Reset</button>
                    </div>
                    <div className="space-y-3">
                      <div><label className="text-[10px] text-gray-400 block mb-1">Dry/Wet</label><input type="range" min={0} max={100} value={fxParams[activeFx] || 0} onChange={(e) => setFxParams(prev => ({...prev, [activeFx]: parseInt(e.target.value)}))} className="w-full accent-purple-500" /><div className="flex justify-between text-[9px] text-gray-600"><span>Dry</span><span>{fxParams[activeFx] || 0}%</span><span>Wet</span></div></div>
                      <div><label className="text-[10px] text-gray-400 block mb-1">Rate</label><input type="range" min={0} max={100} defaultValue={50} className="w-full accent-purple-400" /></div>
                      <div><label className="text-[10px] text-gray-400 block mb-1">Depth</label><input type="range" min={0} max={100} defaultValue={30} className="w-full accent-purple-300" /></div>
                    </div>
                    <p className="text-[9px] text-amber-500/60 mt-2 italic">Real-time FX processing coming soon</p>
                  </div>
                )}
                {!activeFx && <p className="text-[10px] text-gray-600 italic text-center py-4">Select an effect to adjust parameters</p>}
              </div>
            )}
            {activeBottomTab === 'mix' && (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Mix Assistant</h3>
      {selectedTrack ? (
        <div className="space-y-3">
          <div className="p-3 bg-gray-900/50 rounded-xl border border-gray-800/40">
            <span className="text-xs text-gray-400">Morceau actuel:</span>
            <p className="text-sm font-semibold text-white">{selectedTrack.title}</p>
            <div className="flex gap-4 mt-1">
              <span className="text-xs text-cyan-400">{selectedTrack.analysis?.bpm?.toFixed(1)} BPM</span>
              <span className="text-xs text-purple-400">{toCamelot(selectedTrack.analysis?.key || '')}</span>
              <span className="text-xs text-green-400">Energy: {selectedTrack.analysis?.energy?.toFixed(0)}%</span>
            </div>
          </div>
          <h4 className="text-xs font-semibold text-gray-400">Meilleurs enchaînements</h4>
          <div className="space-y-1">
            {filteredTracks
              .filter(t => t.id !== selectedTrack.id && t.analysis?.key && t.analysis?.bpm)
              .map(t => ({track: t, score: mixScore(selectedTrack.analysis?.key || '', selectedTrack.analysis?.bpm || 0, t.analysis?.key || '', t.analysis?.bpm || 0)}))
              .sort((a, b) => b.score.total - a.score.total)
              .slice(0, 10)
              .map(({track: t, score}) => (
                <div key={t.id} onClick={() => setSelectedTrack(t)} className="flex items-center gap-3 px-3 py-2 bg-gray-900/40 rounded-lg border border-gray-800/30 hover:bg-gray-800/50 cursor-pointer transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${score.total >= 80 ? 'bg-green-500/20 text-green-400' : score.total >= 60 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>{score.total}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white font-medium truncate">{t.title}</p>
                    <p className="text-[10px] text-gray-500 truncate">{t.artist || 'Unknown'}</p>
                  </div>
                  <span className="text-[10px] text-cyan-400">{t.analysis?.bpm?.toFixed(1)}</span>
                  <span className="text-[10px] text-purple-400">{toCamelot(t.analysis?.key || '')}</span>
                  <span className="text-[10px] text-gray-500">{score.verdict}</span>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-500">Sélectionne un morceau pour voir les suggestions de mix</p>
      )}
    </div>
  )}
  {activeBottomTab === 'playlists' && (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Playlists</h3>
      {setList.length > 0 ? (
        <div className="space-y-1">
          {setList.map((t: any, i: number) => (
            <div key={t.id || i} className="flex items-center gap-3 px-3 py-2 bg-gray-900/40 rounded-lg border border-gray-800/30">
              <span className="text-xs font-bold text-gray-600 w-6">{i+1}</span>
              <span className="text-xs text-white flex-1 truncate">{t.title}</span>
              <span className="text-[10px] text-cyan-400">{t.analysis?.bpm?.toFixed(1)}</span>
              <span className="text-[10px] text-purple-400">{toCamelot(t.analysis?.key || '')}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500">Aucun morceau dans la set list. Ajoute des morceaux depuis la liste.</p>
      )}
    </div>
  )}
  {activeBottomTab === 'history' && (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Historique de lecture</h3>
      {playHistory.length > 0 ? (
        <div className="space-y-1">
          {playHistory.slice().reverse().map((entry: any, i: number) => {
            const t = tracks.find((tr: any) => tr.id === entry.trackId);
            return t ? (
              <div key={i} className="flex items-center gap-3 px-3 py-2 bg-gray-900/40 rounded-lg border border-gray-800/30 hover:bg-gray-800/50 cursor-pointer transition-colors" onClick={() => setSelectedTrack(t)}>
                <span className="text-[10px] text-gray-600 w-16">{new Date(entry.timestamp).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}</span>
                <span className="text-xs text-white flex-1 truncate">{t.title}</span>
                <span className="text-[10px] text-gray-500">{t.artist || ''}</span>
              </div>
            ) : null;
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-500">Aucun historique encore.</p>
      )}
    </div>
  )}
  {activeBottomTab === 'stats' && (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Statistiques de la collection</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 bg-gray-900/50 rounded-xl border border-gray-800/40 text-center">
          <p className="text-2xl font-bold text-white">{tracks.length}</p>
          <p className="text-[10px] text-gray-500">Morceaux</p>
        </div>
        <div className="p-3 bg-gray-900/50 rounded-xl border border-gray-800/40 text-center">
          <p className="text-2xl font-bold text-cyan-400">{tracks.filter((t: any) => t.analysis?.bpm).length}</p>
          <p className="text-[10px] text-gray-500">Analysés</p>
        </div>
        <div className="p-3 bg-gray-900/50 rounded-xl border border-gray-800/40 text-center">
          <p className="text-2xl font-bold text-purple-400">{new Set(tracks.map((t: any) => t.analysis?.genre).filter(Boolean)).size}</p>
          <p className="text-[10px] text-gray-500">Genres</p>
        </div>
        <div className="p-3 bg-gray-900/50 rounded-xl border border-gray-800/40 text-center">
          <p className="text-2xl font-bold text-green-400">{tracks.filter((t: any) => t.analysis?.energy && t.analysis.energy >= 70).length}</p>
          <p className="text-[10px] text-gray-500">High Energy</p>
        </div>
      </div>
      {tracks.length > 0 && (() => {
        const bpms = tracks.filter((t: any) => t.analysis?.bpm).map((t: any) => t.analysis.bpm);
        const avgBpm = bpms.length > 0 ? (bpms.reduce((a: number, b: number) => a + b, 0) / bpms.length) : 0;
        const energies = tracks.filter((t: any) => t.analysis?.energy).map((t: any) => t.analysis.energy);
        const avgEnergy = energies.length > 0 ? (energies.reduce((a: number, b: number) => a + b, 0) / energies.length) : 0;
        return (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-gray-900/50 rounded-xl border border-gray-800/40">
              <p className="text-xs text-gray-400 mb-1">BPM moyen</p>
              <p className="text-lg font-bold text-cyan-400">{avgBpm.toFixed(1)}</p>
            </div>
            <div className="p-3 bg-gray-900/50 rounded-xl border border-gray-800/40">
              <p className="text-xs text-gray-400 mb-1">Energy moyenne</p>
              <p className="text-lg font-bold text-green-400">{avgEnergy.toFixed(0)}%</p>
            </div>
          </div>
        );
      })()}
    </div>
  )}
</div>
)}
</div>{/* end center */}
      {/* COLOR PICKER POPUP */}
      {colorPickerCue !== null && (
        <div className="fixed inset-0 z-50" onClick={() => setColorPickerCue(null)}>
          <div
            className="absolute bg-gray-900 border border-gray-700 rounded-lg p-2 shadow-2xl"
            style={{ left: colorPickerPos.x, top: colorPickerPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] text-gray-400 mb-1.5 px-1">Cue Color</div>
            <div className="grid grid-cols-4 gap-1.5">
              {REKORDBOX_COLORS.map((c) => (
                <button
                  key={c.hex}
                  className="w-7 h-7 rounded-md border-2 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.hex, borderColor: cueColors[colorPickerCue] === c.hex ? '#fff' : 'transparent' }}
                  title={c.name}
                  onClick={() => {
                    setCueColors((prev) => ({ ...prev, [colorPickerCue]: c.hex }));
                    setColorPickerCue(null);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={`${rightPanelExpanded ? "w-[700px]" : "w-96"} flex-shrink-0 border-l border-gray-800/50 flex flex-col overflow-y-auto bg-gray-950/90 transition-all duration-300`}>
      <div className="p-2">
        <div className="bg-gray-900/95 backdrop-blur-sm border-t border-gray-800/80">
        {/* Tab Bar */}
        <div className="flex items-center border-b border-gray-800/50 px-1">
          {[
            { id: 'cues', label: 'CUES' },
            { id: 'eq', label: 'EQ' },
            { id: 'fx', label: 'FX' },
            { id: 'mix', label: 'MIX' },
            { id: 'playlists', label: 'PLAYLISTS' },
            { id: 'history', label: 'HISTORY' },
            { id: 'stats', label: 'STATS' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveBottomTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.15em] transition-all duration-200 ${
                activeBottomTab === tab.id
                  ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-400/5'
                  : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent hover:bg-white/[0.02]'
              }`}>{tab.label}</button>
          ))}
          <button
            onClick={() => setRightPanelExpanded((p) => !p)}
            className="ml-auto px-2.5 py-2 text-gray-400 hover:text-cyan-400 hover:bg-cyan-400/10 rounded transition-all"
            title={rightPanelExpanded ? 'Collapse panel' : 'Expand panel'}
          >
            {rightPanelExpanded ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-3">
          {activeBottomTab === 'cues' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-cyan-400 tracking-widest">CUE POINTS</span>
                <button onClick={() => { if (selectedTrack && wavesurferRef.current) { const pos = wavesurferRef.current.getCurrentTime() * 1000; createCuePoint(selectedTrack.id, { position_ms: pos, label: 'Cue ' + ((selectedTrack.cue_points?.length || 0) + 1), type: 'cue' }).then(() => { const fresh = getTrack(selectedTrack.id); fresh.then((t) => setSelectedTrack(t)).catch(() => {}); }).catch(() => {}); } }} className="text-[10px] px-2 py-0.5 rounded bg-cyan-600/30 text-cyan-300 hover:bg-cyan-600/50 transition-colors">+ Add Cue</button>
              </div>
              {(!selectedTrack?.cue_points || selectedTrack.cue_points.length === 0) ? (
                <p className="text-gray-500 text-xs text-center py-4">No cue points yet. Analyze the track or add manually.</p>
              ) : (
                <div className="space-y-1 max-h-[300px] overflow-y-auto scrollbar-thin">
                  {selectedTrack.cue_points.map((cue, idx) => (
                    <div key={cue.id || idx} className="flex items-center gap-2 p-1.5 rounded bg-gray-800/40 hover:bg-gray-800/60 cursor-pointer group transition-colors" onClick={() => { if (wavesurferRef.current) { const dur = wavesurferRef.current.getDuration(); if (dur > 0) wavesurferRef.current.seekTo((cue.position_ms || cue.time) / (dur * 1000)); } }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setColorPickerCue(cue.id || idx); setColorPickerPos({x: e.clientX, y: e.clientY}); }}>
                      <div className="w-4 h-4 rounded-full flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-white/50 transition-all" style={{backgroundColor: getCueColor(cue.id || idx, idx)}} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-white font-medium truncate">{cue.label || cue.name || ('Cue ' + (idx + 1))}</div>
                        <div className="text-[9px] text-gray-400">{Math.floor((cue.position_ms || cue.time || 0) / 60000) + ':' + String(Math.floor(((cue.position_ms || cue.time || 0) % 60000) / 1000)).padStart(2, '0') + '.' + String(Math.floor(((cue.position_ms || cue.time || 0) % 1000) / 10)).padStart(2, '0')} {cue.type ? (' · ' + cue.type) : ''}</div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); if (cue.id) { deleteCuePoint(cue.id).then(() => { getTrack(selectedTrack.id).then((t) => setSelectedTrack(t)).catch(() => {}); }).catch(() => {}); } }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 p-1 transition-opacity">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {activeBottomTab === 'eq' && (
            <div>
{/* EQ 3-Band Controls */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Disc className="w-4 h-4 text-cyan-400" /> EQ Controls
          </h3>
          <button onClick={() => { setEqLow(50); setEqMid(50); setEqHigh(50); }} className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-700">Reset</button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-red-400 w-10">LOW</span>
            <input type="range" min={0} max={100} value={eqLow} onChange={(e) => setEqLow(Number(e.target.value))} className="flex-1 accent-red-500" />
            <span className="text-xs text-gray-300 w-8">{eqLow}%</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-yellow-400 w-10">MID</span>
            <input type="range" min={0} max={100} value={eqMid} onChange={(e) => setEqMid(Number(e.target.value))} className="flex-1 accent-yellow-500" />
            <span className="text-xs text-gray-300 w-8">{eqMid}%</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-blue-400 w-10">HIGH</span>
            <input type="range" min={0} max={100} value={eqHigh} onChange={(e) => setEqHigh(Number(e.target.value))} className="flex-1 accent-blue-500" />
            <span className="text-xs text-gray-300 w-8">{eqHigh}%</span>
          </div>
        </div>
      </div>

      
            </div>
          )}
          {activeBottomTab === 'fx' && (
            <div>
{/* FX Rack */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <Wand2 className="w-4 h-4 text-cyan-500/70" /> FX Rack
        </h3>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {["Reverb", "Delay", "Echo", "Flanger", "Phaser", "Filter"].map(function(fxName) {
            return (
              <button key={fxName} onClick={() => setActiveFx(activeFx === fxName ? "" : fxName)}
                className={activeFx === fxName ? "px-2 py-1 rounded text-xs font-medium bg-purple-600 text-white" : "px-2 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600"}
              >{fxName}</button>
            );
          })}
        </div>
        {activeFx ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-cyan-400/80 w-8">Wet</span>
            <input type="range" min={0} max={100} value={fxWet} onChange={(e) => setFxWet(Number(e.target.value))} className="flex-1 accent-purple-500" />
            <span className="text-xs text-gray-300 w-8">{fxWet}%</span>
          </div>
        ) : (
          <p className="text-xs text-gray-500 text-center">Select an effect</p>
        )}
      </div>

      
            </div>
          )}
          {activeBottomTab === 'mix' && (
            <div>
{/* Mix Controls */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <Volume2 className="w-4 h-4 text-green-400" /> Mix Controls
        </h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-green-400 w-14">Master</span>
            <input type="range" min={0} max={100} value={masterGain} onChange={(e) => setMasterGain(Number(e.target.value))} className="flex-1 accent-green-500" />
            <span className="text-xs text-gray-300 w-8">{masterGain}%</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-orange-400 w-14">X-Fade</span>
            <input type="range" min={0} max={100} value={crossfader} onChange={(e) => setCrossfader(Number(e.target.value))} className="flex-1 accent-orange-500" />
            <span className="text-xs text-gray-300 w-8">{crossfader}%</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-sky-400 w-14">Pitch</span>
            <input type="range" min={-12} max={12} value={pitchShift} onChange={(e) => setPitchShift(Number(e.target.value))} className="flex-1 accent-sky-500" />
            <span className="text-xs text-gray-300 w-8">{pitchShift > 0 ? "+" : ""}{pitchShift}</span>
          </div>
        </div>
      </div>

      {/* Harmonic Mix Suggestions */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700 mt-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <Music className="w-4 h-4 text-purple-400" /> Harmonic Mix Suggestions
        </h3>
        {selectedTrack?.analysis?.key ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-400">Current:</span>
              <span className="text-xs font-bold text-purple-300 truncate max-w-[120px]">{selectedTrack.title}</span>
              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">
                {CAMELOT_WHEEL[selectedTrack.analysis.key] || selectedTrack.analysis.key} • {selectedTrack.analysis.bpm?.toFixed(0)} BPM
              </span>
            </div>
            <div className="max-h-[180px] overflow-y-auto space-y-1 scrollbar-thin">
              {tracks
                .filter(t => t.id !== selectedTrack.id && t.analysis?.key && t.analysis?.bpm)
                .map(t => ({ ...t, score: mixScore(selectedTrack.analysis.key || '', selectedTrack.analysis.bpm, t.analysis.key || '', t.analysis.bpm) }))
                .filter(t => t.score.total >= 60)
                .sort((a, b) => b.score.total - a.score.total)
                .slice(0, 10)
                .map(t => (
                  <div key={t.id} onClick={() => setSelectedTrack(t)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 cursor-pointer transition-colors group">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ${t.score.verdict === 'Perfect' ? 'bg-green-500/20 text-green-400' : t.score.verdict === 'Great' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      {t.score.total}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white truncate group-hover:text-purple-300 transition-colors">{t.title}</div>
                      <div className="text-[10px] text-gray-500">{t.artist || 'Unknown'}</div>
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 text-[10px] font-mono">
                      {CAMELOT_WHEEL[t.analysis.key] || t.analysis.key}
                    </span>
                    <span className="text-[10px] text-gray-400 w-12 text-right">{t.analysis.bpm?.toFixed(0)}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${t.score.verdict === 'Perfect' ? 'bg-green-500/20 text-green-400' : t.score.verdict === 'Great' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      {t.score.verdict}
                    </span>
                  </div>
                ))
              }
              {tracks.filter(t => t.id !== selectedTrack.id && t.analysis?.key && t.analysis?.bpm).filter(t => mixScore(selectedTrack.analysis.key || '', selectedTrack.analysis.bpm, t.analysis.key || '', t.analysis.bpm).total >= 60).length === 0 && (
                <div className="text-center py-4 text-gray-500 text-xs">No compatible tracks found. Analyze more tracks.</div>
              )}
              {/* Track Comparison */}
              {selectedTrack && tracks.length >= 2 && (
                <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-3 mt-3 border border-gray-700/50">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                    <Compass className="w-4 h-4 text-orange-400" /> Quick Compare
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {tracks.filter(tr => tr.id !== selectedTrack?.id).slice(0, 4).map(tr => {
                      const score = typeof mixScore === 'function' ? mixScore(selectedTrack, tr) : {total: 0, verdict: '?'};
                      const bpmDiff = Math.abs((selectedTrack?.bpm || 0) - (tr.bpm || 0));
                      return (
                        <div key={tr.id} onClick={() => setSelectedTrack(tr)}
                          className="p-2 bg-gray-900/60 rounded border border-gray-700/30 cursor-pointer hover:border-orange-500/50 transition-colors">
                          <div className="text-[9px] text-white truncate font-medium">{tr.title}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[8px] text-cyan-400">{tr.bpm?.toFixed(0) || '?'}</span>
                            <span className="text-[8px] text-purple-400">{CAMELOT_WHEEL[tr.key] || tr.key || '?'}</span>
                            <span className={"text-[8px] font-bold " + (score.verdict === 'Perfect' ? 'text-green-400' : score.verdict === 'Great' ? 'text-blue-400' : score.verdict === 'Good' ? 'text-yellow-400' : 'text-red-400')}>
                              {score.verdict}
                            </span>
                          </div>
                          <div className="text-[8px] text-gray-500 mt-0.5">BPM diff: {bpmDiff.toFixed(1)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-gray-500 text-xs">
            <Music className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Select an analyzed track to see harmonic mix suggestions
          </div>
        )}
      </div>

      
            </div>
          )}
          {activeBottomTab === 'playlists' && (
            <div>
{/* Playlist Manager */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <Folder className="w-4 h-4 text-amber-400" /> Playlists
        </h3>
        <div className="flex gap-2 mb-3">
          <input type="text" value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} placeholder="New playlist..." className="flex-1 bg-gray-700 rounded px-2 py-1 text-xs text-white border border-gray-600 focus:border-amber-500 outline-none" />
          <button onClick={() => { if (newPlaylistName.trim()) { var n = newPlaylistName.trim(); var next = Object.assign({}, playlists); next[n] = []; setPlaylists(next); setCurrentPlaylist(n); setNewPlaylistName(""); } }} className="px-2 py-1 rounded text-xs bg-amber-600 text-white hover:bg-amber-500">+</button>
        </div>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {Object.keys(playlists).length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-2">No playlists yet</p>
          ) : Object.keys(playlists).map(function(name) {
            return (
              <button key={name} onClick={() => setCurrentPlaylist(name)}
                className={currentPlaylist === name ? "w-full text-left px-2 py-1 rounded text-xs bg-amber-600 text-white" : "w-full text-left px-2 py-1 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600"}
              >{name} ({playlists[name].length})</button>
            );
          })}
        </div>
      </div>

      
            
            {/* Set List Builder */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700 mt-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                <ListMusic className="w-4 h-4 text-cyan-400" /> Set List Builder
              </h3>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newSetListName}
                  onChange={(e) => setNewSetListName(e.target.value)}
                  placeholder="New set list name..."
                  className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newSetListName.trim()) {
                      setSetLists(prev => [...prev, {name: newSetListName.trim(), trackIds: []}]);
                      setNewSetListName('');
                      setActiveSetList(setLists.length);
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (newSetListName.trim()) {
                      setSetLists(prev => [...prev, {name: newSetListName.trim(), trackIds: []}]);
                      setNewSetListName('');
                      setActiveSetList(setLists.length);
                    }
                  }}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg transition-colors"
                >+ Create</button>
              </div>
              {setLists.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex gap-1 flex-wrap mb-2">
                    {setLists.map((sl, i) => (
                      <button key={i} onClick={() => setActiveSetList(i)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${activeSetList === i ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                        {sl.name} ({sl.trackIds.length})
                      </button>
                    ))}
                  </div>
                  {activeSetList >= 0 && activeSetList < setLists.length && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-400">{setLists[activeSetList].trackIds.length} tracks</span>
                        <div className="flex gap-1">
                          <button onClick={() => {
                            if (selectedTrack && !setLists[activeSetList].trackIds.includes(selectedTrack.id)) {
                              setSetLists(prev => prev.map((sl, i) => i === activeSetList ? {...sl, trackIds: [...sl.trackIds, selectedTrack.id]} : sl));
                            }
                          }} className="px-2 py-0.5 bg-green-600/20 text-green-400 text-[10px] rounded hover:bg-green-600/30 transition-colors">
                            + Add Selected
                          </button>
                          <button onClick={() => {
                            setSetLists(prev => prev.filter((_, i) => i !== activeSetList));
                            setActiveSetList(-1);
                          }} className="px-2 py-0.5 bg-red-600/20 text-red-400 text-[10px] rounded hover:bg-red-600/30 transition-colors">
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="max-h-[150px] overflow-y-auto space-y-1 scrollbar-thin">
                        {setLists[activeSetList].trackIds.map((tid, tIdx) => {
                          const t = tracks.find(tr => tr.id === tid);
                          if (!t) return null;
                          return (<>
                            <div key={tid} className="flex items-center gap-2 px-2 py-1 rounded bg-gray-800/50 group">
                              <span className="text-[10px] text-gray-500 w-4">{tIdx + 1}</span>
                              {trackColors[tid] && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor: trackColors[tid]}} />}
                              <span className="text-xs text-white truncate flex-1 cursor-pointer hover:text-cyan-300" onClick={() => setSelectedTrack(t)}>{t.title || t.original_filename}</span>
                              <span className="text-[10px] text-gray-500">{t.analysis?.bpm?.toFixed(0) || '-'}</span>
                              <span className="text-[10px] text-gray-500">{t.analysis?.key ? (CAMELOT_WHEEL[t.analysis.key] || t.analysis.key) : '-'}</span>
                              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => {
                                  if (tIdx > 0) {
                                    setSetLists(prev => prev.map((sl, i) => {
                                      if (i !== activeSetList) return sl;
                                      const ids = [...sl.trackIds];
                                      [ids[tIdx], ids[tIdx-1]] = [ids[tIdx-1], ids[tIdx]];
                                      return {...sl, trackIds: ids};
                                    }));
                                  }
                                }} className="text-gray-500 hover:text-white"><ChevronUp className="w-3 h-3" /></button>
                                <button onClick={() => {
                                  if (tIdx < setLists[activeSetList].trackIds.length - 1) {
                                    setSetLists(prev => prev.map((sl, i) => {
                                      if (i !== activeSetList) return sl;
                                      const ids = [...sl.trackIds];
                                      [ids[tIdx], ids[tIdx+1]] = [ids[tIdx+1], ids[tIdx]];
                                      return {...sl, trackIds: ids};
                                    }));
                                  }
                                }} className="text-gray-500 hover:text-white"><ChevronDown className="w-3 h-3" /></button>
                                <button onClick={() => {
                                  setSetLists(prev => prev.map((sl, i) => i === activeSetList ? {...sl, trackIds: sl.trackIds.filter(id => id !== tid)} : sl));
                                }} className="text-gray-500 hover:text-red-400"><X className="w-3 h-3" /></button>
                              </div>
                            </div>
                          {tIdx < setLists[activeSetList].trackIds.length - 1 && (
                            <div className="flex items-center gap-1 px-3 py-0.5">
                              <div className="flex-1 border-t border-dashed border-gray-700" />
                              <input type="text" placeholder="transition..." value={transitionNotes[activeSetList + '-' + tIdx] || ''}
                                onChange={e => setTransitionNotes(prev => ({...prev, [activeSetList + '-' + tIdx]: e.target.value}))}
                                className="bg-transparent text-[9px] text-gray-400 placeholder-gray-600 border-none outline-none w-24 text-center italic" />
                              <div className="flex-1 border-t border-dashed border-gray-700" />
                            </div>
                          )}
                          </>);
                        })}
                        {setLists[activeSetList].trackIds.length === 0 && (
                          <div className="text-center py-4 text-gray-500 text-xs">Select a track and click "+ Add Selected" to build your set</div>
                        )}
                        {/* Smart Sort */}
                        {setLists[activeSetList].trackIds.length > 1 && (
                          <button onClick={() => {
                            const sl = setLists[activeSetList];
                            const sorted = [...sl.trackIds].sort((a, b) => {
                              const ta = tracks.find(t => t.id === a);
                              const tb = tracks.find(t => t.id === b);
                              if (!ta || !tb) return 0;
                              const ca = CAMELOT_WHEEL[ta.key] || '';
                              const cb = CAMELOT_WHEEL[tb.key] || '';
                              const na = parseInt(ca) || 0;
                              const nb = parseInt(cb) || 0;
                              if (na !== nb) return na - nb;
                              return (ta.bpm || 0) - (tb.bpm || 0);
                            });
                            setSetLists(prev => prev.map((s, i) => i === activeSetList ? {...s, trackIds: sorted} : s));
                          }} className="w-full text-[9px] bg-purple-600/30 text-purple-300 py-1.5 rounded hover:bg-purple-600/50 transition-colors flex items-center justify-center gap-1 mb-1">
                            <Sparkles className="w-3 h-3" /> Auto-Sort by Key & BPM
                          </button>
                        )}
                        {/* Energy Flow Chart */}
                {setLists[activeSetList].trackIds.length >= 2 && (() => {
                  const setTracks = setLists[activeSetList].trackIds.map(id => tracks.find(t => t.id === id)).filter(Boolean);
                  const energies = setTracks.map(t => Math.round((t.analysis?.energy || 0) * 100));
                  const maxE = Math.max(...energies, 1);
                  return (
                    <div className="mt-2 mb-1 p-2 bg-gray-800/30 rounded-lg border border-gray-700/30">
                      <div className="text-[9px] text-gray-500 mb-1 font-medium uppercase tracking-wider">Energy Flow</div>
                      <div className="flex items-end gap-px h-8">
                        {energies.map((e, i) => {
                          const h = Math.max((e / maxE) * 100, 5);
                          const color = e < 30 ? 'bg-blue-500' : e < 60 ? 'bg-green-500' : e < 80 ? 'bg-yellow-500' : 'bg-red-500';
                          return <div key={i} className={"rounded-t-sm transition-all " + color} style={{height: h + '%', flex: 1, minWidth: 3, opacity: 0.7}} title={setTracks[i]?.title + ': ' + e + '% energy'} />;
                        })}
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-[7px] text-gray-600">Start</span>
                        <span className="text-[7px] text-gray-600">End</span>
                      </div>
                    </div>
                  );
                })()}
                {/* Export Set List */}
                        {setLists[activeSetList].trackIds.length > 0 && (
                          <div className="flex gap-2 mt-2 pt-2 border-t border-gray-700/50">
                            <button onClick={() => {
                              const sl = setLists[activeSetList];
                              const lines = sl.trackIds.map((tid, i) => {
                                const tr = tracks.find(t => t.id === tid);
                                if (!tr) return '';
                                const note = transitionNotes[activeSetList + '-' + i] || '';
                                return (i+1) + '. ' + tr.title + ' - ' + (tr.bpm?.toFixed(1) || '?') + ' BPM - ' + (tr.key || '?') + (note ? ' [' + note + ']' : '');
                              }).filter(Boolean);
                              const text = 'Set List: ' + sl.name + '\n' + lines.join('\n');
                              navigator.clipboard.writeText(text);
                            }} className="flex-1 text-[9px] bg-blue-600/30 text-blue-300 py-1 rounded hover:bg-blue-600/50 transition-colors flex items-center justify-center gap-1">
                              <Copy className="w-3 h-3" /> Copy as Text
                            </button>
                            <button onClick={() => {
                              const sl = setLists[activeSetList];
                              const header = 'No,Title,BPM,Key,Note';
                              const rows = sl.trackIds.map((tid, i) => {
                                const tr = tracks.find(t => t.id === tid);
                                if (!tr) return '';
                                return (i+1) + ',' + (tr.title || '').replace(/,/g, ' ') + ',' + (tr.bpm?.toFixed(1) || '') + ',' + (tr.key || '') + ',' + (transitionNotes[activeSetList + '-' + i] || '');
                              }).filter(Boolean);
                              const csv = header + '\n' + rows.join('\n');
                              const blob = new Blob([csv], {type: 'text/csv'});
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url; a.download = sl.name + '.csv'; a.click();
                              URL.revokeObjectURL(url);
                            }} className="flex-1 text-[9px] bg-green-600/30 text-green-300 py-1 rounded hover:bg-green-600/50 transition-colors flex items-center justify-center gap-1">
                              <Download className="w-3 h-3" /> Export CSV
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-500 text-xs">
                  <ListMusic className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Create a set list to organize your DJ sets
                </div>
              )}
            </div>
</div>
          )}
          {activeBottomTab === 'history' && (
            <div>
{/* DJ History */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-pink-400" /> DJ History
          </h3>
          <button onClick={() => setShowHistory(!showHistory)} className="text-xs text-gray-400 hover:text-white">{showHistory ? "Hide" : "Show"}</button>
        </div>
        {showHistory ? (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {djHistory.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-2">No tracks played yet</p>
            ) : djHistory.map(function(item, idx) {
              return (
                <div key={idx} className="flex items-center gap-2 px-2 py-1 bg-gray-700 rounded text-xs">
                  <span className="text-pink-400">{idx + 1}.</span>
                  <span className="text-white truncate flex-1">{String(item)}</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
            </div>
          )}
          {activeBottomTab === 'stats' && (
            <div>
      {/* Collection Stats */}
      <div className="grid grid-cols-3 gap-3">
        {/* Key Distribution */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
            <Hash className="w-4 h-4 text-cyan-400" /> Key Distribution
          </h3>
          <div className="space-y-1 max-h-[160px] overflow-y-auto scrollbar-thin">
            {(() => {
              const keyCounts: Record<string, number> = {};
              tracks.filter(t => t.analysis?.key).forEach(t => {
                const cam = CAMELOT_WHEEL[t.analysis.key] || t.analysis.key;
                keyCounts[cam] = (keyCounts[cam] || 0) + 1;
              });
              const sorted = Object.entries(keyCounts).sort((a, b) => b[1] - a[1]);
              const max = sorted[0]?.[1] || 1;
              return sorted.map(([key, count]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-8 font-mono">{key}</span>
                  <div className="flex-1 bg-gray-700/30 rounded-full h-3">
                    <div className="bg-cyan-500/60 h-3 rounded-full transition-all" style={{ width: `${(count / max) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-400 w-5 text-right">{count}</span>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* BPM Range */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-blue-400" /> BPM Ranges
          </h3>
          <div className="space-y-1 max-h-[160px] overflow-y-auto scrollbar-thin">
            {(() => {
              const ranges = [
                { label: '< 100', min: 0, max: 100 },
                { label: '100-115', min: 100, max: 115 },
                { label: '115-125', min: 115, max: 125 },
                { label: '125-135', min: 125, max: 135 },
                { label: '135-145', min: 135, max: 145 },
                { label: '145-160', min: 145, max: 160 },
                { label: '> 160', min: 160, max: 999 },
              ];
              const bpmCounts = ranges.map(r => ({
                ...r,
                count: tracks.filter(t => t.analysis?.bpm && t.analysis.bpm >= r.min && t.analysis.bpm < r.max).length
              }));
              const max = Math.max(...bpmCounts.map(r => r.count), 1);
              return bpmCounts.map(r => (
                <div key={r.label} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-12 font-mono">{r.label}</span>
                  <div className="flex-1 bg-gray-700/30 rounded-full h-3">
                    <div className="bg-blue-500/60 h-3 rounded-full transition-all" style={{ width: `${(r.count / max) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-400 w-5 text-right">{r.count}</span>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Genre Distribution */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
            <Disc3 className="w-4 h-4 text-pink-400" /> Genre Distribution
          </h3>
          <div className="space-y-1 max-h-[160px] overflow-y-auto scrollbar-thin">
            {(() => {
              const genreCounts: Record<string, number> = {};
              tracks.filter(t => t.genre).forEach(t => {
                genreCounts[t.genre] = (genreCounts[t.genre] || 0) + 1;
              });
              const sorted = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);
              const max = sorted[0]?.[1] || 1;
              return sorted.length > 0 ? sorted.map(([genre, count]) => (
                <div key={genre} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-16 truncate">{genre}</span>
                  <div className="flex-1 bg-gray-700/30 rounded-full h-3">
                    <div className="bg-pink-500/60 h-3 rounded-full transition-all" style={{ width: `${(count / max) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-400 w-5 text-right">{count}</span>
                </div>
              )) : (
                <div className="text-center py-4 text-gray-500 text-xs">No genre data available</div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Energy Flow - Playlist Visualization */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 border border-gray-700 mt-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-yellow-400" /> Energy Flow
        </h3>
        {tracks.filter(t => t.analysis?.energy !== undefined).length > 0 ? (
          <div className="flex items-end gap-[2px] h-[80px]">
            {tracks
              .filter(t => t.status === 'analyzed' && t.analysis?.energy !== undefined)
              .sort((a, b) => (a.analysis?.bpm || 0) - (b.analysis?.bpm || 0))
              .map((t, i) => {
                const energy = t.analysis?.energy || 0;
                const heightPct = Math.max(5, energy);
                const hue = energy < 30 ? 200 : energy < 60 ? 150 : energy < 80 ? 50 : 0;
                return (
                  <div key={t.id} className="flex-1 min-w-[4px] max-w-[20px] group relative cursor-pointer" onClick={() => setSelectedTrack(t)}>
                    <div className="w-full rounded-t transition-all hover:opacity-80" style={{ height: `${heightPct}%`, background: `hsl(${hue}, 80%, 55%)` }} />
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[9px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                      {t.title?.substring(0, 20)} - {t.analysis?.bpm?.toFixed(0)} BPM - E:{energy}%
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500 text-xs">Analyze tracks to see energy flow</div>
        )}
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-gray-500">Low BPM</span>
          <span className="text-[9px] text-gray-500">High BPM</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-2 mt-3">
        <div className="bg-gray-800/50 rounded-lg p-3 text-center border border-gray-700/50">
          <div className="text-lg font-bold text-white">{tracks.length}</div>
          <div className="text-[10px] text-gray-400">Total Tracks</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center border border-gray-700/50">
          <div className="text-lg font-bold text-green-400">{tracks.filter(t => t.status === 'analyzed').length}</div>
          <div className="text-[10px] text-gray-400">Analyzed</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center border border-gray-700/50">
          <div className="text-lg font-bold text-blue-400">
            {tracks.filter(t => t.analysis?.bpm).length > 0 ? (tracks.filter(t => t.analysis?.bpm).reduce((sum, t) => sum + t.analysis.bpm, 0) / tracks.filter(t => t.analysis?.bpm).length).toFixed(0) : '-'}
          </div>
          <div className="text-[10px] text-gray-400">Avg BPM</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center border border-gray-700/50">
          <div className="text-lg font-bold text-purple-400">
            {(() => {
              const keyCounts: Record<string, number> = {};
              tracks.filter(t => t.analysis?.key).forEach(t => {
                const cam = CAMELOT_WHEEL[t.analysis.key] || t.analysis.key;
                keyCounts[cam] = (keyCounts[cam] || 0) + 1;
              });
              const sorted = Object.entries(keyCounts).sort((a, b) => b[1] - a[1]);
              return sorted[0]?.[0] || '-';
            })()}
          </div>
          <div className="text-[10px] text-gray-400">Top Key</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center border border-gray-700/50">
          <div className="text-lg font-bold text-orange-400">
            {tracks.filter(t => t.analysis?.energy !== undefined).length > 0 ? (tracks.filter(t => t.analysis?.energy !== undefined).reduce((sum, t) => sum + (t.analysis.energy || 0), 0) / tracks.filter(t => t.analysis?.energy !== undefined).length).toFixed(0) : '-'}
          </div>
          <div className="text-[10px] text-gray-400">Avg Energy</div>
        </div>
      </div>
            </div>
          )}

              {/* ── Keyboard Shortcuts Hint ── */}
              <div className="flex items-center gap-4 px-3 py-1.5 border-t border-white/[0.04] bg-slate-900/30">
                <span className="text-[10px] text-slate-500 flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-slate-700/50 text-slate-400 font-mono text-[9px]">↑↓</kbd> Naviguer</span>
                <span className="text-[10px] text-slate-500 flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-slate-700/50 text-slate-400 font-mono text-[9px]">Espace</kbd> Play/Pause</span>
                <span className="text-[10px] text-slate-500 flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-slate-700/50 text-slate-400 font-mono text-[9px]">Clic droit</kbd> Menu</span>
                <span className="text-[10px] text-slate-500 flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-slate-700/50 text-slate-400 font-mono text-[9px]">Suppr</kbd> Supprimer</span>
        <span className="text-[10px] text-slate-500 flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-slate-700/50 text-slate-400 font-mono text-[9px]">Ctrl+F</kbd> Rechercher</span>
        <span className="text-[10px] text-slate-500 flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-slate-700/50 text-slate-400 font-mono text-[9px]">Esc</kbd> Effacer</span>
              <span className="text-[10px] text-slate-500 flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-slate-700/50 text-slate-400 font-mono text-[9px]">Shift+Clic</kbd> Sélection plage</span>
              </div>
              {/* ── Favorites Toggle ── */}
              <button
                onClick={() => setShowFavoritesOnly(p => !p)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${showFavoritesOnly ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'text-slate-500 hover:text-yellow-400'}`}
                title={showFavoritesOnly ? 'Afficher tous les morceaux' : 'Afficher uniquement les favoris'}
              >
                <Star size={10} className={showFavoritesOnly ? 'fill-yellow-400 text-yellow-400' : ''} />
                Favoris{favoriteIds.size > 0 ? ` (${favoriteIds.size})` : ''}
              </button>
              {/* ── Status Bar ── */}
              <div className="flex items-center gap-3 px-1">
                <span className="text-[10px] text-slate-600">
                  {tracks.length} morceau{tracks.length !== 1 ? 'x' : ''}
                  {searchQuery && ` | ${filteredTracks.length} résultat${filteredTracks.length !== 1 ? 's' : ''}`}
                </span>
                {selectedIds.size > 0 && (
                  <span className="text-[10px] text-cyan-400 flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-cyan-500/20 text-cyan-400 font-bold text-[9px]">{selectedIds.size}</span>
                    sélectionné{selectedIds.size !== 1 ? 's' : ''}
                    <button onClick={() => setSelectedIds(new Set())} className="ml-1 text-[9px] text-slate-500 hover:text-red-400 transition-colors underline">Désélect.</button>
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowShortcutsModal(p => !p)}
                className="ml-auto flex items-center justify-center w-5 h-5 rounded-full bg-slate-700/50 text-slate-500 hover:text-cyan-400 hover:bg-slate-700 transition-colors text-[10px] font-bold"
                title="Raccourcis clavier (?)"
              >?</button>

              {/* ── Action Buttons ── */}
              {/* Star Rating */}
              <div className="flex items-center gap-2 mt-3">
                <span className="text-[10px] text-gray-400">Rating:</span>
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(star => (
                    <button key={star} onClick={() => setTrackRatings(prev => ({...prev, [selectedTrack?.id]: trackRatings[selectedTrack?.id] === star ? 0 : star}))} className="p-0.5 transition-colors">
                      <Star className={`w-4 h-4 ${(trackRatings[selectedTrack?.id] || 0) >= star ? 'fill-yellow-400 text-yellow-400' : 'text-gray-600 hover:text-yellow-400/50'}`} />
                    </button>
                  ))}
                </div>
                {trackRatings[selectedTrack?.id] > 0 && <span className="text-[10px] text-yellow-400 font-bold">{trackRatings[selectedTrack?.id]}/5</span>}
              </div>
              {/* Color Tags */}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-gray-400">Tag:</span>
                <div className="flex gap-1">
                  {['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'].map(color => (
                    <button
                      key={color || 'none'}
                      onClick={() => setTrackColors(prev => ({...prev, [selectedTrack?.id || 0]: color}))}
                      className={`w-5 h-5 rounded-full border-2 transition-all ${trackColors[selectedTrack?.id || 0] === color ? 'border-white scale-110' : 'border-gray-600 hover:border-gray-400'}`}
                      style={color ? {backgroundColor: color} : {background: 'linear-gradient(135deg, #374151, #1f2937)'}}
                      title={color ? color : 'No tag'}
                    >
                      {!color && trackColors[selectedTrack?.id || 0] === '' && <X className="w-3 h-3 text-gray-400 mx-auto" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 space-y-2 border-t border-gray-700 pt-3">
                <div className="flex gap-2">
                  <button
                    onClick={openEditMeta}
                    className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-xs font-bold text-white transition-colors"
                  >
                    ✏️ Edit Metadata
                  </button>
                  <button
                    onClick={() => selectedTrack && exportRekordbox(selectedTrack.id)}
                    className="flex-1 px-3 py-2 bg-orange-600 hover:bg-orange-500 rounded text-xs font-bold text-white transition-colors"
                  >
                    🎵 Export XML
                  </button>
                </div>
              {/* Tap Tempo */}
              <div className="mt-3 p-2 bg-gray-800/50 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400 flex items-center gap-1"><Activity className="w-3 h-3" /> Tap Tempo</span>
                  {tapBpm > 0 && <span className="text-sm font-bold text-cyan-400">{tapBpm.toFixed(1)} BPM</span>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const now = Date.now();
                      const newTaps = [...tapTimes, now].filter(t => now - t < 5000);
                      setTapTimes(newTaps);
                      if (newTaps.length >= 2) {
                        const intervals = [];
                        for (let i = 1; i < newTaps.length; i++) intervals.push(newTaps[i] - newTaps[i-1]);
                        const avgMs = intervals.reduce((a,b) => a+b, 0) / intervals.length;
                        setTapBpm(60000 / avgMs);
                      }
                    }}
                    className="flex-1 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-lg transition-all active:scale-95"
                  >TAP</button>
                  <button
                    onClick={() => { setTapTimes([]); setTapBpm(0); }}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors"
                  >Reset</button>
                </div>
              </div>
                <button
                  onClick={exportAllRekordbox}
                  className="w-full px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded text-xs font-bold text-white transition-colors"
                >
                  📦 Export All to Rekordbox
                </button>
                <button
                  onClick={() => {
                    const tracksToExport = selectedIds.size > 0 ? filteredTracks.filter(t => selectedIds.has(t.id)) : filteredTracks;
                    const headers = ['Titre', 'Artiste', 'Genre', 'BPM', 'Tonalité', 'Camelot', 'Énergie', 'Durée (s)', 'Fichier'];
                    const rows = tracksToExport.map(t => {
                      const a = t.analysis;
                      return [
                        t.title || t.original_filename,
                        t.artist || '',
                        t.genre || '',
                        a?.bpm ? a.bpm.toFixed(1) : '',
                        a?.key || '',
                        a?.key ? toCamelot(a.key) : '',
                        a?.energy != null ? Math.round(a.energy * 100) + '%' : '',
                        a?.duration_ms ? Math.round(a.duration_ms / 1000) : '',
                        t.original_filename || ''
                      ].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',');
                    });
                    const csv = [headers.join(','), ...rows].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `cueforge-library-${new Date().toISOString().slice(0,10)}.csv`;
                    link.click();
                    URL.revokeObjectURL(url);
                    showToast(`${tracksToExport.length} morceau${tracksToExport.length > 1 ? 'x' : ''} exporté${tracksToExport.length > 1 ? 's' : ''} en CSV`, 'success');
                  }}
                  className="w-full px-3 py-2 bg-emerald-600/80 hover:bg-emerald-500 rounded text-xs font-bold text-white transition-colors flex items-center justify-center gap-1"
                >
                  <Download size={14} /> Export CSV {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                </button>
                  {selectedIds.size > 0 && (
                    <div className="w-full space-y-2">
                      <div className="border-t border-slate-700/50 pt-2" />
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">Actions groupées ({selectedIds.size})</p>
                      {!showBulkGenre ? (
                        <button
                          onClick={() => setShowBulkGenre(true)}
                          className="w-full px-3 py-2 bg-purple-600/80 hover:bg-purple-500 rounded text-xs font-bold text-white transition-colors flex items-center justify-center gap-1"
                        >
                          <Tag size={14} /> Modifier le genre
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={bulkGenreValue}
                            onChange={e => setBulkGenreValue(e.target.value)}
                            placeholder="Ex: Tech House, Melodic Techno..."
                            className="w-full px-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded text-xs text-white placeholder:text-slate-500 focus:border-purple-500 focus:outline-none"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') bulkUpdateGenre(); if (e.key === 'Escape') setShowBulkGenre(false); }}
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={bulkUpdateGenre}
                              disabled={bulkUpdating || !bulkGenreValue.trim()}
                              className="flex-1 px-2 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 rounded text-[10px] font-bold text-white transition-colors"
                            >
                              {bulkUpdating ? 'Mise à jour...' : 'Appliquer'}
                            </button>
                            <button
                              onClick={() => { setShowBulkGenre(false); setBulkGenreValue(''); }}
                              className="px-2 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-[10px] text-slate-400 transition-colors"
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
              </div>

        </div>
      </div>
      </div>

      {/* ââ Smart Playlist Builder ââ */}
      {showSmartPlaylist && (
        <div className="bg-gradient-to-r from-purple-900/40 via-gray-900 to-purple-900/40 border-t border-purple-500/30 p-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-cyan-400/80 flex items-center gap-2"><Sparkles size={18}/> Smart Playlist Builder</h3>
              <button onClick={() => setShowSmartPlaylist(false)} className="text-gray-400 hover:text-white"><X size={18}/></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              {smartRules.map((rule, i) => (
                <div key={i} className="bg-gray-800/80 rounded-lg p-3 border border-purple-500/20 flex items-center gap-2">
                  <select value={rule.field} onChange={(e) => {const r = [...smartRules]; r[i].field = e.target.value; setSmartRules(r);}} className="bg-gray-700 text-white rounded px-2 py-1 text-sm">
                    <option value="genre">Genre</option>
                    <option value="bpm">BPM</option>
                    <option value="key">Key</option>
                    <option value="energy">Energy</option>
                    <option value="artist">Artist</option>
                    <option value="year">Year</option>
                  </select>
                  <select value={rule.op} onChange={(e) => {const r = [...smartRules]; r[i].op = e.target.value; setSmartRules(r);}} className="bg-gray-700 text-white rounded px-2 py-1 text-sm">
                    <option value="equals">equals</option>
                    <option value="contains">contains</option>
                    <option value="gt">greater than</option>
                    <option value="lt">less than</option>
                    <option value="between">between</option>
                  </select>
                  <input value={rule.value} onChange={(e) => {const r = [...smartRules]; r[i].value = e.target.value; setSmartRules(r);}} className="bg-gray-700 text-white rounded px-2 py-1 text-sm flex-1" placeholder="Value..."/>
                  <button onClick={() => setSmartRules(smartRules.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300"><X size={14}/></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSmartRules([...smartRules, {field: 'genre', op: 'equals', value: ''}])} className="bg-gradient-to-b from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-1"><Sparkles size={14}/> Add Rule</button>
              <button onClick={() => {
                const filtered = tracks.filter((t) => smartRules.every((rule) => {
                  const val = (t[rule.field] || '').toString().toLowerCase();
                  const target = rule.value.toLowerCase();
                  if (rule.op === 'equals') return val === target;
                  if (rule.op === 'contains') return val.includes(target);
                  if (rule.op === 'gt') return parseFloat(val) > parseFloat(target);
                  if (rule.op === 'lt') return parseFloat(val) < parseFloat(target);
                  return true;
                }));
                const name = 'Smart ' + new Date().toLocaleTimeString();
                setPlaylists({...playlists, [name]: filtered.map(t => t.id)});
                setCurrentPlaylist(name);
              }} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-1"><Check size={14}/> Generate Playlist</button>
            </div>
          </div>
        </div>
      )}

      {/* ââ Duplicate Detection Panel ââ */}
      {showDuplicates && (
        <div className="bg-gradient-to-r from-orange-900/30 via-gray-900 to-orange-900/30 border-t border-orange-500/30 p-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-orange-300 flex items-center gap-2"><AlertTriangle size={18}/> Duplicate Detection</h3>
              <button onClick={() => setShowDuplicates(false)} className="text-gray-400 hover:text-white"><X size={18}/></button>
            </div>
            <button onClick={() => {
              const groups = [];
              const seen = {};
              tracks.forEach((t) => {
                const key = (t.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
                if (seen[key]) { seen[key].push(t); } else { seen[key] = [t]; }
              });
              Object.values(seen).forEach((g) => { if (g.length > 1) groups.push(g); });
              setDuplicateGroups(groups);
            }} className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg text-sm mb-4 flex items-center gap-1"><Search size={14}/> Scan for Duplicates</button>
            {duplicateGroups.length === 0 && <p className="text-gray-400 text-sm">No duplicates found. Click scan to analyze your library.</p>}
            {duplicateGroups.map((group, gi) => (
              <div key={gi} className="bg-gray-800/60 rounded-lg p-3 mb-2 border border-orange-500/20">
                <p className="text-orange-300 text-sm font-semibold mb-2">Group {gi + 1} - {group.length} copies</p>
                {group.map((t, ti) => (
                  <div key={ti} className="flex items-center justify-between py-1 text-sm">
                    <span className="text-white">{t.title} - {t.artist}</span>
                    <span className="text-gray-400">{t.genre} | {t.bpm} BPM</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ââ Export Panel (Rekordbox / Serato / Traktor) ââ */}
      {showExport && (
        <div className="bg-gradient-to-r from-cyan-900/30 via-gray-900 to-cyan-900/30 border-t border-cyan-500/30 p-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-cyan-300 flex items-center gap-2"><Download size={18}/> DJ App Export</h3>
              <button onClick={() => setShowExport(false)} className="text-gray-400 hover:text-white"><X size={18}/></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {['rekordbox', 'serato', 'traktor', 'virtualdj'].map((fmt) => (
                <button key={fmt} onClick={() => setExportFormat(fmt)} className={`rounded-xl p-4 border text-center transition-all ${exportFormat === fmt ? 'bg-cyan-600/30 border-cyan-400 text-cyan-200' : 'bg-gray-800/60 border-gray-700 text-gray-300 hover:border-cyan-600'}`}>
                  <Disc size={24} className="mx-auto mb-2"/>
                  <p className="font-bold capitalize">{fmt}</p>
                  <p className="text-xs text-gray-400 mt-1">{fmt === 'rekordbox' ? 'XML Collection' : fmt === 'serato' ? 'Crates V2' : fmt === 'traktor' ? 'NML Collection' : 'VDJ Database'}</p>
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={() => {
                const xmlTracks = tracks.map((t) => `  <TRACK Title="${t.title || ''}" Artist="${t.artist || ''}" Genre="${t.genre || ''}" BPM="${t.bpm || ''}" Key="${t.key || ''}" Energy="${t.energy || ''}"/>`).join('\n');
                const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS Version="1.0">\n<COLLECTION Entries="${tracks.length}">\n${xmlTracks}\n</COLLECTION>\n</DJ_PLAYLISTS>`;
                const blob = new Blob([xml], {type: 'application/xml'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `cueforge-${exportFormat}-export.xml`; a.click();
                URL.revokeObjectURL(url);
              }} className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2 rounded-lg text-sm flex items-center gap-2"><Download size={14}/> Export {tracks.length} Tracks</button>
              <button onClick={() => {
                if (!currentPlaylist || !playlists[currentPlaylist]) return;
                const ids = playlists[currentPlaylist];
                const playlistTracks = tracks.filter((t) => ids.includes(t.id));
                const xmlTracks = playlistTracks.map((t) => `  <TRACK Title="${t.title || ''}" Artist="${t.artist || ''}" Genre="${t.genre || ''}" BPM="${t.bpm || ''}"/>`).join('\n');
                const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS Version="1.0">\n<COLLECTION Entries="${playlistTracks.length}">\n${xmlTracks}\n</COLLECTION>\n</DJ_PLAYLISTS>`;
                const blob = new Blob([xml], {type: 'application/xml'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `cueforge-playlist-${currentPlaylist}.xml`; a.click();
                URL.revokeObjectURL(url);
              }} className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg text-sm flex items-center gap-2"><Folder size={14}/> Export Playlist Only</button>
            </div>
          </div>
        </div>
      )}

      {/* ââ Stats Dashboard ââ */}
      {showStats && (
        <div className="bg-gradient-to-r from-green-900/30 via-gray-900 to-green-900/30 border-t border-green-500/30 p-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-green-300 flex items-center gap-2"><Activity size={18}/> Library Stats</h3>
              <button onClick={() => setShowStats(false)} className="text-gray-400 hover:text-white"><X size={18}/></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
              <div className="bg-gray-800/60 rounded-xl p-4 text-center border border-green-500/20">
                <p className="text-3xl font-bold text-green-400">{tracks.length}</p>
                <p className="text-xs text-gray-400 mt-1">Total Tracks</p>
              </div>
              <div className="bg-gray-800/60 rounded-xl p-4 text-center border border-blue-500/20">
                <p className="text-3xl font-bold text-blue-400">{new Set(tracks.map(t => t.genre).filter(Boolean)).size}</p>
                <p className="text-xs text-gray-400 mt-1">Genres</p>
              </div>
              <div className="bg-gray-800/60 rounded-xl p-4 text-center border border-purple-500/20">
                <p className="text-3xl font-bold text-cyan-500/70">{new Set(tracks.map(t => t.artist).filter(Boolean)).size}</p>
                <p className="text-xs text-gray-400 mt-1">Artists</p>
              </div>
              <div className="bg-gray-800/60 rounded-xl p-4 text-center border border-yellow-500/20">
                <p className="text-3xl font-bold text-yellow-400">{tracks.length > 0 ? Math.round(tracks.reduce((s,t) => s + (parseFloat(t.bpm) || 0), 0) / tracks.filter(t => t.bpm).length) : 0}</p>
                <p className="text-xs text-gray-400 mt-1">Avg BPM</p>
              </div>
              <div className="bg-gray-800/60 rounded-xl p-4 text-center border border-pink-500/20">
                <p className="text-3xl font-bold text-pink-400">{tracks.length > 0 ? Math.round(tracks.reduce((s,t) => s + (parseFloat(t.energy) || 0), 0) / tracks.filter(t => t.energy).length) || 0 : 0}</p>
                <p className="text-xs text-gray-400 mt-1">Avg Energy</p>
              </div>
              <div className="bg-gray-800/60 rounded-xl p-4 text-center border border-cyan-500/20">
                <p className="text-3xl font-bold text-cyan-400">{Object.keys(playlists).length}</p>
                <p className="text-xs text-gray-400 mt-1">Playlists</p>
              </div>
            </div>
            {/* Genre Distribution */}
            <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700">
              <h4 className="text-sm font-semibold text-gray-300 mb-3">Genre Distribution</h4>
              <div className="space-y-2">
                {Object.entries(tracks.reduce((acc, t) => { const g = t.genre || 'Unknown'; acc[g] = (acc[g] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([genre, count]) => (
                  <div key={genre} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-24 truncate">{genre}</span>
                    <div className="flex-1 bg-gray-700 rounded-full h-3">
                      <div className="bg-gradient-to-r from-green-500 to-emerald-400 h-3 rounded-full transition-all" style={{width: `${(count / tracks.length) * 100}%`}}/>
                    </div>
                    <span className="text-xs text-gray-400 w-8 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* BPM Histogram */}
            <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700 mt-3">
              <h4 className="text-sm font-semibold text-gray-300 mb-3">BPM Distribution</h4>
              <div className="flex items-end gap-1 h-32">
                {Array.from({length: 20}, (_, i) => {
                  const min = 60 + i * 10;
                  const max = min + 10;
                  const count = tracks.filter(t => {const b = parseFloat(t.bpm); return b >= min && b < max;}).length;
                  const maxCount = Math.max(...Array.from({length: 20}, (_, j) => tracks.filter(t => {const b = parseFloat(t.bpm); return b >= 60 + j * 10 && b < 70 + j * 10;}).length), 1);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t transition-all" style={{height: `${(count / maxCount) * 100}%`}} title={`${min}-${max} BPM: ${count} tracks`}/>
                      {i % 4 === 0 && <span className="text-[9px] text-gray-500">{min}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Key Distribution (Camelot Wheel) */}
            <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700 mt-3">
              <h4 className="text-sm font-semibold text-gray-300 mb-3">Key Distribution (Camelot)</h4>
              <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
                {Object.entries(CAMELOT_WHEEL).map(([key, camelot]) => {
                  const count = tracks.filter(t => t.key === key || t.key === camelot).length;
                  return (
                    <div key={key} className={`rounded-lg p-2 text-center border transition-all ${count > 0 ? 'bg-purple-600/30 border-purple-400/50' : 'bg-gray-800/30 border-gray-700/30'}`}>
                      <p className="text-xs font-bold text-white">{camelot}</p>
                      <p className="text-[10px] text-gray-400">{key}</p>
                      <p className={`text-xs font-bold ${count > 0 ? 'text-cyan-400/80' : 'text-gray-600'}`}>{count}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ââ Batch Edit Panel ââ */}
      {showBatchEdit && batchSelected.length > 0 && (
        <div className="bg-gradient-to-r from-yellow-900/30 via-gray-900 to-yellow-900/30 border-t border-yellow-500/30 p-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-yellow-300 flex items-center gap-2"><Tag size={18}/> Batch Edit - {batchSelected.length} tracks selected</h3>
              <button onClick={() => {setShowBatchEdit(false); setBatchSelected([]);}} className="text-gray-400 hover:text-white"><X size={18}/></button>
            </div>
            <div className="flex gap-3 items-end">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Field</label>
                <select value={batchField} onChange={(e) => setBatchField(e.target.value)} className="bg-gray-700 text-white rounded px-3 py-2 text-sm">
                  <option value="genre">Genre</option>
                  <option value="artist">Artist</option>
                  <option value="energy">Energy</option>
                  <option value="key">Key</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400 block mb-1">New Value</label>
                <input value={batchValue} onChange={(e) => setBatchValue(e.target.value)} className="bg-gray-700 text-white rounded px-3 py-2 text-sm w-full" placeholder="Enter new value..."/>
              </div>
              <button onClick={() => {
                batchSelected.forEach((id) => {
                  const idx = tracks.findIndex(t => t.id === id);
                  if (idx > -1) { tracks[idx][batchField] = batchValue; }
                });
                setTracks([...tracks]);
                setBatchSelected([]);
                setShowBatchEdit(false);
              }} className="bg-yellow-600 hover:bg-yellow-500 text-white px-6 py-2 rounded-lg text-sm flex items-center gap-1"><Check size={14}/> Apply to All</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Interactive Camelot Wheel ── */}
            {showCamelotWheel && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) { setShowCamelotWheel(false); setSelectedWheelKey(null); } }}>
            <div className="bg-gradient-to-b from-gray-900 to-gray-950 border border-purple-500/30 rounded-xl p-6 max-w-2xl max-h-[90vh] overflow-y-auto w-full mx-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-cyan-500/70 flex items-center gap-2">🎵 Camelot Wheel - Harmonic Mixing Guide</h3>
                  <button onClick={() => { setShowCamelotWheel(false); setSelectedWheelKey(null); }} className="text-gray-400 hover:text-white text-xl">×</button>
                </div>
                <div className="flex gap-8">
                <div className="relative w-80 h-80 mx-auto">
                  <svg viewBox="0 0 400 400" className="w-full h-full">
                    {/* Background rings */}
                    <circle cx="200" cy="200" r="190" fill="none" stroke="#333" strokeWidth="1" opacity="0.3" />
                    <circle cx="200" cy="200" r="140" fill="none" stroke="#333" strokeWidth="1" opacity="0.3" />
                    {/* Connection lines for selected key */}
                    {selectedWheelKey && (() => {
                      const selMatch = selectedWheelKey.match(/(\d+)([AB])/);
                      if (!selMatch) return null;
                      const selNum = parseInt(selMatch[1]);
                      const selLetter = selMatch[2];
                      const selIsMinor = selLetter === 'A';
                      const selAngle = ((selNum - 1) * 30 - 90) * Math.PI / 180;
                      const selR = selIsMinor ? 120 : 170;
                      const selX = 200 + selR * Math.cos(selAngle);
                      const selY = 200 + selR * Math.sin(selAngle);
                      const compatKeys = getCompatibleKeys(selectedWheelKey);
                      return compatKeys.filter(k => k !== selectedWheelKey).map(ck => {
                        const m = ck.match(/(\d+)([AB])/);
                        if (!m) return null;
                        const cn = parseInt(m[1]);
                        const cMinor = m[2] === 'A';
                        const cAngle = ((cn - 1) * 30 - 90) * Math.PI / 180;
                        const cR = cMinor ? 120 : 170;
                        const cX = 200 + cR * Math.cos(cAngle);
                        const cY = 200 + cR * Math.sin(cAngle);
                        return <line key={ck} x1={selX} y1={selY} x2={cX} y2={cY} stroke="#06b6d4" strokeWidth="2" opacity="0.5" strokeDasharray="4,4" />;
                      });
                    })()}
                    {Object.entries(CAMELOT_WHEEL).map(([key, val], i) => {
                      const isMinor = val.endsWith('A');
                      const num = parseInt(val);
                      const angle = ((num - 1) * 30 - 90) * Math.PI / 180;
                      const r = isMinor ? 120 : 170;
                      const x = 200 + r * Math.cos(angle);
                      const y = 200 + r * Math.sin(angle);
                      const isSelected = selectedWheelKey === val;
                      const compatKeys = selectedWheelKey ? getCompatibleKeys(selectedWheelKey) : [];
                      const isCompat = compatKeys.includes(val);
                      const trackCount = tracks.filter(t => t.camelotKey === val).length;
                      const colors = ['#ff6b6b','#ff9f43','#feca57','#48dbfb','#0abde3','#10ac84','#1dd1a1','#54a0ff','#5f27cd','#c44569','#f78fb3','#3dc1d3'];
                      const color = colors[(num - 1) % 12];
                      return (
                        <g key={key} onClick={() => setSelectedWheelKey(prev => prev === val ? null : val)} style={{cursor: 'pointer'}}>
                          {/* Glow effect for selected */}
                          {isSelected && <circle cx={x} cy={y} r={32} fill={color} opacity="0.2" />}
                          <circle
                            cx={x} cy={y}
                            r={isSelected ? 28 : isCompat ? 25 : trackCount > 0 ? 22 : 18}
                            fill={isSelected ? color : isCompat ? color + '99' : trackCount > 0 ? '#1e293b' : '#0f172a'}
                            stroke={isSelected ? '#fff' : isCompat ? color : trackCount > 0 ? color : '#333'}
                            strokeWidth={isSelected ? 3 : isCompat ? 2.5 : trackCount > 0 ? 1.5 : 0.5}
                            opacity={selectedWheelKey ? (isSelected || isCompat ? 1 : 0.25) : 1}
                            className="transition-all duration-200 hover:opacity-100"
                          />
                          <text x={x} y={y - 4} textAnchor="middle" fill={isSelected ? '#fff' : isCompat ? '#fff' : '#ccc'} fontSize={isSelected ? "13" : "11"} fontWeight={isSelected ? "bold" : "normal"} style={{pointerEvents: 'none'}}>{val}</text>
                          <text x={x} y={y + 10} textAnchor="middle" fill={isSelected ? '#fff' : '#888'} fontSize="8" style={{pointerEvents: 'none'}}>{trackCount > 0 ? trackCount + ' trk' : ''}</text>
                        </g>
                      );
                    })}
                    <text x="200" y="195" textAnchor="middle" fill="#666" fontSize="12">Inner: Minor</text>
                    <text x="200" y="210" textAnchor="middle" fill="#666" fontSize="12">Outer: Major</text>
                  </svg>
                </div>
                <div className="flex-1 space-y-3">
                  <h4 className="text-sm font-semibold text-gray-300">Harmonic Mixing Rules</h4>
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    <div className="bg-gray-800/50 rounded p-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-400"></span> Same key = Perfect match</div>
                    <div className="bg-gray-800/50 rounded p-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-400"></span> +1/-1 = Energy shift</div>
                    <div className="bg-gray-800/50 rounded p-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-purple-400"></span> A↔B = Mode change (minor/major)</div>
                  </div>
                  <div className="mt-3 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded text-xs text-cyan-400">
                    💡 Click any key on the wheel to see compatible keys and matching tracks. Click again to deselect.
                  </div>
                  {/* Selected key info */}
                  {selectedWheelKey && (() => {
                    const compatKeys = getCompatibleKeys(selectedWheelKey);
                    const matchingTracks = tracks.filter(t => compatKeys.includes(t.camelotKey));
                    return (
                      <div className="mt-3">
                        <h4 className="text-sm font-semibold text-cyan-400 mb-2">Selected: <span className="text-white">{selectedWheelKey}</span> — {compatKeys.length} compatible keys</h4>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {compatKeys.map(ck => (
                            <span key={ck} onClick={() => setSelectedWheelKey(ck)} className={"px-2 py-0.5 rounded text-xs cursor-pointer transition-colors " + (ck === selectedWheelKey ? "bg-cyan-500 text-black font-bold" : "bg-gray-700 text-gray-300 hover:bg-gray-600")}>{ck}</span>
                          ))}
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          <h4 className="text-sm font-semibold text-green-400">{matchingTracks.length} matching tracks:</h4>
                          {matchingTracks.length === 0 && <p className="text-xs text-gray-500">No tracks in library match these keys</p>}
                          {matchingTracks.map(t => (
                            <div key={t.id} onClick={() => { if (currentTrack?.id !== t.id) { setCurrentTrack(t); } }} className="text-xs text-gray-300 py-1.5 px-2 bg-gray-800/40 rounded flex justify-between items-center cursor-pointer hover:bg-gray-700/60 transition-colors">
                              <span className="truncate mr-2">{t.title} - {t.artist}</span>
                              <span className="text-cyan-500/70 font-mono whitespace-nowrap">{t.camelotKey} | {t.bpm} BPM</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {/* Track selector for wheel focus */}
                  {!selectedWheelKey && (
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-gray-300 mb-2">Or select a track:</h4>
                      <select className="bg-gray-800 text-white rounded px-3 py-2 w-full text-sm border border-gray-700" onChange={(e) => { const trackId = e.target.value ? Number(e.target.value) : null; if (trackId) { const t = tracks.find(tr => tr.id === trackId); if (t?.camelotKey) setSelectedWheelKey(t.camelotKey); } else { setSelectedWheelKey(null); } }} value="">
                        <option value="">-- Choose a track --</option>
                        {tracks.filter(t => t.camelotKey).map(t => (
                          <option key={t.id} value={t.id}>{t.title} - {t.artist} ({t.camelotKey})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                </div>
              </div>
            </div>
            )}
            {/* ââ Watch Folder Panel ââ */}
      {showWatchFolder && (
        <div className="bg-gradient-to-b from-gray-900 to-gray-950 border-t border-yellow-500/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-yellow-400 flex items-center gap-2">ð Watch Folder - Auto Import</h3>
            <button onClick={() => setShowWatchFolder(false)} className="text-gray-400 hover:text-white text-xl">Ã</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 block mb-1">Folder Path</label>
                <div className="flex gap-2">
                  <input type="text" value={watchFolderPath} onChange={(e) => setWatchFolderPath(e.target.value)} placeholder="/Users/music/incoming" className="flex-1 bg-gray-800 text-white rounded px-3 py-2 text-sm border border-gray-700 focus:border-yellow-500 outline-none" />
                  <button className="bg-yellow-600 hover:bg-yellow-500 text-black px-4 py-2 rounded text-sm font-semibold">Browse</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-yellow-400">0</div>
                  <div className="text-xs text-gray-400">Files Watching</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-400">0</div>
                  <div className="text-xs text-gray-400">Auto Imported</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { if (watchFolderPath) { alert('Watch folder activated: ' + watchFolderPath); } }} className="flex-1 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white px-4 py-2 rounded-lg text-sm font-semibold">â¶ Start Watching</button>
                <button className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm">â¸ Stop</button>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-300">Settings</h4>
              <label className="flex items-center gap-2 text-sm text-gray-400"><input type="checkbox" defaultChecked className="accent-yellow-500" /> Auto-analyze new files (BPM, Key, Energy)</label>
              <label className="flex items-center gap-2 text-sm text-gray-400"><input type="checkbox" defaultChecked className="accent-yellow-500" /> Auto-detect duplicates</label>
              <label className="flex items-center gap-2 text-sm text-gray-400"><input type="checkbox" className="accent-yellow-500" /> Auto-add to playlist</label>
              <label className="flex items-center gap-2 text-sm text-gray-400"><input type="checkbox" defaultChecked className="accent-yellow-500" /> Watch subfolders</label>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Supported formats</label>
                <div className="flex flex-wrap gap-1">{['MP3','WAV','FLAC','AIFF','AAC','OGG','M4A','WMA'].map(f => (<span key={f} className="bg-gray-800 text-yellow-400 text-xs px-2 py-1 rounded font-mono">{f}</span>))}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin: Plan Feature Gating ── */}
      {currentUser?.is_admin && (
        <div className="bg-gradient-to-b from-gray-900 to-gray-950 border-t border-purple-500/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-purple-400 flex items-center gap-2"><Shield className="w-5 h-5" /> Plan Feature Gating</h3>
            <div className="flex gap-2">
              <button onClick={resetPlanFeatures} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-xs rounded text-gray-300">Reset Defaults</button>
              <button onClick={() => setShowPlanAdmin(!showPlanAdmin)} className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-xs rounded text-white">{showPlanAdmin ? 'Hide' : 'Show'} Matrix</button>
            </div>
          </div>
          {showPlanAdmin && Object.keys(featureLabels).length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 px-3 text-gray-400">Feature</th>
                    {['free', 'pro', 'unlimited'].map(plan => (
                      <th key={plan} className="text-center py-2 px-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${plan === 'free' ? 'bg-gray-700 text-gray-300' : plan === 'pro' ? 'bg-yellow-600 text-black' : 'bg-purple-600 text-white'}`}>
                          {plan.toUpperCase()}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(featureLabels).map(([feature, label]) => (
                    <tr key={feature} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="py-2 px-3 text-gray-300">{label}</td>
                      {['free', 'pro', 'unlimited'].map(plan => (
                        <td key={plan} className="text-center py-2 px-3">
                          <button
                            onClick={() => togglePlanFeature(plan, feature, !planFeatures[plan]?.[feature])}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${planFeatures[plan]?.[feature] ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-500'}`}
                          >
                            {planFeatures[plan]?.[feature] ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Unlock className="w-3 h-3 text-green-400" /> Enabled</span>
                <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-gray-500" /> Disabled</span>
                <span className="ml-auto">Changes apply immediately to all users on that plan</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ââ AI Mix Suggestions ââ */}
      {showMixSuggestions && (
        <div className="bg-gradient-to-b from-gray-900 to-gray-950 border-t border-pink-500/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-pink-400 flex items-center gap-2">ð¤ AI Mix Suggestions</h3>
            <button onClick={() => setShowMixSuggestions(false)} className="text-gray-400 hover:text-white text-xl">Ã</button>
          </div>
          <div className="space-y-4">
            <div className="flex gap-3 items-center">
              <select className="bg-gray-800 text-white rounded px-3 py-2 text-sm border border-gray-700 flex-1" onChange={(e) => setSelectedForMix(e.target.value ? Number(e.target.value) : null)} value={selectedForMix || ''}>
                <option value="">-- Select starting track --</option>
                {tracks.map(t => (<option key={t.id} value={t.id}>{t.title} - {t.artist} ({t.bpm} BPM, {t.camelotKey || 'N/A'})</option>))}
              </select>
              <button onClick={() => { if (selectedForMix) setShowMixSuggestions(true); }} className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap">â¨ Generate Mix</button>
            </div>
            {selectedForMix && (() => {
              const start = tracks.find(t => t.id === selectedForMix);
              if (!start) return null;
              const suggestions = tracks.filter(t => {
                if (t.id === selectedForMix) return false;
                let score = 0;
                if (t.bpm && start.bpm) { const diff = Math.abs(t.bpm - start.bpm); if (diff <= 3) score += 3; else if (diff <= 8) score += 2; else if (diff <= 15) score += 1; }
                if (t.camelotKey && start.camelotKey) { const sNum = parseInt(start.camelotKey); const tNum = parseInt(t.camelotKey); const sMin = start.camelotKey.includes('A'); const tMin = t.camelotKey.includes('A'); if (tNum === sNum && tMin === sMin) score += 3; else if (tNum === sNum && tMin !== sMin) score += 2; else if (tMin === sMin && (tNum === (sNum % 12) + 1 || tNum === ((sNum + 10) % 12) + 1)) score += 2; }
                if (t.energy && start.energy) { const diff = Math.abs(t.energy - start.energy); if (diff <= 10) score += 2; else if (diff <= 20) score += 1; }
                t._mixScore = score;
                return score >= 3;
              }).sort((a, b) => (b._mixScore || 0) - (a._mixScore || 0)).slice(0, 10);
              return (
                <div className="space-y-2">
                  <div className="text-sm text-gray-400">Starting from: <span className="text-white font-semibold">{start.title}</span> ({start.bpm} BPM, {start.camelotKey}, Energy: {start.energy})</div>
                  {suggestions.length === 0 ? (<div className="text-gray-500 text-sm py-4 text-center">Add more tracks with BPM/Key data to get suggestions</div>) : suggestions.map((t, i) => (
                    <div key={t.id} className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3 hover:bg-gray-800 transition-colors">
                      <span className="text-pink-400 font-bold text-lg w-6">{i + 1}</span>
                      <div className="flex-1">
                        <div className="text-white text-sm font-medium">{t.title}</div>
                        <div className="text-gray-400 text-xs">{t.artist}</div>
                      </div>
                      <div className="flex gap-4 text-xs">
                        <span className="text-blue-400">{t.bpm} BPM</span>
                        <span className="text-cyan-500/70 font-mono">{t.camelotKey || '?'}</span>
                        <span className="text-green-400">E:{t.energy || '?'}</span>
                      </div>
                      <div className="flex gap-1">{Array.from({length: 5}, (_, j) => (<span key={j} className={j < (t._mixScore || 0) ? 'text-pink-400' : 'text-gray-700'}>â</span>))}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Mixable Tracks Panel ── */}
      {showMixPanel && selectedTrack && (
        <div className="fixed right-0 top-14 bottom-12 w-80 bg-gray-950/98 backdrop-blur-md border-l border-cyan-500/20 z-50 flex flex-col shadow-2xl shadow-black/60">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/60 bg-gray-900/80">
            <span className="text-[10px] font-bold text-cyan-400/80 tracking-[0.2em]">MIXABLE TRACKS</span>
            <button onClick={() => setShowMixPanel(false)} className="text-slate-500 hover:text-white transition-colors"><X size={14}/></button>
          </div>
          <div className="px-3 py-2 border-b border-slate-800/40 bg-gray-900/40">
            <div className="text-[10px] text-slate-400">Playing: <span className="text-white font-medium">{selectedTrack.title?.substring(0, 30)}</span></div>
            <div className="flex gap-2 mt-0.5">
              <span className="text-[10px] text-cyan-400 font-medium">{selectedTrack.analysis?.key || '?'}</span>
              <span className="text-[10px] text-purple-400">{selectedTrack.analysis?.bpm ? (Math.round(selectedTrack.analysis.bpm * 10) / 10) + ' BPM' : '?'}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredTracks
              .filter((t) => t.id !== selectedTrack.id && t.analysis?.key)
              .map((t) => ({track: t, score: mixScore(selectedTrack.analysis?.key || '', selectedTrack.analysis?.bpm || 0, t.analysis?.key || '', t.analysis?.bpm || 0)}))
              .sort((a, b) => b.score.total - a.score.total)
              .map(({track: t, score}) => (
                <div key={t.id}
                  onClick={() => setSelectedTrack(t)}
                  className={"flex items-center gap-2 px-3 py-2 border-b border-slate-800/20 cursor-pointer hover:bg-slate-800/50 transition-colors" + (selectedTrack.id === t.id ? " bg-cyan-500/10" : "")}>
                  <div className={"w-8 h-8 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 " + (score.total >= 80 ? "bg-green-500/20 text-green-400" : score.total >= 60 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400")}>
                    {score.total}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-white truncate">{t.title}</div>
                    <div className="text-[9px] text-slate-500 truncate">{t.artist || 'Unknown'}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] text-cyan-400">{t.analysis?.key || '?'}</div>
                    <div className="text-[9px] text-slate-500">{t.analysis?.bpm ? Math.round(t.analysis.bpm * 10) / 10 : '?'}</div>
                  </div>
                  <div className={"text-[8px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 " + (score.verdict === 'Perfect' ? "bg-green-500/20 text-green-400" : score.verdict === 'Great' ? "bg-emerald-500/20 text-emerald-400" : score.verdict === 'Good' ? "bg-yellow-500/20 text-yellow-400" : score.verdict === 'OK' ? "bg-orange-500/20 text-orange-400" : "bg-red-500/20 text-red-400")}>
                    {score.verdict}
                  </div>
                </div>
              ))
            }
            {filteredTracks.filter((t) => t.id !== selectedTrack.id && t.analysis?.key).length === 0 && (
              <div className="text-center py-8 text-slate-500 text-xs">No analyzed tracks to compare</div>
            )}
          </div>
        </div>
      )}

      {/* ── Analyzed Tracks Panel ── */}
      {showAnalyzed && (
        <div className="bg-gray-900/95 border border-gray-700/50 rounded-xl p-4 mb-3 mx-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2"><CheckSquare size={14} className="text-green-400" /> Analyzed Tracks</h3>
            <button onClick={() => { setShowAnalyzed(false); setActiveModule(null); }} className="text-gray-400 hover:text-white"><X size={14} /></button>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {tracks.filter((t) => t.bpm && t.key).length === 0 ? (
              <p className="text-gray-500 text-xs text-center py-4">No analyzed tracks yet</p>
            ) : (
              tracks.filter((t) => t.bpm && t.key).map((t) => (
                <div key={t.id} onClick={() => setSelectedTrack(t)} className={`flex items-center gap-2 p-1.5 rounded cursor-pointer text-xs ${selectedTrack?.id === t.id ? 'bg-blue-600/30 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
                  <CheckSquare size={10} className="text-green-400 flex-shrink-0" />
                  <span className="truncate flex-1">{t.title || t.filename}</span>
                  <span className="text-gray-500 flex-shrink-0">{t.bpm} BPM</span>
                  <span className="text-gray-500 flex-shrink-0">{t.key}</span>
                </div>
              ))
            )}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-700/50 text-xs text-gray-500">{tracks.filter((t) => t.bpm && t.key).length} / {tracks.length} tracks analyzed</div>
        </div>
      )}
</div>
    
    </div>
  );
}

// âÂÂâÂÂ Small helpers âÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂâÂÂ
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-bg-primary/50">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className="text-white text-xs font-medium truncate max-w-[200px] text-right">{value}</span>
    

      {/* ── Metadata Edit Modal ── */}
      


      {/* Keyboard Shortcuts Help Panel */}
      {showShortcuts && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
          <div className="bg-gray-900 border border-cyan-500/30 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl shadow-cyan-500/10" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><span className="text-cyan-400">⌨</span> Raccourcis Clavier</h2>
              <button onClick={() => setShowShortcuts(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="space-y-1.5 text-sm">
              {[
                ['Space', 'Play / Pause'],
                    ['\u2190 / \u2192', 'Reculer / Avancer de 5s'],
                    ['M', 'Mute / Unmute'],
                ['L', 'Loop intelligent (IN → OUT → Toggle)'],
                ['[', 'Définir Loop IN'],
                [']', 'Définir Loop OUT'],
                ['Escape', 'Désactiver le loop'],
                ['1-8', 'Aller au Cue Point'],
                ['?', 'Afficher / Masquer cette aide',
                ['+ / -', 'Vitesse de lecture +/- 5%'],
                ['0', 'Reset vitesse (1.00x)']],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between py-1.5 border-b border-gray-800/50 last:border-0">
                  <kbd className="px-2.5 py-1 bg-gray-800 border border-gray-700 rounded-md text-cyan-400 font-mono text-xs min-w-[40px] text-center">{key}</kbd>
                  <span className="text-gray-300 text-right">{desc}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-600 mt-4 text-center">Appuie sur ? pour fermer</p>
          </div>
        </div>
      )}


      {/* ── Toast Notifications ── */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-xl backdrop-blur-sm border text-sm font-medium animate-[slideIn_0.3s_ease-out] ${
            t.type === 'success' ? 'bg-emerald-500/90 border-emerald-400/50 text-white' :
            t.type === 'error' ? 'bg-red-500/90 border-red-400/50 text-white' :
            'bg-slate-700/90 border-slate-500/50 text-slate-100'
          }`}>
            {t.type === 'success' && <CheckCircle2 size={16} />}
            {t.type === 'error' && <XCircle size={16} />}
            {t.type === 'info' && <Activity size={16} />}
            <span>{t.msg}</span>
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="ml-1 opacity-60 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      
      {/* ── Keyboard Shortcuts Modal ── */}
      {showShortcutsModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowShortcutsModal(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Raccourcis clavier</h3>
              <button onClick={() => setShowShortcutsModal(false)} className="text-slate-400 hover:text-white"><XCircle size={20} /></button>
            </div>
            <div className="space-y-2">
              {[
                ['Ctrl+F', 'Rechercher'],
                ['Ctrl+A', 'Tout sélectionner'],
                ['Shift+Clic', 'Sélection par plage'],
                ['Ctrl+Clic', 'Sélection multiple'],
                ['\u2191 / \u2193', 'Naviguer entre morceaux'],
                ['Suppr / Retour', 'Supprimer sélection'],
                ['Esc', 'Fermer / Désélectionner'],
                ['?', 'Afficher ce menu'],
                ['Q', 'Quick Mix - Prochain morceau compatible'],
                ['T', 'Ouvrir le Tap BPM'],
                ['C', 'Filtrer morceaux compatibles'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-700/50">
                  <kbd className="px-2 py-0.5 rounded bg-slate-700 text-cyan-400 font-mono text-xs border border-slate-600">{key}</kbd>
                  <span className="text-sm text-slate-300">{desc}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[10px] text-slate-500 text-center">Appuyez sur ? pour afficher/masquer</p>
          </div>
        </div>
      )}
<style>{`@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
</div>
  );
}
