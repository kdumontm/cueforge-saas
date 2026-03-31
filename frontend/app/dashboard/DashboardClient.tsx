// @ts-nocheck
'use client';

import {
  Upload, Download, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Search, Grid3X3, List as ListIcon, Music, Music2, Activity, Zap,
  CheckCircle2, X, Loader2,
} from 'lucide-react';
import { useDashboard } from './hooks/useDashboard';
import TrackOrganizer from '@/components/TrackOrganizer';

// ─────────────────────────────────────────────────────────────────────────
// DashboardClient — Thin layout component (~280 lines)
// All state & logic lives in useDashboard hook
// ─────────────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function toCamelotDisplay(key: string | null | undefined): string {
  if (!key) return '—';
  const CAMELOT: Record<string, string> = {
    'C': '8B', 'Am': '8A', 'G': '9B', 'Em': '9A', 'D': '10B', 'Bm': '10A',
    'A': '11B', 'F#m': '11A', 'E': '12B', 'C#m': '12A', 'B': '1B', 'G#m': '1A',
    'F#': '2B', 'Ebm': '2A', 'Db': '3B', 'Bbm': '3A', 'Ab': '4B', 'Fm': '4A',
    'Eb': '5B', 'Cm': '5A', 'Bb': '6B', 'Gm': '6A', 'F': '7B', 'Dm': '7A',
  };
  return CAMELOT[key] || key;
}

function energyColor(energy: number | null | undefined): string {
  if (energy == null) return 'rgb(107,114,128)';
  if (energy < 0.25) return 'rgb(34,197,94)';
  if (energy < 0.5) return 'rgb(234,179,8)';
  if (energy < 0.75) return 'rgb(249,115,22)';
  return 'rgb(239,68,68)';
}

function energyRating(energy: number | null | undefined): string {
  if (energy == null) return '—';
  return String(Math.min(10, Math.max(1, Math.round(energy * 10))));
}

function energyLabel(energy: number | null | undefined): string {
  if (energy == null) return 'N/A';
  if (energy < 0.25) return 'Calm';
  if (energy < 0.5) return 'Moderate';
  if (energy < 0.75) return 'Energetic';
  return 'Intense';
}

export default function DashboardPage() {
  const d = useDashboard();

  return (
    <div
      className="flex w-full h-[calc(100vh-3.5rem)] relative"
      onClick={() => d.setCtxMenu(null)}
      onDragEnter={d.handleDragEnter}
      onDragLeave={d.handleDragLeave}
      onDragOver={d.handleDragOver}
      onDrop={d.handleDrop}
    >
      {/* ── Drag & Drop Overlay ── */}
      {d.isDragging && (
        <div className="absolute inset-0 z-[9998] bg-cyan-500/10 backdrop-blur-sm border-2 border-dashed border-cyan-400/60 rounded-xl flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 text-cyan-400">
            <Upload size={48} className="animate-bounce" />
            <span className="text-lg font-semibold">Dépose tes fichiers audio ici</span>
            <span className="text-sm text-cyan-400/60">MP3, WAV, FLAC, AAC, OGG, M4A, AIF</span>
          </div>
        </div>
      )}

      {/* Global styles */}
      <style dangerouslySetInnerHTML={{ __html: "@keyframes eqBar{0%,100%{height:3px}50%{height:12px}}.eq-bar{display:inline-block;width:2px;margin:0 0.5px;border-radius:1px;animation:eqBar .4s ease infinite}.eq-bar:nth-child(1){animation-delay:0s}.eq-bar:nth-child(2){animation-delay:.15s}.eq-bar:nth-child(3){animation-delay:.3s}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(100,116,139,.3);border-radius:3px}::-webkit-scrollbar-thumb:hover{background:rgba(100,116,139,.5)}" }} />

      {/* ── Metadata Edit Modal ── */}
      {d.showEditMeta && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => d.setShowEditMeta(false)}>
          <div className="bg-[var(--bg-card)] rounded-xl p-6 w-full max-w-md border border-[var(--border-default)] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">{d.t('modifier_metadata')}</h2>
            <div className="space-y-3">
              {(['title', 'artist', 'album'] as const).map(field => (
                <div key={field}>
                  <label className="text-xs text-[var(--text-secondary)] block mb-1">{d.t(field === 'title' ? 'titre' : field === 'artist' ? 'artiste' : 'album')}</label>
                  <input type="text" value={d.editForm[field]} onChange={e => d.setEditForm({...d.editForm, [field]: e.target.value})}
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded px-3 py-2 text-[var(--text-primary)] text-sm focus:border-cyan-500 focus:outline-none" />
                </div>
              ))}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-[var(--text-secondary)] block mb-1">{d.t('genre')}</label>
                  <input type="text" value={d.editForm.genre} onChange={e => d.setEditForm({...d.editForm, genre: e.target.value})}
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded px-3 py-2 text-[var(--text-primary)] text-sm focus:border-cyan-500 focus:outline-none" />
                </div>
                <div className="w-20">
                  <label className="text-xs text-[var(--text-secondary)] block mb-1">{d.t('annee')}</label>
                  <input type="number" value={d.editForm.year || ''} onChange={e => d.setEditForm({...d.editForm, year: parseInt(e.target.value) || 0})}
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded px-3 py-2 text-[var(--text-primary)] text-sm focus:border-cyan-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-[var(--text-secondary)] block mb-1">{d.t('commentaire')}</label>
                <textarea value={d.editForm.comment} onChange={e => d.setEditForm({...d.editForm, comment: e.target.value})}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded px-3 py-2 text-[var(--text-primary)] text-sm focus:border-cyan-500 focus:outline-none h-16 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => d.setShowEditMeta(false)} className="flex-1 px-4 py-2 bg-[var(--bg-hover)] hover:bg-gray-500 rounded text-sm text-[var(--text-primary)] font-medium">{d.t('annuler')}</button>
              <button onClick={d.saveMetadata} disabled={d.savingMeta}
                className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-sm text-white font-bold disabled:opacity-50">
                {d.savingMeta ? <Loader2 size={14} className="animate-spin mx-auto" /> : d.t('enregistrer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col overflow-y-auto min-w-0 p-5 gap-3">

        {/* ── PLAYER CARD ── */}
        {d.selectedTrack && (
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center gap-3 mb-3">
              <button onClick={d.togglePlay} className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center flex-shrink-0 transition-colors">
                {d.isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
              </button>
              <button onClick={d.skipBack} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"><SkipBack size={14} /></button>
              <button onClick={d.skipForward} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"><SkipForward size={14} /></button>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)] truncate">{d.selectedTrack.title || d.selectedTrack.original_filename}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">{d.selectedTrack.artist || 'Artiste inconnu'}</p>
              </div>
              <div className="flex gap-1.5 ml-auto flex-wrap flex-shrink-0">
                {d.selectedTrack.analysis?.bpm && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-[10px]">
                    <Activity size={10} className="text-cyan-400" />
                    <span className="font-mono font-bold text-cyan-400">{d.selectedTrack.analysis.bpm.toFixed(1)}</span>
                    <span className="text-cyan-400/60">BPM</span>
                  </div>
                )}
                {d.selectedTrack.analysis?.key && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px]">
                    <Music2 size={10} className="text-blue-400" />
                    <span className="font-mono font-bold text-blue-400">{toCamelotDisplay(d.selectedTrack.analysis.key)}</span>
                  </div>
                )}
                {d.selectedTrack.analysis?.energy != null && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px]" style={{ background: energyColor(d.selectedTrack.analysis.energy) + '15', borderColor: energyColor(d.selectedTrack.analysis.energy) + '50', borderWidth: '1px' }}>
                    <Zap size={10} style={{ color: energyColor(d.selectedTrack.analysis.energy) }} />
                    <span className="font-mono font-bold" style={{ color: energyColor(d.selectedTrack.analysis.energy) }}>{energyRating(d.selectedTrack.analysis.energy)}</span>
                  </div>
                )}
              </div>
            </div>
            {/* Waveform */}
            <div ref={d.waveformRef} className="w-full rounded-lg overflow-hidden bg-[var(--bg-primary)] mb-2" style={{ minHeight: 128 }} />
            {/* Time bar */}
            <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-muted)]">
              <span>{formatTime(d.currentTime)}</span>
              <div className="flex-1 h-1 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all" style={{ width: `${d.duration > 0 ? (d.currentTime / d.duration) * 100 : 0}%` }} />
              </div>
              <span>{formatTime(d.duration)}</span>
              <button onClick={d.toggleMute} className="ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                {d.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            </div>
          </div>
        )}

        {/* ── TRACK LIST ── */}
        <div id="library-section" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] overflow-hidden">
          <div className="p-4 border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-base font-bold text-[var(--text-primary)]">Tracks ({d.filteredTracks?.length ?? d.tracks.length})</h2>
              <div className="flex gap-2">
                <button onClick={() => d.setShowExport(true)} className="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-cyan-500/50 text-[var(--text-secondary)] hover:text-cyan-400 text-[11px] font-medium transition-colors flex items-center gap-1">
                  <Download size={12} /> Export
                </button>
                <button onClick={() => d.fileRef.current?.click()} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium transition-colors flex items-center gap-1">
                  <Upload size={12} /> Upload
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] flex-1">
                <Search size={12} className="text-[var(--text-muted)]" />
                <input ref={d.searchInputRef} type="text" placeholder={d.t('search_placeholder')} value={d.searchQuery} onChange={e => d.setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-[11px] text-[var(--text-primary)] placeholder-[var(--text-muted)]" />
              </div>
              <button onClick={() => d.setGridView(!d.gridView)} className={`px-2 py-1.5 rounded-lg text-[11px] transition-colors ${d.gridView ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}>
                {d.gridView ? <ListIcon size={12} /> : <Grid3X3 size={12} />}
              </button>
            </div>
          </div>

          <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(50vh)' }}>
            {(d.filteredTracks ?? d.tracks).length === 0 && d.tracks.length > 0 && (
              <div className="text-center py-8 text-[var(--text-muted)] text-sm">
                Aucun morceau ne correspond à la recherche.
              </div>
            )}
            {d.tracks.length === 0 && !d.isLoading && (
              <div className="text-center py-8 text-[var(--text-muted)] text-sm">
                Aucun morceau. Ajoutez vos premiers tracks via Upload.
              </div>
            )}
            {d.gridView ? (
              <div className="grid grid-cols-4 gap-3">
                {(d.filteredTracks ?? d.tracks).map(track => (
                  <div key={track.id} onClick={() => d.setSelectedTrack(track)} className={`p-3 rounded-lg cursor-pointer transition-colors border ${d.selectedTrack?.id === track.id ? 'bg-blue-500/10 border-blue-500/30' : 'bg-[var(--bg-hover)] border-[var(--border-subtle)]/40 hover:bg-[var(--bg-elevated)]'}`}>
                    <div className="w-full aspect-square rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center mb-2">
                      <Music size={20} className="text-[var(--text-muted)]" />
                    </div>
                    <p className="text-[11px] font-semibold text-[var(--text-primary)] truncate">{track.title || track.original_filename}</p>
                    <p className="text-[9px] text-[var(--text-muted)] truncate">{track.artist || 'Unknown'}</p>
                    <div className="flex gap-1 mt-2">
                      {track.analysis?.bpm && <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">{track.analysis.bpm.toFixed(1)}</span>}
                      {track.analysis?.key && <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">{toCamelotDisplay(track.analysis.key)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-0">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-subtle)]/40 mb-1">
                  <div className="col-span-1" />
                  <div className="col-span-5">Title</div>
                  <div className="col-span-2 text-center">BPM</div>
                  <div className="col-span-2 text-center">Key</div>
                  <div className="col-span-2 text-center">Energy</div>
                </div>
                {(d.filteredTracks ?? d.tracks).map(track => (
                  <div key={track.id} data-track-id={track.id} onClick={() => d.setSelectedTrack(track)}
                    className={`grid grid-cols-12 gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors border mb-1 ${d.selectedTrack?.id === track.id ? 'bg-blue-500/10 border-blue-500/30' : 'bg-[var(--bg-hover)]/50 border-[var(--border-subtle)]/40 hover:bg-[var(--bg-elevated)]'}`}>
                    <div className="col-span-1 flex items-center">
                      {track.analysis?.bpm ? <CheckCircle2 size={12} className="text-green-400" /> : <div className="w-3 h-3 rounded-full border border-[var(--border-default)]" />}
                    </div>
                    <div className="col-span-5 min-w-0">
                      <p className="text-[11px] font-semibold text-[var(--text-primary)] truncate">{track.title || track.original_filename}</p>
                      <p className="text-[9px] text-[var(--text-muted)] truncate">{track.artist || 'Unknown'}</p>
                    </div>
                    <div className="col-span-2 text-center"><p className="text-[11px] font-mono text-[var(--text-primary)]">{track.analysis?.bpm?.toFixed(1) || '—'}</p></div>
                    <div className="col-span-2 text-center"><p className="text-[10px] font-mono text-[var(--text-secondary)]">{toCamelotDisplay(track.analysis?.key)}</p></div>
                    <div className="col-span-2 flex justify-center">
                      {track.analysis?.energy != null && (
                        <div className="w-8 h-2 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                          <div className="h-full" style={{ width: `${Math.min(100, (track.analysis.energy / 10) * 100)}%`, backgroundColor: energyColor(track.analysis.energy) }} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Export Modal ── */}
      {d.showExport && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => d.setShowExport(false)}>
          <div className="bg-[var(--bg-card)] rounded-xl p-6 w-full max-w-md border border-[var(--border-default)] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2"><Download size={18} className="text-cyan-400" /> Export Bibliothèque</h2>
              <button onClick={() => d.setShowExport(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Rekordbox XML', desc: 'Compatible Pioneer DJ, rekordbox 5/6', color: 'cyan', action: async () => { await d.exportAllRekordboxXML(); d.setShowExport(false); } },
                { label: 'CSV Tracklist', desc: 'Title, Artist, BPM, Key, Genre, Energy', color: 'green', action: () => { d.handleExportTracklist('csv'); d.setShowExport(false); } },
                { label: 'Tracklist TXT', desc: 'Format texte numéroté', color: 'purple', action: () => { d.handleExportTracklist('txt'); d.setShowExport(false); } },
              ].map(opt => (
                <button key={opt.label} onClick={opt.action}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-${opt.color}-500/50 hover:bg-${opt.color}-500/5 transition-all group`}>
                  <div className={`w-8 h-8 rounded-lg bg-${opt.color}-500/10 flex items-center justify-center group-hover:bg-${opt.color}-500/20`}>
                    <Download size={16} className={`text-${opt.color}-400`} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{opt.label}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-4 text-center">{d.filteredTracks?.length ?? d.tracks.length} morceaux dans la bibliothèque</p>
          </div>
        </div>
      )}

      {/* File input (hidden) */}
      <input ref={d.fileRef} type="file" multiple accept=".mp3,.wav,.flac,.aac,.ogg,.m4a,.aif" onChange={d.handleFileSelect} className="hidden" />

      {/* Toast notifications */}
      {d.toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
          {d.toasts.map(toast => (
            <div key={toast.id} className={`px-4 py-2 rounded-lg text-sm font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2 ${
              toast.type === 'success' ? 'bg-green-500/90 text-white' : toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-blue-500/90 text-white'
            }`}>
              {toast.msg}
            </div>
          ))}
        </div>
      )}

      {/* Organizer modal */}
      {d.organizerTrack && <TrackOrganizer track={d.organizerTrack} onClose={() => d.setOrganizerTrack(null)} onSave={() => { d.setOrganizerTrack(null); d.loadTracks(); }} />}
    </div>
  );
}
