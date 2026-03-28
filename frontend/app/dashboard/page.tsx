// @ts-nocheck
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, Music2, Loader2, CheckCircle2, XCircle, Download, Trash2, Clock,
  Activity, Hash, Disc3, ChevronDown, ChevronUp, ExternalLink, User, Tag,
  Calendar, AlbumIcon, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Search, MoreVertical, Zap, Wand2, Type, Disc, RefreshCw, Star, Filter,
  Grid3X3, List as ListIcon, Check, X, Music, Headphones, ArrowUpDown, Folder,
  ZoomIn, ZoomOut, CheckSquare, Square, AlertTriangle, Sparkles, Image
, SlidersHorizontal, ListMusic, Copy, BarChart3, Compass, FolderSearch, Lightbulb, PenSquare, LayoutGrid} from 'lucide-react';
import { uploadTrack, analyzeTrack, pollTrackUntilDone, exportRekordbox, listTracks, deleteTrack, getTrack } from '@/lib/api';
import type { Track, CuePoint } from '@/types';
import TrackOrganizer from '@/components/TrackOrganizer';
import { CUE_COLORS as CUE_COLOR_MAP } from '@/types';

// Ã¢ÂÂÃ¢ÂÂ Constants Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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

function getCompatibleKeys(key: string): string[] {
  const cam = CAMELOT_MAP[key];
  if (!cam) return [];
  const num = parseInt(cam);
  const letter = cam.slice(-1);
  const compat = [
    cam,
    `${(num % 12) + 1}${letter}`,
    `${((num - 2 + 12) % 12) || 12}${letter}`,
    `${num}${letter === 'A' ? 'B' : 'A'}`,
  ];
  const rev: Record<string, string> = {};
  Object.entries(CAMELOT_MAP).forEach(([k, v]) => { if (!rev[v]) rev[v] = k; });
  return compat.map(c => rev[c]).filter(Boolean);
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
function handleTap(): number {
  const now = Date.now();
  tapTimesRef.current.push(now);
  if (tapTimesRef.current.length > 8) tapTimesRef.current.shift();
  if (tapTimesRef.current.length < 2) return 0;
  const intervals = [];
  for (let i = 1; i < tapTimesRef.current.length; i++) {
    intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
  }
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  return Math.round(60000 / avg * 10) / 10;
}


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

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// MAIN DASHBOARD
// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
export default function DashboardPage() {
  // Ã¢ÂÂÃ¢ÂÂ State Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'bpm' | 'key' | 'title'>('date');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; track: Track } | null>(null);
  const [metadataPanel, setMetadataPanel] = useState<Track | null>(null);
  const [metadataSuggestions, setMetadataSuggestions] = useState<Record<string, string> | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [organizerTrack, setOrganizerTrack] = useState<Track | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [waveformReady, setWaveformReady] = useState(false);
  // ââ New feature states ââ
  const [tapBpm, setTapBpm] = useState<number>(0);
  const [loopIn, setLoopIn] = useState<number | null>(null);
  const [loopOut, setLoopOut] = useState<number | null>(null);
  const [loopActive, setLoopActive] = useState(false);
  const [showHotCues, setShowHotCues] = useState(true);
  const [filterBpmMin, setFilterBpmMin] = useState<number>(0);
  const [filterBpmMax, setFilterBpmMax] = useState<number>(999);
  const [filterKey, setFilterKey] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [compatTrack, setCompatTrack] = useState<any>(null);
  const loopRegionRef = useRef<any>(null);
  const [waveformZoom, setWaveformZoom] = useState<number>(1);
  const [showBeatGrid, setShowBeatGrid] = useState(false);
  const [trackNotes, setTrackNotes] = useState<Record<number, string>>({});
  const [showNotes, setShowNotes] = useState(false);
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
  const [showPlaylistPanel, setShowPlaylistPanel] = useState(false);
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
  const [editingTrackId, setEditingTrackId] = useState(null);
  const [editField, setEditField] = useState('');
  const [editValue, setEditValue] = useState('');
  const [batchSelected, setBatchSelected] = useState([]);
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchField, setBatchField] = useState('genre');
  const [batchValue, setBatchValue] = useState('');
  const [viewMode, setViewMode] = useState('table');
  const [showCamelotWheel, setShowCamelotWheel] = useState(false);
  const [energyFilter, setEnergyFilter] = useState([0, 100]);
  const [bpmFilter, setBpmFilter] = useState([0, 300]);
  const [showWatchFolder, setShowWatchFolder] = useState(false);
  const [watchFolderPath, setWatchFolderPath] = useState('');
  const [waveformMode, setWaveformMode] = useState('standard');
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineEditField, setInlineEditField] = useState('');
  const [inlineEditValue, setInlineEditValue] = useState('');
  const [showMixSuggestions, setShowMixSuggestions] = useState(false);
  const [selectedForMix, setSelectedForMix] = useState(null);
  const [gridView, setGridView] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState('eq');
  const [keyFilter, setKeyFilter] = useState('');

  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<any>(null);
  const regionsRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const spectralColorsRef = useRef<{r:number,g:number,b:number}[] | null>(null);

  // Ã¢ÂÂÃ¢ÂÂ Load tracks on mount Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  useEffect(() => { loadTracks(); }, []);

  async function loadTracks() {
    try {
      const data = await listTracks(1, 100);
      setTracks(data.tracks);
    } catch {}
  }

  // Ã¢ÂÂÃ¢ÂÂ Wavesurfer init (ALWAYS render the div, never unmount it) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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
        cursorColor: '#fff',
        cursorWidth: 2,
        height: 120,
        normalize: true,
        fillParent: true,
        minPxPerSec: 1,
        autoScroll: false,
        autoCenter: false,
        dragToSeek: true,
        hideScrollbar: true,
        plugins: [regions],
        waveColor: '#1a1730',
        progressColor: 'rgba(124,58,237,0.15)',
        renderFunction: (peaks: any, ctx: CanvasRenderingContext2D) => {
          const colors = spectralColorsRef.current;
          const { width, height } = ctx.canvas;
          const ch = peaks[0] as Float32Array;
          const bw = 3, gap = 1, step = bw + gap;
          const numBars = Math.floor(width / step);
          const mid = height / 2;
          ctx.clearRect(0, 0, width, height);
          for (let i = 0; i < numBars; i++) {
            const idx = Math.min(Math.floor((i / numBars) * (ch.length / 2)) * 2, ch.length - 2);
            const amp = Math.max(Math.abs(ch[idx] || 0), Math.abs(ch[idx + 1] || 0));
            const barH = Math.max(1, amp * height * 0.92);
            const ci = colors ? Math.min(Math.floor((i / numBars) * colors.length), colors.length - 1) : -1;
            const c = ci >= 0 && colors ? colors[ci] : { r: 79, g: 74, b: 133 };
            ctx.shadowColor = `rgba(${c.r},${c.g},${c.b},0.5)`;
            ctx.shadowBlur = 6;
            ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
            const x = i * step;
            ctx.beginPath();
            ctx.roundRect(x, mid - barH / 2, bw, barH, 1);
            ctx.fill();
          }
          ctx.shadowBlur = 0;
        },
      });

      ws.on('play', () => setIsPlaying(true));
      ws.on('pause', () => setIsPlaying(false));
      ws.on('timeupdate', (t: number) => setCurrentTime(t));
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

  // Ã¢ÂÂÃ¢ÂÂ Zoom handler Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  function handleZoom(direction: 'in' | 'out') {
    if (!wavesurferRef.current) return;
    const ws = wavesurferRef.current;
    let newZoom = zoomLevel;
    if (direction === 'in') {
      newZoom = Math.min(zoomLevel * 2, 200);
    } else {
      newZoom = Math.max(zoomLevel / 2, 1);
    }
    setZoomLevel(newZoom);
    try { ws.zoom(newZoom); } catch {}
    if (newZoom > 1) {
      ws.options.autoScroll = true;
      ws.options.autoCenter = true;
    } else {
      ws.options.autoScroll = false;
      ws.options.autoCenter = false;
    }
  }

  // Ã¢ÂÂÃ¢ÂÂ Load track into waveform Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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

      selectedTrack.analysis?.drop_positions?.forEach((ms: number, i: number) => {
        regions.addRegion({
          start: ms / 1000,
          content: `DROP ${i + 1}`,
          color: '#e11d4890',
        });
      });
    });
  }, [selectedTrack]);

  // Ã¢ÂÂÃ¢ÂÂ Keyboard shortcuts (Ctrl+A) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Ã¢ÂÂÃ¢ÂÂ Player controls Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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
  function handleVolume(v: number) {
    setVolume(v);
    setMuted(v === 0);
    if (wavesurferRef.current) wavesurferRef.current.setVolume(v);
  }
  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (wavesurferRef.current) wavesurferRef.current.setVolume(next ? 0 : volume);
  }

  // Ã¢ÂÂÃ¢ÂÂ Multi-select toggle Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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

  // Ã¢ÂÂÃ¢ÂÂ File handling Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  async function handleFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (!file.name.match(/\.(mp3|wav|flac|aiff|aif|m4a|ogg)$/i)) {
        setError(`Format non supportÃ©: ${file.name}`);
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
        if (!selectedTrack) setSelectedTrack(uploaded);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erreur inattendue');
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

  // Ã¢ÂÂÃ¢ÂÂ Batch Analyze Audio (BPM, Key, Cues) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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

  // Ã¢ÂÂÃ¢ÂÂ Batch Analyze Metadata (Spotify, Genre, Cover) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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

  // Ã¢ÂÂÃ¢ÂÂ Context menu handler Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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
        setBatchProgress('GÃ©nÃ©ration des cue points...');
        try {
          await analyzeTrack(track.id);
          const done = await pollTrackUntilDone(track.id);
          setSelectedTrack(done);
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
          loadTracks();
        } catch {}
        break;
    }
  }

  // Ã¢ÂÂÃ¢ÂÂ Spotify search for metadata panel Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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
      setError(e instanceof Error ? e.message : 'Recherche metadata Ã©chouÃ©e');
    }
    setMetadataLoading(false);
  }

  // Ã¢ÂÂÃ¢ÂÂ Filtered + sorted tracks Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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
    .sort((a, b) => {
      switch (sortBy) {
        case 'bpm': return (a.analysis?.bpm || 0) - (b.analysis?.bpm || 0);
        case 'key': return (toCamelot(a.analysis?.key) || '').localeCompare(toCamelot(b.analysis?.key) || '');
        case 'title': return (a.title || a.original_filename).localeCompare(b.title || b.original_filename);
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

  const isLoading = uploading || analyzing;
  const selectedCount = selectedIds.size;

  // Ã¢ÂÂÃ¢ÂÂ Context Menu Actions Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  const CONTEXT_ACTIONS = [
    { label: 'Analyser Audio (BPM/Key/Cues)', icon: <Zap size={14} />, action: 'analyze' },
    { label: 'Rechercher Metadata (Spotify)', icon: <Sparkles size={14} />, action: 'analyze_metadata' },
    { label: 'GÃ©nÃ©rer les Cue Points', icon: <Disc3 size={14} />, action: 'cue_points', separator: true },
    { label: 'Organiser (CatÃ©gorie/Tags)', icon: <Folder size={14} />, action: 'organize', separator: true },
    { label: 'Export Rekordbox XML', icon: <Download size={14} />, action: 'export_rekordbox' },
    { label: 'Supprimer', icon: <Trash2 size={14} />, action: 'delete', separator: true },
  ];

  // Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  // RENDER
  // Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

  // Computed: filtered + sorted tracks

  const filteredTracks = filtered.filter(t => {
    const bpm = t.analysis?.bpm || 0;
    if (filterBpmMin > 0 && bpm < filterBpmMin) return false;
    if (filterBpmMax < 999 && bpm > filterBpmMax) return false;
    if (filterKey && t.analysis?.key !== filterKey) return false;
    return true;
  });

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
    return dir * (new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  });

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden" onClick={() => setCtxMenu(null)}>

      {/* Ã¢ÂÂÃ¢ÂÂ TOP: Waveform Player (ALWAYS mounted) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <div className="bg-bg-secondary border-b border-slate-800/60 px-1 py-2 flex-shrink-0">
        {selectedTrack && (
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3 min-w-0">
              {/* Cover art */}
              {selectedTrack.artwork_url ? (
                <img src={selectedTrack.artwork_url} alt="" className="w-12 h-12 rounded-lg object-cover shadow-lg" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center shadow-lg">
                  <Music2 size={18} className="text-slate-500" />
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
              <span className="text-slate-500 tabular-nums">
                {msToTime(currentTime * 1000)} / {msToTime(duration * 1000)}
              </span>
            </div>
          </div>
        )}

        {/* Waveform container - ALWAYS mounted, never conditionally unmounted */}
        <div className="relative w-full rounded-lg bg-bg-primary border border-slate-800/40" style={{ height: 120, overflow: 'hidden' }}>
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
                  </div>
                </div>

          <div ref={waveformRef} className="w-full h-full" style={{ overflow: 'hidden' }} />
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
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-slate-500 text-sm">SÃ©lectionne un morceau pour voir la waveform</p>
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
                  <button key={i} onClick={() => { if (wavesurferRef.current) { wavesurferRef.current.seekTo(cue.time / (wavesurferRef.current.getDuration() * 1000)); } setTime(cue.time / 1000); }}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border bg-black/40"
                    style={{ backgroundColor: (CUE_COLOR_MAP[cue.type] || '#6366f1') + '22', borderColor: CUE_COLOR_MAP[cue.type] || '#6366f1', color: CUE_COLOR_MAP[cue.type] || '#6366f1' }}>
                    <span>{i + 1}</span><span className="uppercase opacity-70">{cue.type || 'CUE'}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={toggleMute} className="text-gray-400 hover:text-white transition-colors">{volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
                <input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => { const v = parseFloat(e.target.value); if (wavesurferRef.current) wavesurferRef.current.setVolume(v); }} className="w-20 h-1 accent-cyan-400" />
              </div>
            </div>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-5 bg-black/40 rounded-lg border border-gray-800/40 p-2">
                <div className="text-[9px] font-bold text-cyan-400/60 tracking-[0.2em] mb-1">HOT CUES</div>
                <div className="grid grid-cols-8 gap-1">
                  {Array.from({length: 8}).map((_, i) => (
                    <button key={i} onClick={() => { if (selectedTrack.cue_points && selectedTrack.cue_points[i] && wavesurferRef.current) { wavesurferRef.current.seekTo(selectedTrack.cue_points[i].time / (wavesurferRef.current.getDuration() * 1000)); } }}
                      className={'h-8 rounded text-[10px] font-bold transition-all ' + (selectedTrack.cue_points && selectedTrack.cue_points[i] ? 'text-white shadow-lg' : 'bg-gray-800/60 text-gray-600')}
                      style={selectedTrack.cue_points && selectedTrack.cue_points[i] ? {backgroundColor: CUE_COLOR_MAP[selectedTrack.cue_points[i].type] || '#6366f1', boxShadow: '0 0 8px ' + (CUE_COLOR_MAP[selectedTrack.cue_points[i].type] || '#6366f1') + '40'} : {}}>
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-3 bg-black/40 rounded-lg border border-gray-800/40 p-2">
                <div className="text-[9px] font-bold text-cyan-400/60 tracking-[0.2em] mb-1">LOOP</div>
                <div className="flex gap-1.5">
                  <button onClick={() => setLoopIn(wavesurferRef.current?.getCurrentTime())} className="flex-1 h-8 bg-gray-800/60 hover:bg-cyan-500/20 text-gray-400 hover:text-cyan-400 rounded text-[10px] font-bold transition-all border border-transparent hover:border-cyan-500/30">IN</button>
                  <button onClick={() => setLoopOut(wavesurferRef.current?.getCurrentTime())} className="flex-1 h-8 bg-gray-800/60 hover:bg-cyan-500/20 text-gray-400 hover:text-cyan-400 rounded text-[10px] font-bold transition-all border border-transparent hover:border-cyan-500/30">OUT</button>
                  <button onClick={() => setLoopActive(!loopActive)} className={'flex-1 h-8 rounded text-[10px] font-bold transition-all ' + (loopActive ? 'bg-cyan-500 text-white' : 'bg-gray-800/60 text-gray-400 hover:bg-cyan-500/20 hover:text-cyan-400 border border-transparent hover:border-cyan-500/30')}>LOOP</button>
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

        <div className="flex-1 min-h-0 overflow-y-auto">
{/* Ã¢ÂÂÃ¢ÂÂ TOOLBAR: Upload, Search, Batch Actions Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
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
            <span className="text-[10px] text-slate-400 font-medium">{selectedCount} sÃ©lectionnÃ©{selectedCount > 1 ? 's' : ''}</span>
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
              DÃ©sÃ©lectionner
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

        {dragOver && <span className="text-blue-400 text-xs font-medium">DÃ©pose tes fichiers ici...</span>}
        <div className="flex-1" />

        {/* Select all shortcut hint */}
        <span className="text-[10px] text-slate-600 hidden md:block">Ctrl+A = tout sÃ©lectionner</span>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="text" placeholder="Rechercher..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 bg-bg-primary border border-slate-800/50 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-600/50 w-44" />
        </div>
        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          className="px-2 py-1.5 bg-bg-primary border border-slate-800/50 rounded-lg text-xs text-slate-300 focus:outline-none">
          <option value="date">Date</option>
          <option value="bpm">BPM</option>
          <option value="key">Key</option>
          <option value="title">Titre</option>
        </select>
      </div>

      {error && (
        <div className="mx-4 mt-2 flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs flex-shrink-0">
          <XCircle size={14} />{error}
          <button onClick={() => setError('')} className="ml-auto"><X size={12} /></button>
        </div>
      )}

                {/* TRACK STATS */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-300">{filteredTracks.length} track{filteredTracks.length !== 1 ? 's' : ''}</span>
                    {filteredTracks.length !== tracks.length && (
                      <span className="text-[10px] text-gray-600">/ {tracks.length} total</span>
                    )}
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

      {/* Ã¢ÂÂÃ¢ÂÂ TRACK LIST Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}

                {/* FILTER BAR */}
                <div className="mb-2 space-y-2">
                  <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors">
                    <Filter size={12} /> {showFilters ? 'Hide Filters' : 'Filter & Sort'}
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
{(filterBpmMin > 0 || filterBpmMax < 999 || filterKey) && (
                        <button onClick={() => { setFilterBpmMin(0); setFilterBpmMax(999); setFilterKey(''); }} className="text-[10px] text-red-400 hover:text-red-300">Clear filters</button>
                      )}
                    </div>
                  )}
                </div>
      <div className="flex-1 overflow-y-auto">
        {/* Table header */}
        <div className="grid grid-cols-[28px_2fr_1fr_80px_60px_60px_80px_40px] gap-2 px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800/30 sticky top-0 bg-bg-primary z-10">
          <span />
          <span>Titre</span>
          <span>Genre</span>
          <span className="text-center">BPM</span>
          <span className="text-center">Key</span>
          <span className="text-center">Energy</span>
          <span className="text-center">DurÃ©e</span>
          <span />
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Headphones size={48} className="mb-4 opacity-30" />
            <p className="text-sm font-medium">Aucun morceau</p>
            <p className="text-xs mt-1">Glisse des fichiers audio ici ou clique sur &quot;Ajouter&quot;</p>
          </div>
        ) : (
          filteredTracks.map(track => {
            const a = track.analysis;
            const isActive = selectedTrack?.id === track.id;
            const isSelected = selectedIds.has(track.id);
            const statusDot = track.status === 'completed' ? 'bg-green-400'
              : track.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400';
            return (
              <div
                key={track.id}
                className={`grid grid-cols-[28px_2fr_1fr_80px_60px_60px_80px_40px] gap-2 px-4 py-2.5 items-center border-b border-slate-800/20 hover:bg-bg-elevated/40 cursor-pointer transition-colors group ${isActive ? 'bg-blue-600/10 border-l-2 border-l-blue-500' : isSelected ? 'bg-purple-600/10 border-l-2 border-l-purple-500' : 'border-l-2 border-l-transparent'}`}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    toggleSelect(track.id, e);
                  } else {
                    setSelectedTrack(track);
                  }
                }}
                onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, track }); }}
              >
                {/* Checkbox */}
                <div
                  onClick={(e) => toggleSelect(track.id, e)}
                  className="flex items-center justify-center cursor-pointer"
                >
                  {isSelected ? (
                    <CheckSquare size={15} className="text-cyan-500/70" />
                  ) : (
                    <Square size={15} className="text-slate-700 group-hover:text-slate-500 transition-colors" />
                  )}
                </div>

                {/* Title + Artist + Cover */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot}`} />
                  {track.artwork_url ? (
                    <img src={track.artwork_url} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0 shadow" />
                  ) : (
                    <div className="w-9 h-9 rounded bg-gradient-to-br from-slate-700/80 to-slate-800/80 flex items-center justify-center flex-shrink-0">
                      <Music2 size={14} className="text-slate-600" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">
                      {track.title || track.original_filename}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {track.artist || '\u2014'}
                    </p>
                  </div>
                </div>
                {/* Genre */}
                <span className="text-xs text-slate-400 truncate cursor-pointer hover:text-yellow-400 hover:bg-gray-800/50 px-1 rounded transition-colors" title="Double-click to edit" onDoubleClick={() => { setInlineEditId(track.id); setInlineEditField('genre'); setInlineEditValue(track.genre || ''); }}>
                  {inlineEditId === track.id && inlineEditField === 'genre' ? (
                    <input autoFocus type="text" value={inlineEditValue} onChange={(e) => setInlineEditValue(e.target.value)} onBlur={() => { setTracks(prev => prev.map(t => t.id === track.id ? {...t, genre: inlineEditValue} : t)); setInlineEditId(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { setTracks(prev => prev.map(t => t.id === track.id ? {...t, genre: inlineEditValue} : t)); setInlineEditId(null); } if (e.key === 'Escape') setInlineEditId(null); }} className="bg-gray-900 text-yellow-400 text-xs px-1 py-0 rounded border border-yellow-500/50 outline-none w-20" onClick={(e) => e.stopPropagation()} />
                  ) : (track.genre?.split(',')[0]?.trim() || 'â')}
                </span>
                {/* BPM */}
                <span className="text-xs text-blue-400 font-mono text-center font-bold">
                  {a?.bpm ? a.bpm.toFixed(1) : '\u2014'}
                </span>
                  {/* CAMELOT + COMPATIBILITY */}
                  {track.analysis?.key && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-cyan-400/80 font-mono">
                      {keyCamelot(track.analysis.key) || track.analysis.key}
                    </span>
                  )}
                  {selectedTrack && selectedTrack.id !== track.id && track.analysis?.key && selectedTrack.analysis?.key && (() => {
                    const score = mixScore(selectedTrack.analysis.key, selectedTrack.analysis.bpm || 0, track.analysis.key, track.analysis.bpm || 0);
                    const color = score.total >= 80 ? 'text-green-400 bg-green-500/20' : score.total >= 50 ? 'text-yellow-400 bg-yellow-500/20' : 'text-red-400 bg-red-500/20';
                    return <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${color}`}>{score.total}%</span>;
                  })()}
                {/* Key (Camelot) */}
                <span className="text-xs text-cyan-400 font-mono text-center font-bold">
                  {toCamelot(a?.key)}
                </span>
                {/* Energy */}
                <span className="text-xs text-yellow-400 font-mono text-center font-bold">
                  {energyToRating(a?.energy)}
                </span>
                {/* Duration */}
                <span className="text-xs text-slate-500 font-mono text-center">
                  {a?.duration_ms ? msToTime(a.duration_ms) : '\u2014'}
                </span>
                {/* Actions */}
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

      {/* Ã¢ÂÂÃ¢ÂÂ Context Menu Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
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

      {/* Ã¢ÂÂÃ¢ÂÂ Track Organizer Panel Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
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

      {/* Ã¢ÂÂÃ¢ÂÂ Metadata / Spotify Panel (slide-in, closable) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
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
                  <MetaRow label="AnnÃ©e" value={metadataPanel.year?.toString() || '\u2014'} />
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
                    {Object.keys(metadataSuggestions).length > 0 ? 'Suggestions trouvÃ©es' : 'Aucune suggestion'}
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
                        Les suggestions ont Ã©tÃ© appliquÃ©es automatiquement. Si elles sont incorrectes, vous pouvez modifier les tags manuellement.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-4">
                      Aucune nouvelle information trouvÃ©e pour ce morceau.
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
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-t border-gray-700 p-3">
        <div className="bg-gray-900/95 backdrop-blur-sm border-t border-gray-800/80">
        {/* Tab Bar */}
        <div className="flex items-center border-b border-gray-800/50 px-1">
          {[
            { id: 'eq', label: 'EQ' },
            { id: 'fx', label: 'FX' },
            { id: 'mix', label: 'MIX' },
            { id: 'playlists', label: 'PLAYLISTS' },
            { id: 'history', label: 'HISTORY' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveBottomTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.15em] transition-all duration-200 ${
                activeBottomTab === tab.id
                  ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-400/5'
                  : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent hover:bg-white/[0.02]'
              }`}>{tab.label}</button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-3">
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

      {/* ââ Interactive Camelot Wheel ââ */}
      {showCamelotWheel && (
        <div className="bg-gradient-to-b from-gray-900 to-gray-950 border-t border-purple-500/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-cyan-500/70 flex items-center gap-2">ðµ Camelot Wheel - Harmonic Mixing Guide</h3>
            <button onClick={() => setShowCamelotWheel(false)} className="text-gray-400 hover:text-white text-xl">Ã</button>
          </div>
          <div className="flex gap-8">
            <div className="relative w-80 h-80 mx-auto">
              <svg viewBox="0 0 400 400" className="w-full h-full">
                {Object.entries(CAMELOT_WHEEL).map(([key, val], i) => {
                  const isMinor = key.includes('A');
                  const num = parseInt(key);
                  const angle = ((num - 1) * 30 - 90) * Math.PI / 180;
                  const r = isMinor ? 120 : 170;
                  const x = 200 + r * Math.cos(angle);
                  const y = 200 + r * Math.sin(angle);
                  const isSelected = selectedForMix && tracks.find(t => t.id === selectedForMix)?.camelotKey === key;
                  const compatible = selectedForMix ? (() => {
                    const selTrack = tracks.find(t => t.id === selectedForMix);
                    if (!selTrack) return false;
                    const selNum = parseInt(selTrack.camelotKey);
                    const selIsMinor = selTrack.camelotKey?.includes('A');
                    const curNum = parseInt(key);
                    const curIsMinor = key.includes('A');
                    return (curNum === selNum && curIsMinor !== selIsMinor) || (curIsMinor === selIsMinor && (curNum === selNum || curNum === (selNum % 12) + 1 || curNum === ((selNum + 10) % 12) + 1));
                  })() : false;
                  const trackCount = tracks.filter(t => t.camelotKey === key).length;
                  const colors = ['#ff6b6b','#ff9f43','#feca57','#48dbfb','#0abde3','#10ac84','#1dd1a1','#54a0ff','#5f27cd','#c44569','#f78fb3','#3dc1d3'];
                  const color = colors[(num - 1) % 12];
                  return (
                    <g key={key}>
                      <circle cx={x} cy={y} r={isSelected ? 28 : compatible ? 25 : 22} fill={isSelected ? color : compatible ? color + '99' : '#1a1a2e'} stroke={color} strokeWidth={isSelected ? 3 : compatible ? 2 : 1} opacity={selectedForMix ? (isSelected || compatible ? 1 : 0.3) : 1} className="cursor-pointer transition-all duration-200" />
                      <text x={x} y={y - 4} textAnchor="middle" fill="white" fontSize={isSelected ? "13" : "11"} fontWeight={isSelected ? "bold" : "normal"}>{key}</text>
                      <text x={x} y={y + 10} textAnchor="middle" fill="#aaa" fontSize="8">{trackCount > 0 ? trackCount + ' tracks' : ''}</text>
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
                <div className="bg-gray-800/50 rounded p-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-purple-400"></span> AâB = Mode change (minor/major)</div>
              </div>
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-gray-300 mb-2">Select a track to see compatible keys:</h4>
                <select className="bg-gray-800 text-white rounded px-3 py-2 w-full text-sm border border-gray-700" onChange={(e) => setSelectedForMix(e.target.value ? Number(e.target.value) : null)} value={selectedForMix || ''}>
                  <option value="">-- Choose a track --</option>
                  {tracks.filter(t => t.camelotKey).map(t => (
                    <option key={t.id} value={t.id}>{t.title} - {t.artist} ({t.camelotKey})</option>
                  ))}
                </select>
              </div>
              {selectedForMix && (() => {
                const sel = tracks.find(t => t.id === selectedForMix);
                if (!sel || !sel.camelotKey) return null;
                const selNum = parseInt(sel.camelotKey);
                const selIsMinor = sel.camelotKey.includes('A');
                const compatibleTracks = tracks.filter(t => {
                  if (!t.camelotKey || t.id === selectedForMix) return false;
                  const tNum = parseInt(t.camelotKey);
                  const tIsMinor = t.camelotKey.includes('A');
                  return (tNum === selNum && tIsMinor !== selIsMinor) || (tIsMinor === selIsMinor && (tNum === selNum || tNum === (selNum % 12) + 1 || tNum === ((selNum + 10) % 12) + 1));
                });
                return (
                  <div className="mt-3 max-h-40 overflow-y-auto">
                    <h4 className="text-sm font-semibold text-green-400 mb-1">{compatibleTracks.length} compatible tracks:</h4>
                    {compatibleTracks.map(t => (
                      <div key={t.id} className="text-xs text-gray-300 py-1 px-2 bg-gray-800/40 rounded mb-1 flex justify-between">
                        <span>{t.title} - {t.artist}</span>
                        <span className="text-cyan-500/70 font-mono">{t.camelotKey} | {t.bpm} BPM</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
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

      {/* ── Feature Toolbar ── */}
      <div className="flex items-center justify-center gap-1 py-2 px-3 bg-gray-900/90 backdrop-blur-sm border-t border-gray-800/50">
        {[
          { icon: 'Sparkles', label: 'Smart Playlist', active: showSmartPlaylist, toggle: () => setShowSmartPlaylist(!showSmartPlaylist) },
          { icon: 'Copy', label: 'Duplicates', active: showDuplicates, toggle: () => setShowDuplicates(!showDuplicates) },
          { icon: 'Download', label: 'Export', active: showExport, toggle: () => setShowExport(!showExport) },
          { icon: 'BarChart3', label: 'Stats', active: showStats, toggle: () => setShowStats(!showStats) },
          { icon: 'PenSquare', label: 'Batch Edit', active: batchSelected.length > 0, toggle: () => { setBatchSelected(tracks.map(t => t.id)); setShowBatchEdit(!showBatchEdit); } },
          { icon: 'Compass', label: 'Camelot', active: showCamelotWheel, toggle: () => setShowCamelotWheel(!showCamelotWheel) },
          { icon: 'FolderSearch', label: 'Watch', active: showWatchFolder, toggle: () => setShowWatchFolder(!showWatchFolder) },
          { icon: 'Lightbulb', label: 'AI Mix', active: showMixSuggestions, toggle: () => setShowMixSuggestions(!showMixSuggestions) },
          { icon: 'LayoutGrid', label: gridView ? 'List' : 'Grid', active: gridView, toggle: () => setGridView(!gridView) },
        ].map((btn, i) => {
          const IconMap = { Sparkles, Copy, Download, BarChart3, PenSquare, Compass, FolderSearch, Lightbulb, LayoutGrid };
          const Icon = IconMap[btn.icon];
          return (
            <button key={i} onClick={btn.toggle} title={btn.label}
              className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium tracking-wide transition-all duration-200 ${
                btn.active
                  ? 'bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
              }`}>
              <Icon size={14} />
              <span className="hidden sm:inline">{btn.label}</span>
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}

// Ã¢ÂÂÃ¢ÂÂ Small helpers Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function MetaRow({ label, value }: { label: string; value: string }) {
  // ââ Keyboard Shortcuts ââââââââââââââââââââââââââââââââââââââââââââââââââ
  
  // Waveform zoom effect
  useEffect(() => {
    if (wavesurferRef.current) {
      try { wavesurferRef.current.zoom(waveformZoom * 50); } catch(e) {}
    }
  }, [waveformZoom]);

  // Sort tracks

useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      const ws = wavesurferRef.current;
      if (!ws) return;
      switch (e.code) {
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
  }, [selectedTrack, loopIn, loopOut]);

  // ââ Loop playback logic âââââââââââââââââââââââââââââââââââââââââââââââââ
  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws || !loopActive || loopIn === null || loopOut === null) return;
    const regions = regionsRef.current;
    if (regions) {
      if (loopRegionRef.current) { try { loopRegionRef.current.remove(); } catch {} }
      loopRegionRef.current = regions.addRegion({
        start: loopIn, end: loopOut,
        color: 'rgba(236,72,153,0.15)',
        drag: false, resize: true,
      });
    }
    const onTimeUpdate = () => {
      if (ws.getCurrentTime() >= loopOut) ws.seekTo(loopIn / ws.getDuration());
    };
    ws.on('timeupdate', onTimeUpdate);
    return () => { ws.un('timeupdate', onTimeUpdate); };
  }, [loopActive, loopIn, loopOut]);




  return (
    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-bg-primary/50">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className="text-white text-xs font-medium truncate max-w-[200px] text-right">{value}</span>
            </div>
</div>
  );
}
