'use client';

import { useState, useEffect } from 'react';
import { Zap, Search, Music2, Loader2, ChevronDown } from 'lucide-react';
import { listTracks } from '@/lib/api';
import CompatibleTracks from '@/components/CompatibleTracks';
import type { Track } from '@/types';

export default function CompatiblePage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    listTracks(1, 100)
      .then(res => {
        // Only show analyzed tracks (they have BPM/key data)
        const analyzed = res.tracks.filter((t: Track) => t.status === 'completed');
        setTracks(analyzed);
        if (analyzed.length > 0 && !selectedTrack) setSelectedTrack(analyzed[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = tracks.filter(t => {
    const q = search.toLowerCase();
    return (
      (t.title || '').toLowerCase().includes(q) ||
      (t.artist || '').toLowerCase().includes(q) ||
      t.original_filename.toLowerCase().includes(q)
    );
  });

  function selectTrack(t: Track) {
    setSelectedTrack(t);
    setDropdownOpen(false);
    setSearch('');
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2 mb-1">
          <Zap size={20} className="text-purple-400" />
          Compatibilité de mix
        </h1>
        <p className="text-[13px] text-[var(--text-muted)]">
          Sélectionne une track et découvre les meilleures transitions basées sur la Camelot wheel + BPM
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[var(--text-muted)]">
          <Loader2 size={20} className="animate-spin mr-2" /> Chargement des tracks...
        </div>
      ) : tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)]">
          <Music2 size={36} className="text-[var(--text-muted)] mb-3 opacity-40" />
          <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">Aucune track analysée</h3>
          <p className="text-[13px] text-[var(--text-muted)]">
            Upload et analyse au moins 2 tracks pour voir les compatibilités de mix.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Track selector */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4">
            <label className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Track de référence
            </label>
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(v => !v)}
                className="w-full flex items-center gap-3 bg-[var(--bg-input)] border border-[var(--border-default)] hover:border-purple-500/40 rounded-xl px-4 py-3 text-left transition-colors cursor-pointer"
              >
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-900/40 to-blue-900/40 flex items-center justify-center flex-shrink-0">
                  <Music2 size={16} className="text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  {selectedTrack ? (
                    <>
                      <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                        {selectedTrack.title || selectedTrack.original_filename}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {selectedTrack.artist && <span>{selectedTrack.artist} · </span>}
                        {selectedTrack.analysis?.bpm && <span className="font-mono">{Math.round(selectedTrack.analysis.bpm)} BPM · </span>}
                        {selectedTrack.analysis?.key && <span>{selectedTrack.analysis.key}</span>}
                      </p>
                    </>
                  ) : (
                    <span className="text-[13px] text-[var(--text-muted)]">Sélectionne une track...</span>
                  )}
                </div>
                <ChevronDown size={15} className={`text-[var(--text-muted)] transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown */}
              {dropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1.5 z-30 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-2xl overflow-hidden">
                  {/* Search inside dropdown */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)]">
                    <Search size={13} className="text-[var(--text-muted)]" />
                    <input
                      autoFocus
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Rechercher..."
                      className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {filtered.length === 0 && (
                      <p className="px-3 py-4 text-[13px] text-[var(--text-muted)] text-center">Aucune track trouvée</p>
                    )}
                    {filtered.map(t => (
                      <button
                        key={t.id}
                        onClick={() => selectTrack(t)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-hover)] transition-colors text-left bg-transparent border-none cursor-pointer ${
                          selectedTrack?.id === t.id ? 'bg-purple-600/10' : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
                            {t.title || t.original_filename}
                          </p>
                          <p className="text-[11px] text-[var(--text-muted)]">
                            {t.artist && <span>{t.artist} · </span>}
                            {t.analysis?.bpm && <span className="font-mono">{Math.round(t.analysis.bpm)} BPM · </span>}
                            {t.analysis?.key}
                          </p>
                        </div>
                        {selectedTrack?.id === t.id && (
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Compatible tracks panel */}
          {selectedTrack && (
            <CompatibleTracks
              trackId={selectedTrack.id}
              trackTitle={selectedTrack.title || selectedTrack.original_filename}
              trackKey={selectedTrack.analysis?.key}
              trackBpm={selectedTrack.analysis?.bpm}
            />
          )}

          {/* Legend */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4">
            <h4 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
              Légende — Camelot Wheel
            </h4>
            <div className="grid grid-cols-2 gap-2 text-[12px] text-[var(--text-secondary)]">
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {[1,2,3].map(n => <div key={n} className="w-1.5 h-1.5 rounded-full bg-purple-400" />)}
                </div>
                <span>Même tonalité (parfait)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {[1,2].map(n => <div key={n} className="w-1.5 h-1.5 rounded-full bg-purple-400" />)}
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--border-subtle)]" />
                </div>
                <span>±1 sur la roue (harmonique)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  {[1,2].map(n => <div key={n} className="w-1.5 h-1.5 rounded-full bg-[var(--border-subtle)]" />)}
                </div>
                <span>±2 sur la roue (boost énergie)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {[1,2,3].map(n => <div key={n} className="w-1.5 h-1.5 rounded-full bg-[var(--border-subtle)]" />)}
                </div>
                <span>Pas compatible harmoniquement</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
