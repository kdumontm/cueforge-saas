'use client';
import { useState, useEffect, useCallback } from 'react';
import { Plus, Wand2, Download, Trash2, GripVertical, Music, ChevronDown, Loader2, Disc3, Clock, Zap, ArrowRight, AlertTriangle, CheckCircle2, ArrowUpDown } from 'lucide-react';
import KeyBadge from '@/components/ui/KeyBadge';
import EnergyFlow from '@/components/tools/EnergyFlow';
import {
  listSets, createSet, deleteSet, getSet, addTrackToSet, removeTrackFromSet,
  suggestNextTrack, listTracks, exportSetRekordbox, exportSetM3U, downloadBlob,
  type DJSet, type DJSetDetail,
} from '@/lib/api';
import type { Track } from '@/types';

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function getEnergyColor(energy: number): string {
  if (energy >= 80) return '#ef4444';
  if (energy >= 60) return '#f97316';
  if (energy >= 40) return '#eab308';
  return '#22c55e';
}

const CAMELOT: Record<string, string> = {
  'C': '8B', 'Am': '8A', 'G': '9B', 'Em': '9A', 'D': '10B', 'Bm': '10A',
  'A': '11B', 'F#m': '11A', 'E': '12B', 'C#m': '12A', 'B': '1B', 'G#m': '1A',
  'F#': '2B', 'Ebm': '2A', 'Db': '3B', 'Bbm': '3A', 'Ab': '4B', 'Fm': '4A',
  'Eb': '5B', 'Cm': '5A', 'Bb': '6B', 'Gm': '6A', 'F': '7B', 'Dm': '7A',
};

// Key compatibility scoring for harmonic mixing
function getKeyCompatibility(key1: string | null | undefined, key2: string | null | undefined): { score: number; label: string; color: string } {
  if (!key1 || !key2) return { score: 0, label: '?', color: 'text-[var(--text-muted)]' };

  const cam1 = CAMELOT[key1] || key1;
  const cam2 = CAMELOT[key2] || key2;

  // Parse Camelot notation
  const num1 = parseInt(cam1);
  const letter1 = cam1.replace(/\d+/, '');
  const num2 = parseInt(cam2);
  const letter2 = cam2.replace(/\d+/, '');

  if (isNaN(num1) || isNaN(num2)) return { score: 0, label: '?', color: 'text-[var(--text-muted)]' };

  // Same key = perfect
  if (cam1 === cam2) return { score: 100, label: 'Parfait', color: 'text-emerald-400' };

  // Adjacent number, same letter = great
  const diff = Math.abs(num1 - num2);
  const circularDiff = Math.min(diff, 12 - diff);

  if (circularDiff === 1 && letter1 === letter2) return { score: 90, label: 'Harmonique', color: 'text-emerald-400' };

  // Same number, different letter (major/minor switch)
  if (num1 === num2 && letter1 !== letter2) return { score: 85, label: 'Relatif', color: 'text-green-400' };

  // 2 steps away = ok
  if (circularDiff === 2 && letter1 === letter2) return { score: 60, label: 'Compatible', color: 'text-yellow-400' };

  // Energy boost (+7 semitones)
  if (circularDiff === 7) return { score: 55, label: 'Boost', color: 'text-yellow-400' };

  // Far away = risky
  if (circularDiff <= 3) return { score: 40, label: 'Risqué', color: 'text-orange-400' };

  return { score: 20, label: 'Clash', color: 'text-red-400' };
}

function getMixScore(bpm1: number | null, bpm2: number | null, key1: string | null, key2: string | null): { score: number; label: string; color: string } {
  const keyCompat = getKeyCompatibility(key1, key2);

  let bpmScore = 100;
  if (bpm1 && bpm2) {
    const diff = Math.abs(bpm1 - bpm2);
    if (diff <= 2) bpmScore = 100;
    else if (diff <= 5) bpmScore = 80;
    else if (diff <= 10) bpmScore = 50;
    else bpmScore = 20;
  }

  const combined = Math.round(keyCompat.score * 0.6 + bpmScore * 0.4);

  if (combined >= 80) return { score: combined, label: 'Excellent', color: 'text-emerald-400' };
  if (combined >= 60) return { score: combined, label: 'Bon', color: 'text-green-400' };
  if (combined >= 40) return { score: combined, label: 'Moyen', color: 'text-yellow-400' };
  return { score: combined, label: 'Difficile', color: 'text-red-400' };
}

export default function SetBuilderPage() {
  const [sets, setSets] = useState<DJSet[]>([]);
  const [currentSet, setCurrentSet] = useState<DJSetDetail | null>(null);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [suggestions, setSuggestions] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [showTrackPicker, setShowTrackPicker] = useState(false);
  const [trackSearch, setTrackSearch] = useState('');
  const [sugLoading, setSugLoading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Load sets and tracks
  useEffect(() => {
    Promise.all([
      listSets().catch(() => []),
      listTracks().then(d => Array.isArray(d) ? d : d?.tracks || []).catch(() => []),
    ]).then(([s, t]) => {
      setSets(s);
      setAllTracks(t);
      if (s.length > 0) loadSet(s[0].id);
      setLoading(false);
    });
  }, []);

  async function loadSet(id: number) {
    try {
      const set = await getSet(id);
      setCurrentSet(set);
    } catch {}
  }

  async function handleCreateSet() {
    if (!newSetName.trim()) return;
    try {
      const s = await createSet({ name: newSetName.trim() });
      setSets(prev => [s, ...prev]);
      setCurrentSet({ ...s, tracks: [] });
      setNewSetName('');
      setCreating(false);
    } catch {}
  }

  async function handleDeleteSet(id: number) {
    if (!confirm('Supprimer ce set ?')) return;
    try {
      await deleteSet(id);
      setSets(prev => prev.filter(s => s.id !== id));
      if (currentSet?.id === id) setCurrentSet(null);
    } catch {}
  }

  async function handleAddTrack(trackId: number) {
    if (!currentSet) return;
    try {
      await addTrackToSet(currentSet.id, trackId);
      await loadSet(currentSet.id);
      setShowTrackPicker(false);
    } catch {}
  }

  async function handleRemoveTrack(trackId: number) {
    if (!currentSet) return;
    try {
      await removeTrackFromSet(currentSet.id, trackId);
      await loadSet(currentSet.id);
    } catch {}
  }

  async function handleSuggestNext() {
    if (!currentSet) return;
    setSugLoading(true);
    try {
      const sug = await suggestNextTrack(currentSet.id);
      setSuggestions(Array.isArray(sug) ? sug.slice(0, 5) : []);
    } catch {
      setSuggestions([]);
    }
    setSugLoading(false);
  }

  async function handleExport(format: 'rekordbox' | 'm3u') {
    if (!currentSet) return;
    try {
      const blob = format === 'rekordbox'
        ? await exportSetRekordbox(currentSet.id)
        : await exportSetM3U(currentSet.id);
      downloadBlob(blob, `${currentSet.name}.${format === 'rekordbox' ? 'xml' : 'm3u'}`);
    } catch {}
    setShowExportMenu(false);
  }

  const setTracks = currentSet?.tracks || [];
  const totalMs = setTracks.reduce((sum, st) => sum + (st.track?.analysis?.duration_ms || 0), 0);
  const totalMin = Math.round(totalMs / 60000);
  const bpmRange = setTracks.length > 0
    ? `${Math.min(...setTracks.map(st => st.track?.analysis?.bpm || 999).filter(b => b < 999))}→${Math.max(...setTracks.map(st => st.track?.analysis?.bpm || 0))}`
    : '—';

  // Calculate overall set harmonic score
  const setHarmonicScore = setTracks.length > 1
    ? Math.round(
        setTracks.slice(0, -1).reduce((sum, st, i) => {
          const nextSt = setTracks[i + 1];
          const score = getMixScore(
            st.track?.analysis?.bpm || null,
            nextSt?.track?.analysis?.bpm || null,
            st.track?.analysis?.key || null,
            nextSt?.track?.analysis?.key || null,
          );
          return sum + score.score;
        }, 0) / (setTracks.length - 1)
      )
    : null;

  const filteredLibrary = allTracks.filter(t => {
    if (!trackSearch) return true;
    const q = trackSearch.toLowerCase();
    return (t.title?.toLowerCase().includes(q) || t.artist?.toLowerCase().includes(q));
  });

  if (loading) {
    return (
      <div className="p-5 flex items-center justify-center h-64">
        <Loader2 size={24} className="text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      {/* Set selector */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          {sets.map(s => (
            <button
              key={s.id}
              onClick={() => loadSet(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                currentSet?.id === s.id
                  ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                  : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)] cursor-pointer'
              }`}
            >
              {s.name}
            </button>
          ))}
          {creating ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newSetName}
                onChange={e => setNewSetName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateSet(); if (e.key === 'Escape') setCreating(false); }}
                placeholder="Nom du set..."
                className="px-2 py-1 text-xs rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] text-[var(--text-primary)] outline-none w-36"
              />
              <button onClick={handleCreateSet} className="text-blue-400 text-xs bg-transparent border-none cursor-pointer">OK</button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="px-2 py-1.5 rounded-lg border border-dashed border-[var(--border-default)] text-[var(--text-muted)] text-xs cursor-pointer hover:border-blue-500/50 hover:text-blue-400 transition-all bg-transparent"
            >
              <Plus size={13} />
            </button>
          )}
        </div>
      </div>

      {!currentSet ? (
        <div className="text-center py-16">
          <Disc3 size={48} className="text-[var(--text-muted)] mx-auto mb-4 opacity-30" />
          <div className="text-[var(--text-muted)] text-sm">Crée ton premier set pour commencer</div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">{currentSet.name}</h2>
              <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)] mt-0.5">
                <span className="flex items-center gap-1"><Music size={11} /> {setTracks.length} tracks</span>
                <span className="flex items-center gap-1"><Clock size={11} /> ~{totalMin} min</span>
                <span className="flex items-center gap-1"><Zap size={11} /> {bpmRange} BPM</span>
                {setHarmonicScore !== null && (
                  <span className={`flex items-center gap-1 font-semibold ${
                    setHarmonicScore >= 75 ? 'text-emerald-400' : setHarmonicScore >= 50 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    <CheckCircle2 size={11} /> Mix: {setHarmonicScore}%
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] text-xs cursor-pointer hover:bg-[var(--bg-hover)]"
                >
                  <Download size={13} /> Exporter <ChevronDown size={11} />
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-lg z-10 overflow-hidden min-w-[140px]">
                    <button onClick={() => handleExport('rekordbox')} className="w-full text-left px-3 py-2 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">Rekordbox XML</button>
                    <button onClick={() => handleExport('m3u')} className="w-full text-left px-3 py-2 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">M3U Playlist</button>
                  </div>
                )}
              </div>
              <button
                onClick={handleSuggestNext}
                disabled={sugLoading || setTracks.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-semibold cursor-pointer border-none hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {sugLoading ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                Suggérer suivant
              </button>
              <button
                onClick={() => setShowTrackPicker(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer border-none hover:bg-blue-500"
              >
                <Plus size={13} /> Ajouter
              </button>
              <button
                onClick={() => handleDeleteSet(currentSet.id)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-xs cursor-pointer hover:bg-red-500/10 bg-transparent"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Energy curve */}
          {setTracks.length > 1 && (
            <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] p-4">
              <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Courbe d'énergie</div>
              <div className="flex items-end gap-1 h-16">
                {setTracks.map((st, i) => {
                  const energy = Math.round((st.track?.analysis?.energy || 0) * 100);
                  const color = getEnergyColor(energy);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[9px] text-[var(--text-muted)] font-mono">{energy}</span>
                      <div
                        className="w-full rounded-t-md transition-all"
                        style={{
                          height: `${Math.max(energy * 0.6, 4)}px`,
                          background: `linear-gradient(to top, ${color}40, ${color})`,
                        }}
                      />
                      <span className="text-[8px] text-[var(--text-muted)] truncate max-w-full">{st.track?.artist?.split(' ')[0] || ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tracks */}
          <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] overflow-hidden">
            {setTracks.length === 0 ? (
              <div className="text-center py-12">
                <Music size={32} className="text-[var(--text-muted)] mx-auto mb-3 opacity-30" />
                <div className="text-sm text-[var(--text-muted)]">Ajoute des tracks pour construire ton set</div>
                <button
                  onClick={() => setShowTrackPicker(true)}
                  className="mt-3 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer border-none hover:bg-blue-500"
                >
                  <Plus size={13} className="inline mr-1" /> Ajouter un track
                </button>
              </div>
            ) : (
              setTracks.map((st, i) => {
                const t = st.track;
                const energy = Math.round((t?.analysis?.energy || 0) * 100);
                const bpm = t?.analysis?.bpm ? Math.round(t.analysis.bpm * 10) / 10 : null;
                const key = t?.analysis?.key ? (CAMELOT[t.analysis.key] || t.analysis.key) : null;
                const nextTrack = setTracks[i + 1]?.track;
                const bpmDiff = nextTrack?.analysis?.bpm && bpm ? Math.round((nextTrack.analysis.bpm - bpm) * 10) / 10 : null;

                return (
                  <div key={st.id || i}>
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors group">
                      {/* Handle */}
                      <div className="text-[var(--text-muted)] opacity-0 group-hover:opacity-50 cursor-grab">
                        <GripVertical size={14} />
                      </div>
                      {/* Position */}
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-lg"
                        style={{ background: `linear-gradient(135deg, ${getEnergyColor(energy)}, ${getEnergyColor(energy)}cc)` }}
                      >
                        {i + 1}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{t?.title || 'Unknown'}</div>
                        <div className="text-[11px] text-[var(--text-muted)]">{t?.artist || 'Unknown'}</div>
                      </div>
                      {/* BPM */}
                      <div className="text-center">
                        <div className="text-xs font-bold text-[var(--text-primary)] font-mono">{bpm || '—'}</div>
                        <div className="text-[9px] text-[var(--text-muted)]">BPM</div>
                      </div>
                      {/* Key */}
                      {key && <KeyBadge camelotKey={key} />}
                      {/* Energy bar */}
                      <div className="w-16">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${energy}%`, background: `linear-gradient(90deg, #22c55e, #eab308, #ef4444)` }}
                            />
                          </div>
                          <span className="text-[10px] text-[var(--text-muted)] font-mono w-6 text-right">{energy}</span>
                        </div>
                      </div>
                      {/* Duration */}
                      <span className="text-[11px] text-[var(--text-muted)] font-mono w-12 text-right">
                        {formatDuration(t?.analysis?.duration_ms)}
                      </span>
                      {/* Delete */}
                      <button
                        onClick={() => t && handleRemoveTrack(t.id)}
                        className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 bg-transparent border-none cursor-pointer p-1 transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {/* Transition indicator with compatibility scoring */}
                    {i < setTracks.length - 1 && (() => {
                      const nextT = setTracks[i + 1]?.track;
                      const nextBpm = nextT?.analysis?.bpm ? Math.round(nextT.analysis.bpm * 10) / 10 : null;
                      const nextKey = nextT?.analysis?.key || null;
                      const currentKey = t?.analysis?.key || null;
                      const bDiff = nextBpm && bpm ? Math.round((nextBpm - bpm) * 10) / 10 : null;
                      const keyCompat = getKeyCompatibility(currentKey, nextKey);
                      const mixScore = getMixScore(bpm, nextBpm, currentKey, nextKey);
                      const nextCamelot = nextKey ? (CAMELOT[nextKey] || nextKey) : null;

                      return (
                        <div className="flex items-center justify-center gap-2 py-1.5 bg-[var(--bg-elevated)]/50 px-4">
                          <div className="h-px flex-1 bg-[var(--border-subtle)]" />
                          <div className="flex items-center gap-3 px-3 py-1 rounded-full bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                            {/* BPM diff */}
                            {bDiff !== null && (
                              <span className={`text-[10px] font-mono font-medium ${
                                Math.abs(bDiff) <= 3 ? 'text-emerald-400' : Math.abs(bDiff) <= 6 ? 'text-yellow-400' : 'text-red-400'
                              }`}>
                                {bDiff > 0 ? '+' : ''}{bDiff} BPM
                              </span>
                            )}
                            {/* Key compatibility */}
                            {key && nextCamelot && (
                              <>
                                <span className="text-[var(--text-muted)]">|</span>
                                <span className={`text-[10px] font-medium ${keyCompat.color}`}>
                                  {key} → {nextCamelot} ({keyCompat.label})
                                </span>
                              </>
                            )}
                            {/* Mix score */}
                            <span className="text-[var(--text-muted)]">|</span>
                            <span className={`text-[10px] font-bold ${mixScore.color}`}>
                              {mixScore.score > 0 ? `${mixScore.score}%` : '—'}
                            </span>
                          </div>
                          <div className="h-px flex-1 bg-[var(--border-subtle)]" />
                        </div>
                      );
                    })()}
                  </div>
                );
              })
            )}
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="bg-gradient-to-r from-purple-600/10 to-pink-600/10 rounded-[14px] border border-purple-500/20 p-4">
              <div className="text-xs font-semibold text-purple-400 mb-3 flex items-center gap-1.5">
                <Wand2 size={13} /> Suggestions compatibles
              </div>
              <div className="space-y-1.5">
                {suggestions.map(t => (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg-card)]/50 hover:bg-[var(--bg-card)] transition-colors group">
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] font-medium text-[var(--text-primary)]">{t.title}</span>
                      <span className="text-[11px] text-[var(--text-muted)] ml-2">{t.artist}</span>
                    </div>
                    <span className="text-[11px] font-mono text-[var(--text-muted)]">{t.analysis?.bpm?.toFixed(0)} BPM</span>
                    <button
                      onClick={() => handleAddTrack(t.id)}
                      className="opacity-0 group-hover:opacity-100 px-2 py-1 rounded bg-blue-600 text-white text-[10px] font-semibold cursor-pointer border-none transition-all"
                    >
                      Ajouter
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Energy Flow for current set */}
          {setTracks.length >= 2 && (
            <EnergyFlow tracks={setTracks} title="Energy Flow du set" />
          )}
        </>
      )}

      {/* Track picker modal */}
      {showTrackPicker && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowTrackPicker(false)}>
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl shadow-2xl w-[500px] max-h-[70vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--border-subtle)]">
              <div className="text-sm font-bold text-[var(--text-primary)] mb-2">Ajouter un track au set</div>
              <input
                autoFocus
                value={trackSearch}
                onChange={e => setTrackSearch(e.target.value)}
                placeholder="Rechercher par titre ou artiste..."
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] text-[var(--text-primary)] text-sm outline-none placeholder:text-[var(--text-muted)]"
              />
            </div>
            <div className="overflow-y-auto max-h-[50vh] p-2">
              {filteredLibrary.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-muted)] text-sm">Aucun track trouvé</div>
              ) : (
                filteredLibrary.slice(0, 30).map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleAddTrack(t.id)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors cursor-pointer bg-transparent border-none"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">{t.title || t.original_filename}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{t.artist || 'Unknown'}</div>
                    </div>
                    <span className="text-[11px] font-mono text-[var(--text-muted)]">{t.analysis?.bpm?.toFixed(0) || '—'} BPM</span>
                    <span className="text-[11px] text-[var(--text-muted)]">{t.analysis?.key ? (CAMELOT[t.analysis.key] || t.analysis.key) : '—'}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
