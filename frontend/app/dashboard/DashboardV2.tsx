// @ts-nocheck
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Loader2, Zap, RefreshCw } from 'lucide-react';
import { uploadTrack, analyzeTrack, pollTrackUntilDone, listTracks, deleteTrack, getTrack, getCurrentUser } from '@/lib/api';
import type { Track } from '@/types';

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
  { id: 'cues', label: 'Cues', icon: '🎯' },
  { id: 'beatgrid', label: 'Beatgrid', icon: '⊞' },
  { id: 'stems', label: 'Stems', icon: '🎸' },
  { id: 'eq', label: 'EQ', icon: '〰' },
  { id: 'fx', label: 'FX', icon: '✨' },
  { id: 'mix', label: 'Mix', icon: '🎡' },
  { id: 'playlists', label: 'Playlists', icon: '💿' },
  { id: 'stats', label: 'Stats', icon: '📊' },
  { id: 'history', label: 'Historique', icon: '🕐' },
];

const GLOBAL_TABS = ['stats', 'history', 'playlists'];

// ── Main Component ─────────────────────────────────────────────────────
export default function DashboardV2() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('cues');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load tracks from API
  useEffect(() => {
    loadTracks();
  }, []);

  async function loadTracks() {
    try {
      setLoading(true);
      const data = await listTracks();
      setTracks(data || []);
    } catch (e) {
      console.error('Failed to load tracks:', e);
    } finally {
      setLoading(false);
    }
  }

  // Transform API track to display format
  function toDisplayTrack(t: Track) {
    const analysis = t.analysis || {} as any;
    return {
      id: t.id,
      title: t.title || t.filename || 'Unknown',
      artist: t.artist || 'Unknown',
      genre: analysis.genre || '—',
      bpm: analysis.bpm ? Math.round(analysis.bpm * 10) / 10 : null,
      key: toCamelot(analysis.key),
      energy: analysis.energy ? Math.round(analysis.energy * 100) : null,
      duration: formatDuration(analysis.duration_seconds || t.duration_seconds),
      rating: t.rating || 0,
      tags: t.tags ? (typeof t.tags === 'string' ? t.tags.split(',').filter(Boolean) : t.tags) : [],
      analyzed: t.status === 'analyzed',
      color: null,
    };
  }

  function handleSelectTrack(track: any) {
    // If the track comes from TrackList mock data, use as-is
    // If it's from API, transform it
    setSelectedTrack(track);
  }

  // File upload
  async function handleFiles(files: FileList) {
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const uploaded = await uploadTrack(file);
        if (uploaded?.id) {
          await analyzeTrack(uploaded.id);
          await pollTrackUntilDone(uploaded.id);
        }
      } catch (e) {
        console.error('Upload failed:', e);
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

  return (
    <div
      className="p-4 space-y-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleFileDrop}
    >
      {/* Player Card */}
      <PlayerCard track={selectedTrack} />

      {/* Tab Panel */}
      <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] overflow-hidden">
        {/* Tab bar */}
        <div className="flex gap-0 border-b border-[var(--border-subtle)] overflow-x-auto">
          {TABS.map(t => {
            const disabled = !selectedTrack && !GLOBAL_TABS.includes(t.id);
            return (
              <button
                key={t.id}
                onClick={() => !disabled && setActiveTab(t.id)}
                disabled={disabled}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 border-none text-xs whitespace-nowrap transition-all ${
                  activeTab === t.id
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold border-b-2 border-b-blue-500'
                    : disabled
                      ? 'text-[var(--text-muted)] opacity-40 cursor-not-allowed'
                      : 'text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
                style={{
                  borderBottom: activeTab === t.id ? '2px solid #2563eb' : '2px solid transparent',
                  background: activeTab === t.id ? 'var(--bg-elevated)' : 'transparent',
                }}
              >
                <span className="text-[13px]">{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="p-4 min-h-[160px]">
          {activeTab === 'cues' && <CuesTab trackTitle={selectedTrack?.title} />}
          {activeTab === 'beatgrid' && <BeatgridTab bpm={selectedTrack?.bpm} />}
          {activeTab === 'stems' && <StemsTab />}
          {activeTab === 'eq' && <EQTab />}
          {activeTab === 'fx' && <FXTab />}
          {activeTab === 'mix' && <MixTab selectedKey={selectedTrack?.key} />}
          {activeTab === 'playlists' && <PlaylistsTab />}
          {activeTab === 'stats' && <StatsTab />}
          {activeTab === 'history' && <HistoryTab />}
        </div>
      </div>

      {/* Track List */}
      <TrackList
        onSelectTrack={handleSelectTrack}
        selectedTrackId={selectedTrack?.id}
      />

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
    </div>
  );
}
