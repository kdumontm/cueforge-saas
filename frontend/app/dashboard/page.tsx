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
} from 'lucide-react';
import { uploadTrack, analyzeTrack, pollTrackUntilDone, exportRekordbox, listTracks, deleteTrack, getTrack } from '@/lib/api';
import type { Track, CuePoint } from '@/types';
import TrackOrganizer from '@/components/TrackOrganizer';
import { CUE_COLORS as CUE_COLOR_MAP } from '@/types';

// ââ Constants âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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

// ── Camelot Wheel System (Harmonic Mixing) ────────────────────────────────
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

// ── BPM Tap Tempo utility ─────────────────────────────────────────────────
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


// ── RGB DJ Waveform: Frequency-band spectral analysis (Rekordbox-style) ──
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

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// MAIN DASHBOARD
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export default function DashboardPage() {
  // ââ State âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
  // ── New feature states ──
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

  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<any>(null);
  const regionsRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const spectralColorsRef = useRef<{r:number,g:number,b:number}[] | null>(null);

  // ââ Load tracks on mount ââââââââââââââââââââââââââââââââââââââââââââââ
  useEffect(() => { loadTracks(); }, []);

  async function loadTracks() {
    try {
      const data = await listTracks(1, 100);
      setTracks(data.tracks);
    } catch {}
  }

  // ââ Wavesurfer init (ALWAYS render the div, never unmount it) ââââââââ
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

  // ââ Zoom handler ââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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

  // ââ Load track into waveform ââââââââââââââââââââââââââââââââââââââââââ
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

  // ââ Keyboard shortcuts (Ctrl+A) âââââââââââââââââââââââââââââââââââââ
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

  // ââ Player controls âââââââââââââââââââââââââââââââââââââââââââââââââââ
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

  // ââ Multi-select toggle ââââââââââââââââââââââââââââââââââââââââââââââââ
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

  // ââ File handling âââââââââââââââââââââââââââââââââââââââââââââââââââââ
  async function handleFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (!file.name.match(/\.(mp3|wav|flac|aiff|aif|m4a|ogg)$/i)) {
        setError(`Format non support\u00e9: ${file.name}`);
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

  // ââ Batch Analyze Audio (BPM, Key, Cues) ââââââââââââââââââââââââââââ
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

  // ââ Batch Analyze Metadata (Spotify, Genre, Cover) âââââââââââââââââââ
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

  // ââ Context menu handler ââââââââââââââââââââââââââââââââââââââââââââââ
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
        setBatchProgress('G\u00e9n\u00e9ration des cue points...');
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

  // ââ Spotify search for metadata panel âââââââââââââââââââââââââââââââââ
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
      setError(e instanceof Error ? e.message : 'Recherche metadata \u00e9chou\u00e9e');
    }
    setMetadataLoading(false);
  }

  // ââ Filtered + sorted tracks ââââââââââââââââââââââââââââââââââââââââââ
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

  // ââ Context Menu Actions ââââââââââââââââââââââââââââââââââââââââââââ
  const CONTEXT_ACTIONS = [
    { label: 'Analyser Audio (BPM/Key/Cues)', icon: <Zap size={14} />, action: 'analyze' },
    { label: 'Rechercher Metadata (Spotify)', icon: <Sparkles size={14} />, action: 'analyze_metadata' },
    { label: 'G\u00e9n\u00e9rer les Cue Points', icon: <Disc3 size={14} />, action: 'cue_points', separator: true },
    { label: 'Organiser (Cat\u00e9gorie/Tags)', icon: <Folder size={14} />, action: 'organize', separator: true },
    { label: 'Export Rekordbox XML', icon: <Download size={14} />, action: 'export_rekordbox' },
    { label: 'Supprimer', icon: <Trash2 size={14} />, action: 'delete', separator: true },
  ];

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // RENDER
  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden" onClick={() => setCtxMenu(null)}>

      {/* ââ TOP: Waveform Player (ALWAYS mounted) âââââââââââ */}
      <div className="bg-bg-secondary border-b border-slate-800/60 px-4 py-3 flex-shrink-0">
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
          <div ref={waveformRef} className="w-full h-full" style={{ overflow: 'hidden' }} />
          {!selectedTrack && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-slate-500 text-sm">S\u00e9lectionne un morceau pour voir la waveform</p>
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

        {/* Player controls + Cue badges */}
        {selectedTrack && (
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <button onClick={skipBack} className="p-1.5 text-slate-400 hover:text-white transition-colors">
                <SkipBack size={16} />
              </button>
              <button onClick={togglePlay} className="w-9 h-9 flex items-center justify-center bg-blue-600 hover:bg-blue-500 rounded-full text-white transition-all shadow-lg shadow-blue-600/20">
                {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
              </button>
              <button onClick={skipForward} className="p-1.5 text-slate-400 hover:text-white transition-colors">
                <SkipForward size={16} />
              </button>
            </div>
            {/* Cue point badges */}
            <div className="flex items-center gap-1 overflow-x-auto max-w-[50%] scrollbar-hide">
              {selectedTrack.cue_points?.map((cue, i) => {
                const color = CUE_COLOR_MAP[cue.color as keyof typeof CUE_COLOR_MAP] || '#2563eb';
                return (
                  <button
                    key={cue.id}
                    onClick={() => {
                      if (wavesurferRef.current) {
                        wavesurferRef.current.setTime(cue.position_ms / 1000);
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap hover:brightness-125 transition-all"
                    style={{
                      backgroundColor: color + '20',
                      color: color,
                      border: `1px solid ${color}40`,
                    }}
                    title={`${cue.name} \u2014 ${msToTime(cue.position_ms)}`}
                  >
                    <span className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-black"
                      style={{ backgroundColor: color, color: '#fff' }}>
                      {i + 1}
                    </span>
                    {cue.name}
                  </button>
                );
              })}
            </div>

              {/* ── HOT CUE PADS ── */}
              {selectedTrack?.cue_points && selectedTrack.cue_points.length > 0 && (
                <div className="mt-4 p-3 bg-[#0d0b1a] rounded-xl border border-purple-900/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">Hot Cue Pads</span>
                    <span className="text-[10px] text-gray-500">1-8 keys to trigger</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: 8 }).map((_, i) => {
                      const cue = selectedTrack.cue_points?.[i];
                      const colors: Record<string, string> = {
                        red: 'from-red-600 to-red-800', blue: 'from-blue-600 to-blue-800',
                        green: 'from-green-600 to-green-800', yellow: 'from-yellow-500 to-yellow-700',
                        purple: 'from-purple-600 to-purple-800', orange: 'from-orange-500 to-orange-700',
                        cyan: 'from-cyan-500 to-cyan-700', pink: 'from-pink-500 to-pink-700',
                        white: 'from-gray-400 to-gray-600',
                      };
                      const grad = cue ? (colors[cue.color] || colors.purple) : 'from-gray-800 to-gray-900';
                      return (
                        <button key={i} onClick={() => {
                          if (cue && wavesurferRef.current) {
                            const pos = cue.position_ms / 1000;
                            wavesurferRef.current.seekTo(pos / wavesurferRef.current.getDuration());
                          }
                        }}
                          className={`relative h-14 rounded-lg bg-gradient-to-b ${grad} border border-white/10 flex flex-col items-center justify-center transition-all ${cue ? 'hover:scale-105 hover:brightness-125 cursor-pointer shadow-lg' : 'opacity-30 cursor-default'}`}>
                          <span className="text-[10px] font-bold text-white/90">{i + 1}</span>
                          {cue && <span className="text-[8px] text-white/70 truncate max-w-full px-1">{cue.name}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── LOOP CONTROLS + TAP TEMPO + CAMELOT ── */}
              {selectedTrack && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {/* Loop Controls */}
                  <div className="p-2 bg-[#0d0b1a] rounded-lg border border-purple-900/30">
                    <span className="text-[10px] font-bold text-pink-400 uppercase tracking-wider block mb-1">Loop</span>
                    <div className="flex gap-1">
                      <button onClick={() => { const ws = wavesurferRef.current; if (ws) setLoopIn(ws.getCurrentTime()); }}
                        className={`flex-1 text-[10px] py-1 rounded ${loopIn !== null ? 'bg-pink-600 text-white' : 'bg-gray-800 text-gray-400'} hover:bg-pink-500 transition-colors`}>
                        IN {loopIn !== null ? loopIn.toFixed(1) + 's' : '[ '}
                      </button>
                      <button onClick={() => { const ws = wavesurferRef.current; if (ws) { setLoopOut(ws.getCurrentTime()); if (loopIn !== null) setLoopActive(true); } }}
                        className={`flex-1 text-[10px] py-1 rounded ${loopOut !== null ? 'bg-pink-600 text-white' : 'bg-gray-800 text-gray-400'} hover:bg-pink-500 transition-colors`}>
                        OUT {loopOut !== null ? loopOut.toFixed(1) + 's' : ' ]'}
                      </button>
                      <button onClick={() => { setLoopActive(a => !a); }}
                        className={`w-8 text-[10px] py-1 rounded font-bold ${loopActive ? 'bg-pink-500 text-white animate-pulse' : 'bg-gray-800 text-gray-500'}`}>
                        {loopActive ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    <span className="text-[9px] text-gray-600 mt-1 block">[ ] keys or L to toggle</span>
                  </div>

                  {/* Tap Tempo */}
                  <div className="p-2 bg-[#0d0b1a] rounded-lg border border-purple-900/30">
                    <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block mb-1">Tap Tempo</span>
                    <button onClick={() => setTapBpm(handleTap())}
                      className="w-full h-9 rounded bg-gradient-to-b from-cyan-700 to-cyan-900 hover:from-cyan-600 hover:to-cyan-800 text-white font-bold text-sm transition-all active:scale-95 border border-cyan-500/30">
                      TAP
                    </button>
                    <div className="text-center mt-1">
                      <span className="text-cyan-300 font-mono text-sm font-bold">{tapBpm > 0 ? tapBpm.toFixed(1) : '---'}</span>
                      <span className="text-[9px] text-gray-500 ml-1">BPM</span>
                    </div>
                  </div>

                  {/* Camelot / Harmonic Info */}
                  <div className="p-2 bg-[#0d0b1a] rounded-lg border border-purple-900/30">
                    <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider block mb-1">Harmonic</span>
                    {selectedTrack.analysis?.key ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-white">{keyCamelot(selectedTrack.analysis.key)}</span>
                          <span className="text-xs text-gray-400">{selectedTrack.analysis.key}</span>
                        </div>
                        <div className="text-[9px] text-gray-500 mt-1">
                          Mix with: {getCompatibleKeys(selectedTrack.analysis.key).map(k =>
                            <span key={k} className="inline-block bg-green-900/40 text-green-300 rounded px-1 mr-0.5 mb-0.5">{keyCamelot(k)} {k}</span>
                          )}
                        </div>
                      </>
                    ) : <span className="text-xs text-gray-500">Analyze first</span>}
                  </div>
                </div>
              )}

              {/* ── ENERGY METER ── */}
              {selectedTrack?.analysis?.energy && (
                <div className="mt-2 p-2 bg-[#0d0b1a] rounded-lg border border-purple-900/30">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">Energy</span>
                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: (selectedTrack.analysis.energy * 100) + '%',
                          background: selectedTrack.analysis.energy > 0.7 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' :
                            selectedTrack.analysis.energy > 0.4 ? 'linear-gradient(90deg, #22c55e, #f59e0b)' :
                            'linear-gradient(90deg, #3b82f6, #22c55e)',
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono text-yellow-300">{(selectedTrack.analysis.energy * 100).toFixed(0)}%</span>
                  </div>
                </div>
              )}

              {/* ── KEYBOARD SHORTCUTS LEGEND ── */}
              <div className="mt-2 flex flex-wrap gap-1">
                {[['Space','Play/Pause'],['1-8','Hot Cues'],['[','Loop In'],[']','Loop Out'],['L','Loop Toggle'],['Esc','Clear Loop']].map(([k,v]) =>
                  <span key={k} className="text-[9px] bg-gray-800/50 text-gray-500 rounded px-1.5 py-0.5 border border-gray-700/30">
                    <kbd className="text-purple-400 font-mono">{k}</kbd> {v}
                  </span>
                )}
              </div>
            {/* Volume */}
            <div className="flex items-center gap-2">
              <button onClick={toggleMute} className="text-slate-400 hover:text-white transition-colors">
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume}
                onChange={e => handleVolume(parseFloat(e.target.value))} className="w-20 accent-blue-500" />
            </div>
          </div>
        )}
      </div>

      {/* ââ TOOLBAR: Upload, Search, Batch Actions ââââââââââ */}
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
            <span className="text-[10px] text-slate-400 font-medium">{selectedCount} s\u00e9lectionn\u00e9{selectedCount > 1 ? 's' : ''}</span>
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
              D\u00e9s\u00e9lectionner
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

        {dragOver && <span className="text-blue-400 text-xs font-medium animate-pulse">D\u00e9pose tes fichiers ici...</span>}
        <div className="flex-1" />

        {/* Select all shortcut hint */}
        <span className="text-[10px] text-slate-600 hidden md:block">Ctrl+A = tout s\u00e9lectionner</span>

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

      {/* ââ TRACK LIST âââââââââââââââââââââââââââââââââââââââââ */}

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
          <span className="text-center">Dur\u00e9e</span>
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
                    <CheckSquare size={15} className="text-purple-400" />
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
                <span className="text-xs text-slate-400 truncate">
                  {track.genre?.split(',')[0]?.trim() || '\u2014'}
                </span>
                {/* BPM */}
                <span className="text-xs text-blue-400 font-mono text-center font-bold">
                  {a?.bpm ? a.bpm.toFixed(1) : '\u2014'}
                </span>
                  {/* CAMELOT + COMPATIBILITY */}
                  {track.analysis?.key && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">
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

      {/* ââ Context Menu âââââââââââââââââââââââââââââââââââââââ */}
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

      {/* ââ Track Organizer Panel ââââââââââââââââââââââââââââââ */}
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

      {/* ââ Metadata / Spotify Panel (slide-in, closable) ââââ */}
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
                      <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30">
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
                  <MetaRow label="Ann\u00e9e" value={metadataPanel.year?.toString() || '\u2014'} />
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
                    {Object.keys(metadataSuggestions).length > 0 ? 'Suggestions trouv\u00e9es' : 'Aucune suggestion'}
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
                        Les suggestions ont \u00e9t\u00e9 appliqu\u00e9es automatiquement. Si elles sont incorrectes, vous pouvez modifier les tags manuellement.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-4">
                      Aucune nouvelle information trouv\u00e9e pour ce morceau.
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
    </div>
  );
}

// ââ Small helpers ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function MetaRow({ label, value }: { label: string; value: string }) {
  // ── Keyboard Shortcuts ──────────────────────────────────────────────────
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

  // ── Loop playback logic ─────────────────────────────────────────────────
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


  return (
    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-bg-primary/50">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className="text-white text-xs font-medium truncate max-w-[200px] text-right">{value}</span>
    </div>
  );
}
