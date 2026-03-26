'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, Music2, Loader2, CheckCircle2, XCircle,
  Download, Trash2, Clock, Activity, Hash, Disc3,
  ChevronDown, ChevronUp, ExternalLink, User, Tag, Calendar, AlbumIcon
} from 'lucide-react';
import { uploadTrack, analyzeTrack, pollTrackUntilDone, exportRekordbox, listTracks, deleteTrack } from '@/lib/api';
import type { Track } from '@/types';
import { CUE_COLORS as CUE_COLOR_MAP } from '@/types';

function msToTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const CUE_TYPE_LABELS: Record<string, string> = {
  hot_cue: 'HOT CUE', loop: 'LOOP', fade_in: 'FADE IN',
  fade_out: 'FADE OUT', load: 'LOAD', phrase: 'PHRASE',
};
const CUE_TYPE_COLORS: Record<string, string> = {
  hot_cue: '#e11d48', loop: '#0891b2', fade_in: '#16a34a',
  fade_out: '#ea580c', load: '#ca8a04', phrase: '#2563eb',
};

export default function DashboardPage() {
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    try {
      const data = await listTracks(1, 10);
      setRecentTracks(data.tracks);
    } catch {}
  }

  async function handleFile(file: File) {
    if (!file) return;
    if (!file.name.match(/\.(mp3|wav|flac|aiff|aif|m4a|ogg)$/i)) {
      setError('Format non supporté. Utilise MP3, WAV, FLAC ou AIFF.'); return;
    }
    setError(''); setCurrentTrack(null); setUploading(true); setProgress('Upload en cours...');
    try {
      const uploaded = await uploadTrack(file);
      setProgress('Analyse audio en cours...');
      setUploading(false); setAnalyzing(true);
      await analyzeTrack(uploaded.id);
      const done = await pollTrackUntilDone(uploaded.id, (t) => {
        setCurrentTrack(t);
        if (t.status === 'analyzing') setProgress('Analyse IA en cours...');
        if (t.status === 'generating_cues') setProgress('Génération des cue points...');
      });
      setCurrentTrack(done); setProgress(''); setAnalyzing(false);
      loadHistory();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue');
      setUploading(false); setAnalyzing(false); setProgress('');
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  async function handleExport(trackId: number) {
    try {
      const blob = await exportRekordbox(trackId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `cueforge_track_${trackId}.xml`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Export échoué'); }
  }

  async function handleDelete(trackId: number) {
    if (!confirm('Supprimer ce morceau ?')) return;
    try {
      await deleteTrack(trackId);
      if (currentTrack?.id === trackId) setCurrentTrack(null);
      loadHistory();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Suppression échouée'); }
  }

  const isLoading = uploading || analyzing;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Analyser un morceau</h1>
        <p className="text-slate-400 text-sm">Upload un fichier audio pour obtenir BPM, cue points, genre et export Rekordbox.</p>
      </div>

      {/* Upload Zone */}
      <div
        className={`upload-zone rounded-2xl p-12 text-center cursor-pointer ${drag ? 'drag-over' : ''} ${isLoading ? 'pointer-events-none opacity-60' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => !isLoading && fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".mp3,.wav,.flac,.aiff,.aif,.m4a,.ogg,audio/*" className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

        {isLoading ? (
          <div className="space-y-4">
            <div className="flex justify-center gap-1 h-12 items-end">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="waveform-bar" style={{ height: `${20 + Math.random() * 80}%`, animationDelay: `${i * 0.06}s` }} />
              ))}
            </div>
            <div className="flex items-center justify-center gap-2 text-blue-400">
              <Loader2 size={18} className="animate-spin" />
              <span className="font-medium">{progress}</span>
            </div>
          </div>
        ) : (
          <>
            <div className="w-16 h-16 bg-blue-600/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-600/20">
              <Upload size={28} className="text-blue-500" />
            </div>
            <p className="text-white font-semibold text-lg mb-2">Glisse ton fichier ici</p>
            <p className="text-slate-500 text-sm mb-4">ou clique pour choisir</p>
            <div className="flex justify-center gap-2">
              {['MP3', 'WAV', 'FLAC', 'AIFF'].map(f => (
                <span key={f} className="px-2.5 py-1 bg-bg-elevated rounded-lg text-xs text-slate-400 font-mono border border-slate-700/40">{f}</span>
              ))}
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          <XCircle size={16} className="flex-shrink-0" />{error}
        </div>
      )}

      {currentTrack && currentTrack.status === 'completed' && currentTrack.analysis && (
        <TrackResults track={currentTrack} onExport={() => handleExport(currentTrack.id)} onDelete={() => handleDelete(currentTrack.id)} />
      )}
      {currentTrack && currentTrack.status === 'failed' && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
          <XCircle size={16} /><span className="text-sm">L&apos;analyse a échoué. Essaie avec un autre fichier.</span>
        </div>
      )}

      {recentTracks.length > 0 && (
        <div className="bg-bg-secondary border border-slate-800/50 rounded-2xl overflow-hidden">
          <button onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-bg-elevated/50 transition-colors">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-slate-400" />
              <span className="text-sm font-medium text-slate-300">Historique ({recentTracks.length})</span>
            </div>
            {showHistory ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
          </button>
          {showHistory && (
            <div className="border-t border-slate-800/50">
              {recentTracks.map(track => (
                <HistoryRow key={track.id} track={track}
                  onSelect={() => setCurrentTrack(track)}
                  onExport={() => handleExport(track.id)}
                  onDelete={() => handleDelete(track.id)}
                  isActive={currentTrack?.id === track.id} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Track Results ─────────────────────────────────────────────────────────────
function TrackResults({ track, onExport, onDelete }: { track: Track; onExport: () => void; onDelete: () => void }) {
  const a = track.analysis!;
  const hasMetadata = track.artist || track.genre || track.artwork_url;

  return (
    <div className="bg-bg-secondary border border-slate-800/50 rounded-2xl overflow-hidden animate-slide-up">

      {/* Artwork + Identity header */}
      {hasMetadata ? (
        <div className="flex gap-0 relative">
          {track.artwork_url && (
            <div className="w-32 h-32 flex-shrink-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={track.artwork_url} alt="artwork" className="w-full h-full object-cover" />
            </div>
          )}
          <div className={`flex-1 p-4 ${track.artwork_url ? '' : 'pl-5'} flex flex-col justify-between`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {track.title && <p className="text-lg font-bold text-white truncate">{track.title}</p>}
                {track.artist && (
                  <p className="text-sm text-slate-400 flex items-center gap-1 mt-0.5">
                    <User size={12} />{track.artist}
                  </p>
                )}
                {track.album && (
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    <AlbumIcon size={11} />{track.album}{track.year ? ` (${track.year})` : ''}
                  </p>
                )}
                {track.genre && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {track.genre.split(',').map(g => g.trim()).filter(Boolean).map(g => (
                      <span key={g} className="px-2 py-0.5 bg-blue-600/15 border border-blue-600/25 rounded-md text-blue-400 text-xs font-medium flex items-center gap-1">
                        <Tag size={10} />{g}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {track.spotify_url && (
                  <a href={track.spotify_url} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 text-slate-500 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-all"
                    title="Ouvrir sur Spotify">
                    <ExternalLink size={14} />
                  </a>
                )}
                <button onClick={onExport}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-all">
                  <Download size={14} /> Rekordbox XML
                </button>
                <button onClick={onDelete}
                  className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {!track.title && (
              <p className="text-sm text-slate-400 truncate">{track.original_filename}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600/10 rounded-xl flex items-center justify-center">
              <CheckCircle2 size={18} className="text-green-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white truncate max-w-[280px]">{track.original_filename}</p>
              <p className="text-xs text-slate-500">Analyse complète</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onExport}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-all">
              <Download size={14} /> Rekordbox XML
            </button>
            <button onClick={onDelete}
              className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-t border-b border-slate-800/50">
        <StatBox icon={<Activity size={16} />} label="BPM" value={a.bpm ? a.bpm.toFixed(1) : '—'} color="text-blue-400" />
        <StatBox icon={<Music2 size={16} />} label="Tonalité" value={a.key || '—'} color="text-cyan-400" />
        <StatBox icon={<Hash size={16} />} label="Énergie" value={a.energy ? `${Math.round(a.energy * 100)}%` : '—'} color="text-pink-400" />
        <StatBox icon={<Clock size={16} />} label="Durée" value={a.duration_ms ? msToTime(a.duration_ms) : '—'} color="text-yellow-400" />
      </div>

      {/* Cue Points */}
      {track.cue_points.length > 0 && (
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Disc3 size={15} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Cue Points ({track.cue_points.length})
            </span>
          </div>
          <div className="space-y-2">
            {track.cue_points.map(cue => (
              <div key={cue.id}
                className="flex items-center gap-3 px-3 py-2.5 bg-bg-primary rounded-xl border border-slate-800/40">
                <div className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: CUE_COLOR_MAP[cue.color as keyof typeof CUE_COLOR_MAP] || '#2563eb' }} />
                <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                  style={{ color: CUE_TYPE_COLORS[cue.cue_type] || '#2563eb', backgroundColor: `${CUE_TYPE_COLORS[cue.cue_type] || '#2563eb'}15` }}>
                  {CUE_TYPE_LABELS[cue.cue_type] || cue.cue_type.toUpperCase()}
                </span>
                <span className="text-white text-sm font-medium flex-1">{cue.name}</span>
                <span className="text-slate-500 font-mono text-xs">{msToTime(cue.position_ms)}</span>
                {cue.number !== null && (
                  <span className="w-5 h-5 rounded-md bg-bg-elevated text-slate-400 text-xs font-bold flex items-center justify-center">
                    {cue.number + 1}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drops */}
      {a.drop_positions.length > 0 && (
        <div className="px-5 pb-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={14} className="text-pink-400" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Drops détectés</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {a.drop_positions.map((ms, i) => (
              <span key={i} className="px-2.5 py-1 bg-pink-500/10 border border-pink-500/20 rounded-lg text-pink-400 text-xs font-mono">
                {msToTime(ms)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center py-4 px-3 border-r border-slate-800/50 last:border-0">
      <div className={`mb-1 ${color}`}>{icon}</div>
      <span className={`text-xl font-bold font-mono ${color}`}>{value}</span>
      <span className="text-xs text-slate-500 mt-0.5">{label}</span>
    </div>
  );
}

function HistoryRow({ track, onSelect, onExport, onDelete, isActive }: {
  track: Track; onSelect: () => void; onExport: () => void; onDelete: () => void; isActive: boolean;
}) {
  const a = track.analysis;
  const statusColor = track.status === 'completed' ? 'bg-green-400' : track.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400';
  return (
    <div className={`flex items-center gap-3 px-5 py-3 border-b border-slate-800/30 last:border-0 hover:bg-bg-elevated/40 transition-colors cursor-pointer ${isActive ? 'bg-blue-600/5' : ''}`}>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
      {track.artwork_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={track.artwork_url} alt="" className="w-8 h-8 rounded-md object-cover flex-shrink-0" />
      )}
      <button onClick={onSelect} className="flex-1 text-left min-w-0">
        <p className="text-sm text-slate-200 truncate font-medium">
          {track.title ? `${track.artist ? track.artist + ' — ' : ''}${track.title}` : track.original_filename}
        </p>
        <p className="text-xs text-slate-500 font-mono">
          {a?.bpm?.toFixed(1)} BPM
          {a?.key ? ` · ${a.key}` : ''}
          {track.genre ? ` · ${track.genre.split(',')[0].trim()}` : ''}
          {a?.duration_ms ? ` · ${msToTime(a.duration_ms)}` : ''}
        </p>
      </button>
      {track.status === 'completed' && (
        <button onClick={e => { e.stopPropagation(); onExport(); }}
          className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-600/10 rounded-lg transition-all">
          <Download size={14} />
        </button>
      )}
      <button onClick={e => { e.stopPropagation(); onDelete(); }}
        className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

