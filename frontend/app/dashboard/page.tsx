'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, Music2, Loader2, CheckCircle2, XCircle, Download, Trash2, Clock,
  Activity, Hash, Disc3, ChevronDown, ChevronUp, ExternalLink, User, Tag,
  Calendar, AlbumIcon, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Search, MoreVertical, Zap, Wand2, Type, Disc, RefreshCw, Star, Filter,
  Grid3X3, List as ListIcon, Check, X, Music, Headphones, ArrowUpDown, Folder,
  ZoomIn, ZoomOut
} from 'lucide-react';
import { uploadTrack, analyzeTrack, pollTrackUntilDone, exportRekordbox, listTracks, deleteTrack, getTrack } from '@/lib/api';
import type { Track, CuePoint } from '@/types';
import TrackOrganizer from '@/components/TrackOrganizer';
import { CUE_COLORS as CUE_COLOR_MAP } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────
const CAMELOT_WHEEL: Record<string, string> = {
  'C': '8B', 'Am': '8A', 'G': '9B', 'Em': '9A', 'D': '10B', 'Bm': '10A',
  'A': '11B', 'F#m': '11A', 'E': '12B', 'C#m': '12A', 'B': '1B', 'G#m': '1A',
  'F#': '2B', 'Ebm': '2A', 'Db': '3B', 'Bbm': '3A', 'Ab': '4B', 'Fm': '4A',
  'Eb': '5B', 'Cm': '5A', 'Bb': '6B', 'Gm': '6A', 'F': '7B', 'Dm': '7A',
  'C#': '3B', 'D#m': '2A', 'G#': '4B', 'A#': '6B', 'D#': '5B',
};

function toCamelot(key: string | null | undefined): string {
  if (!key) return '—';
  return CAMELOT_WHEEL[key] || key;
}

function msToTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function energyToRating(energy: number | null | undefined): string {
  if (energy == null) return '—';
  return String(Math.min(10, Math.max(1, Math.round(energy * 10))));
}

const CUE_TYPE_COLORS: Record<string, string> = {
  hot_cue: '#e11d48', loop: '#0891b2', fade_in: '#16a34a', fade_out: '#ea580c',
  load: '#ca8a04', phrase: '#2563eb', drop: '#e11d48', section: '#7c3aed',
};

// ── Context Menu Actions ──────────────────────────────────────────────────
interface CtxAction { label: string; icon: React.ReactNode; action: string; separator?: boolean; }

const CONTEXT_ACTIONS: CtxAction[] = [
  { label: 'Analyser le morceau', icon: <Zap size={14} />, action: 'analyze' },
  { label: 'Générer les Cue Points', icon: <Disc3 size={14} />, action: 'cue_points' },
  { label: 'Détecter le genre', icon: <Search size={14} />, action: 'detect_genre' },
  { label: 'Recherche Spotify / Metadata', icon: <Music size={14} />, action: 'spotify_lookup', separator: true },
  { label: 'Clean Title (Maj/Min)', icon: <Type size={14} />, action: 'clean_title' },
  { label: 'Parser Remix', icon: <RefreshCw size={14} />, action: 'parse_remix' },
  { label: 'Fixer les tags ID3', icon: <Tag size={14} />, action: 'fix_tags', separator: true },
  { label: 'Organiser (Catégorie/Tags)', icon: <Folder size={14} />, action: 'organize', separator: true },
  { label: 'Export Rekordbox XML', icon: <Download size={14} />, action: 'export_rekordbox' },
  { label: 'Supprimer', icon: <Trash2 size={14} />, action: 'delete' },
];

// ─────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  // ── State ─────────────────────────────────────────────────────────────
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'bpm' | 'key' | 'title'>('date');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; track: Track } | null>(null);
  const [metadataPanel, setMetadataPanel] = useState<Track | null>(null);
  const [organizerTrack, setOrganizerTrack] = useState<Track | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<any>(null);
  const regionsRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Load tracks on mount ──────────────────────────────────────────────
  useEffect(() => { loadTracks(); }, []);

  async function loadTracks() {
    try {
      const data = await listTracks(1, 100);
      setTracks(data.tracks);
    } catch {}
  }

  // ── Wavesurfer init ───────────────────────────────────────────────────
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
        waveColor: '#4F4A85',
        progressColor: '#7C3AED',
        cursorColor: '#fff',
        cursorWidth: 2,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 120,
        normalize: true,
        fillParent: true,
        minPxPerSec: 1,
        autoScroll: false,
        autoCenter: false,
        dragToSeek: true,
        hideScrollbar: true,
        plugins: [regions],
      });

      ws.on('play', () => setIsPlaying(true));
      ws.on('pause', () => setIsPlaying(false));
      ws.on('timeupdate', (t: number) => setCurrentTime(t));
      ws.on('ready', () => setDuration(ws.getDuration()));

      wavesurferRef.current = ws;
    }

    initWavesurfer();
    return () => { if (ws) ws.destroy(); };
  }, []);

  // ── Zoom handler ──────────────────────────────────────────────────────
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
    ws.zoom(newZoom);
    if (newZoom > 1) {
      ws.options.autoScroll = true;
      ws.options.autoCenter = true;
    } else {
      ws.options.autoScroll = false;
      ws.options.autoCenter = false;
    }
  }

  // ── Load track into waveform ──────────────────────────────────────────
  useEffect(() => {
    if (!selectedTrack || !wavesurferRef.current) return;
    const ws = wavesurferRef.current;
    const regions = regionsRef.current;

    // Reset zoom to overview when loading new track
    setZoomLevel(1);
    ws.zoom(1);

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

  // ── Player controls ───────────────────────────────────────────────────
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

  // ── File handling ─────────────────────────────────────────────────────
  async function handleFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (!file.name.match(/\.(mp3|wav|flac|aiff|aif|m4a|ogg)$/i)) {
        setError(`Format non supporté: ${file.name}`);
        continue;
      }
      setError('');
      setUploading(true);
      setProgress(`Upload: ${file.name}...`);
      try {
        const uploaded = await uploadTrack(file);
        setProgress(`Analyse: ${file.name}...`);
        setUploading(false);
        setAnalyzing(true);
        await analyzeTrack(uploaded.id);
        const done = await pollTrackUntilDone(uploaded.id, (t) => {
          if (t.status === 'analyzing') setProgress(`Analyse IA: ${file.name}...`);
          if (t.status === 'generating_cues') setProgress(`Cue points: ${file.name}...`);
        });
        setProgress('');
        setAnalyzing(false);
        loadTracks();
        if (!selectedTrack) setSelectedTrack(done);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erreur inattendue');
        setUploading(false);
        setAnalyzing(false);
        setProgress('');
      }
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, []);

  // ── Context menu handler ──────────────────────────────────────────────
  async function handleCtxAction(action: string, track: Track) {
    setCtxMenu(null);
    switch (action) {
      case 'analyze':
        setAnalyzing(true);
        setProgress(`Analyse: ${track.original_filename}...`);
        try {
          await analyzeTrack(track.id);
          const done = await pollTrackUntilDone(track.id);
          setSelectedTrack(done);
          loadTracks();
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : 'Analyse échouée');
        }
        setAnalyzing(false);
        setProgress('');
        break;
      case 'cue_points':
        setAnalyzing(true);
        setProgress('Génération des cue points...');
        try {
          await analyzeTrack(track.id);
          const done = await pollTrackUntilDone(track.id);
          setSelectedTrack(done);
          loadTracks();
        } catch {}
        setAnalyzing(false);
        setProgress('');
        break;
      case 'spotify_lookup':
      case 'detect_genre':
      case 'fix_tags':
        setMetadataPanel(track);
        break;
      case 'organize':
        setOrganizerTrack(track);
        break;
      case 'clean_title':
        break;
      case 'parse_remix':
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
          loadTracks();
        } catch {}
        break;
    }
  }

  // ── Filtered + sorted tracks ──────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden" onClick={() => setCtxMenu(null)}>

      {/* ── TOP: Waveform Player ─────────────────────────────── */}
      <div className="bg-bg-secondary border-b border-slate-800/60 px-4 py-3 flex-shrink-0">
        {selectedTrack ? (
          <>
            {/* Track info bar */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3 min-w-0">
                {selectedTrack.artwork_url && (
                  <img src={selectedTrack.artwork_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">
                    {selectedTrack.title || selectedTrack.original_filename}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {selectedTrack.artist || 'Artiste inconnu'}
                    {selectedTrack.analysis?.bpm ? ` · ${selectedTrack.analysis.bpm.toFixed(1)} BPM` : ''}
                    {selectedTrack.analysis?.key ? ` · ${toCamelot(selectedTrack.analysis.key)}` : ''}
                    {selectedTrack.genre ? ` · ${selectedTrack.genre.split(',')[0].trim()}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono text-slate-400 flex-shrink-0">
                {selectedTrack.analysis?.bpm && (
                  <div className="flex items-center gap-1">
                    <Activity size={12} className="text-blue-400" />
                    <span className="text-blue-400 font-bold">{selectedTrack.analysis.bpm.toFixed(1)}</span>
                    <span>BPM</span>
                  </div>
                )}
                {selectedTrack.analysis?.key && (
                  <div className="flex items-center gap-1">
                    <Music2 size={12} className="text-cyan-400" />
                    <span className="text-cyan-400 font-bold">{toCamelot(selectedTrack.analysis.key)}</span>
                  </div>
                )}
                {selectedTrack.analysis?.energy != null && (
                  <div className="flex items-center gap-1">
                    <Zap size={12} className="text-yellow-400" />
                    <span className="text-yellow-400 font-bold">{energyToRating(selectedTrack.analysis.energy)}</span>
                    <span>/10</span>
                  </div>
                )}
                <span className="text-slate-500">
                  {msToTime(currentTime * 1000)} / {msToTime(duration * 1000)}
                </span>
              </div>
            </div>

            {/* Waveform container - constrained with overflow hidden */}
            <div className="relative w-full rounded-lg bg-bg-primary border border-slate-800/40" style={{ height: 120, overflow: 'hidden' }}>
              <div ref={waveformRef} className="w-full h-full" style={{ overflow: 'hidden' }} />
              {/* Zoom controls overlay */}
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
            </div>

            {/* Player controls */}
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <button onClick={skipBack} className="p-1.5 text-slate-400 hover:text-white transition-colors">
                  <SkipBack size={16} />
                </button>
                <button onClick={togglePlay} className="w-9 h-9 flex items-center justify-center bg-blue-600 hover:bg-blue-500 rounded-full text-white transition-all">
                  {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                </button>
                <button onClick={skipForward} className="p-1.5 text-slate-400 hover:text-white transition-colors">
                  <SkipForward size={16} />
                </button>
              </div>
              {/* Cue point badges */}
              <div className="flex items-center gap-1 overflow-x-auto max-w-[50%]">
                {selectedTrack.cue_points?.map((cue, i) => (
                  <button
                    key={cue.id}
                    onClick={() => {
                      if (wavesurferRef.current) {
                        wavesurferRef.current.setTime(cue.position_ms / 1000);
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap hover:brightness-125 transition-all"
                    style={{
                      backgroundColor: (CUE_COLOR_MAP[cue.color as keyof typeof CUE_COLOR_MAP] || '#2563eb') + '25',
                      color: CUE_COLOR_MAP[cue.color as keyof typeof CUE_COLOR_MAP] || '#2563eb',
                      border: `1px solid ${(CUE_COLOR_MAP[cue.color as keyof typeof CUE_COLOR_MAP] || '#2563eb')}40`,
                    }}
                    title={`${cue.name} — ${msToTime(cue.position_ms)}`}
                  >
                    <span className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-black"
                      style={{ backgroundColor: CUE_COLOR_MAP[cue.color as keyof typeof CUE_COLOR_MAP] || '#2563eb', color: '#fff' }}>
                      {i + 1}
                    </span>
                    {cue.name}
                  </button>
                ))}
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
          </>
        ) : (
          <div ref={waveformRef} className="w-full h-[120px] flex items-center justify-center rounded-lg bg-bg-primary border border-slate-800/40 border-dashed">
            <p className="text-slate-500 text-sm">Sélectionne un morceau pour voir la waveform</p>
          </div>
        )}
      </div>

      {/* ── MIDDLE: Drop zone + Search bar ───────────────────── */}
      <div
        className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/40 flex-shrink-0 transition-colors ${dragOver ? 'bg-blue-600/10 border-blue-500/40' : 'bg-bg-secondary/50'}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all"
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {isLoading ? progress : 'Ajouter des morceaux'}
        </button>
        <input ref={fileRef} type="file" multiple accept=".mp3,.wav,.flac,.aiff,.aif,.m4a,.ogg,audio/*" className="hidden"
          onChange={e => e.target.files && handleFiles(e.target.files)} />
        {dragOver && <span className="text-blue-400 text-xs font-medium animate-pulse">Dépose tes fichiers ici...</span>}
        <div className="flex-1" />
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="text" placeholder="Rechercher..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 bg-bg-primary border border-slate-800/50 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-600/50 w-48" />
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

      {/* ── BOTTOM: Track List ────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* Table header */}
        <div className="grid grid-cols-[2fr_1fr_80px_60px_60px_80px_40px] gap-2 px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800/30 sticky top-0 bg-bg-primary z-10">
          <span>Titre</span>
          <span>Genre</span>
          <span className="text-center">BPM</span>
          <span className="text-center">Key</span>
          <span className="text-center">Energy</span>
          <span className="text-center">Durée</span>
          <span />
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Headphones size={48} className="mb-4 opacity-30" />
            <p className="text-sm font-medium">Aucun morceau</p>
            <p className="text-xs mt-1">Glisse des fichiers audio ici ou clique sur &quot;Ajouter&quot;</p>
          </div>
        ) : (
          filtered.map(track => {
            const a = track.analysis;
            const isActive = selectedTrack?.id === track.id;
            const statusDot = track.status === 'completed' ? 'bg-green-400'
              : track.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400';
            return (
              <div
                key={track.id}
                className={`grid grid-cols-[2fr_1fr_80px_60px_60px_80px_40px] gap-2 px-4 py-2.5 items-center border-b border-slate-800/20 hover:bg-bg-elevated/40 cursor-pointer transition-colors ${isActive ? 'bg-blue-600/10 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent'}`}
                onClick={() => setSelectedTrack(track)}
                onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, track }); }}
              >
                {/* Title + Artist */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot}`} />
                  {track.artwork_url ? (
                    <img src={track.artwork_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-bg-elevated flex items-center justify-center flex-shrink-0">
                      <Music2 size={14} className="text-slate-600" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">
                      {track.title || track.original_filename}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {track.artist || '—'}
                    </p>
                  </div>
                </div>
                {/* Genre */}
                <span className="text-xs text-slate-400 truncate">
                  {track.genre?.split(',')[0]?.trim() || '—'}
                </span>
                {/* BPM */}
                <span className="text-xs text-blue-400 font-mono text-center font-bold">
                  {a?.bpm ? a.bpm.toFixed(1) : '—'}
                </span>
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
                  {a?.duration_ms ? msToTime(a.duration_ms) : '—'}
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

      {/* ── Context Menu (right-click) ───────────────────────── */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-bg-secondary border border-slate-700/80 rounded-xl shadow-2xl py-1 min-w-[220px] animate-fade-in"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-slate-800/40">
            <p className="text-xs font-bold text-white truncate">
              {ctxMenu.track.title || ctxMenu.track.original_filename}
            </p>
            <p className="text-[10px] text-slate-500">{ctxMenu.track.artist || ''}</p>
          </div>
          {CONTEXT_ACTIONS.map((a, i) => (
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

      {/* ── Track Organizer Panel (slide-in) ─────────────────── */}
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

      {/* ── Metadata / Spotify Panel (slide-in) ──────────────── */}
      {metadataPanel && (
        <div className="fixed inset-y-0 right-0 w-96 bg-bg-secondary border-l border-slate-800/60 z-40 shadow-2xl animate-slide-in overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/40">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Music size={16} className="text-green-400" />
              Metadata & Spotify
            </h3>
            <button onClick={() => setMetadataPanel(null)} className="text-slate-500 hover:text-white">
              <X size={16} />
            </button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Infos actuelles</p>
              <div className="space-y-2 text-xs">
                <InfoRow label="Fichier" value={metadataPanel.original_filename} />
                <InfoRow label="Artiste" value={metadataPanel.artist || '—'} />
                <InfoRow label="Titre" value={metadataPanel.title || '—'} />
                <InfoRow label="Album" value={metadataPanel.album || '—'} />
                <InfoRow label="Genre" value={metadataPanel.genre || '—'} />
                <InfoRow label="Année" value={metadataPanel.year?.toString() || '—'} />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Résultats Spotify</p>
              {metadataPanel.spotify_url ? (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 space-y-2">
                  {metadataPanel.artwork_url && (
                    <img src={metadataPanel.artwork_url} alt="" className="w-full h-40 object-cover rounded-lg" />
                  )}
                  <InfoRow label="Artiste" value={metadataPanel.artist || '—'} highlight />
                  <InfoRow label="Titre" value={metadataPanel.title || '—'} highlight />
                  <InfoRow label="Album" value={metadataPanel.album || '—'} />
                  <InfoRow label="Genre" value={metadataPanel.genre || '—'} />
                  {metadataPanel.spotify_url && (
                    <a href={metadataPanel.spotify_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-green-400 hover:text-green-300 text-xs mt-2">
                      <ExternalLink size={12} /> Ouvrir sur Spotify
                    </a>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded-lg transition-all">
                      <Check size={14} /> Approuver tout
                    </button>
                    <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-bg-elevated hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-all">
                      <X size={14} /> Rejeter
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-slate-500 text-xs mb-3">Aucune donnée Spotify trouvée</p>
                  <button className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded-lg transition-all">
                    <Search size={12} className="inline mr-1.5" />
                    Lancer la recherche
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────
function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium ${highlight ? 'text-green-400' : 'text-white'}`}>{value}</span>
    </div>
  );
}
