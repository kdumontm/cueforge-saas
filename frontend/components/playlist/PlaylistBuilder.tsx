'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { GripVertical, Trash2, Plus, TrendingUp, AlertCircle, Share2, Copy } from 'lucide-react';
import { Slider } from '@/components/ui/Slider';

interface Track {
  id: number;
  title: string;
  artist: string;
  bpm?: number | null;
  key?: string | null;
  energy?: number | null;
  duration?: string;
}

interface PlaylistTrack {
  id: string;
  track: Track;
  position: number;
}

interface PlaylistBuilderProps {
  tracks: PlaylistTrack[];
  onReorder?: (tracks: PlaylistTrack[]) => void;
  onRemove?: (trackId: string) => void;
  onAdd?: (track: Track) => void;
  allAvailableTracks?: Track[];
}

// Key compatibility matrix (simple version)
const KEY_COMPATIBILITY: Record<string, string[]> = {
  'C': ['C', 'G', 'F', 'Dm', 'Am'],
  'G': ['G', 'D', 'C', 'Am', 'Em'],
  'D': ['D', 'A', 'G', 'Em', 'Bm'],
  'A': ['A', 'E', 'D', 'Bm', 'F#m'],
  'E': ['E', 'B', 'A', 'F#m', 'C#m'],
  'B': ['B', 'F#', 'E', 'C#m', 'G#m'],
  'F#': ['F#', 'C#', 'B', 'G#m', 'D#m'],
  'C#': ['C#', 'G#', 'F#', 'D#m', 'A#m'],
  'F': ['F', 'C', 'Bb', 'Dm', 'Gm'],
  'Bb': ['Bb', 'F', 'Eb', 'Gm', 'Cm'],
  'Eb': ['Eb', 'Bb', 'Ab', 'Cm', 'Fm'],
  'Ab': ['Ab', 'Eb', 'Db', 'Fm', 'Bbm'],
};

const getKeyCompatibility = (key1: string | null, key2: string | null): 'green' | 'yellow' | 'red' => {
  if (!key1 || !key2) return 'yellow';
  const compatible = KEY_COMPATIBILITY[key1] || [];
  if (compatible.includes(key2)) return 'green';
  return 'red';
};

const calculateSetDuration = (tracks: PlaylistTrack[]): { total: string; sections: Record<string, string> } => {
  const totalMs = tracks.reduce((sum, pt) => {
    if (pt.track.duration) {
      const parts = pt.track.duration.split(':');
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseInt(parts[1]) || 0;
      return sum + minutes * 60000 + seconds * 1000;
    }
    return sum;
  }, 0);

  const totalMinutes = Math.floor(totalMs / 60000);
  const totalSeconds = Math.floor((totalMs % 60000) / 1000);

  return {
    total: `${totalMinutes}:${totalSeconds.toString().padStart(2, '0')}`,
    sections: {},
  };
};

// Suggest optimal track order based on energy arc
const suggestOptimalOrder = (tracks: PlaylistTrack[]): PlaylistTrack[] => {
  const sorted = [...tracks].sort((a, b) => {
    const energyA = a.track.energy ?? 50;
    const energyB = b.track.energy ?? 50;
    return energyA - energyB;
  });

  // Create energy arc: low → high → low
  const result: PlaylistTrack[] = [];
  const mid = Math.floor(sorted.length / 2);

  // Add low energy first
  for (let i = 0; i < mid; i++) {
    result.push(sorted[i]);
  }

  // Add high energy in middle
  for (let i = sorted.length - 1; i >= mid; i--) {
    result.push(sorted[i]);
  }

  return result.map((t, idx) => ({ ...t, position: idx }));
};

export default function PlaylistBuilder({
  tracks,
  onReorder = () => {},
  onRemove = () => {},
  onAdd = () => {},
  allAvailableTracks = [],
}: PlaylistBuilderProps) {
  // ========== Drag & Drop State ==========
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [orderedTracks, setOrderedTracks] = useState<PlaylistTrack[]>(tracks);

  // ========== Comparison Mode ==========
  const [showEnergyGraph, setShowEnergyGraph] = useState(true);
  const [showTransitions, setShowTransitions] = useState(true);

  // ========== Template Selection ==========
  const [selectedTemplate, setSelectedTemplate] = useState<'warm-up' | 'peak' | 'cool-down' | null>(null);

  // ========== Add Track Modal ==========
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ========== Share Modal ==========
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  // ========== Smart Playlist ==========
  const [smartMode, setSmartMode] = useState(false);
  const [smartCriteria, setSmartCriteria] = useState({
    minBpm: 100,
    maxBpm: 140,
    minEnergy: 50,
  });

  // ========== Handlers ==========
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) return;

    const newTracks = [...orderedTracks];
    const draggedTrack = newTracks[draggedIndex];
    newTracks.splice(draggedIndex, 1);
    newTracks.splice(index, 0, draggedTrack);

    newTracks.forEach((t, idx) => {
      t.position = idx;
    });

    setOrderedTracks(newTracks);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    onReorder(orderedTracks);
  };

  const handleRemoveTrack = (trackId: string) => {
    const filtered = orderedTracks.filter((t) => t.id !== trackId);
    filtered.forEach((t, idx) => {
      t.position = idx;
    });
    setOrderedTracks(filtered);
    onRemove(trackId);
  };

  const applyTemplate = (template: 'warm-up' | 'peak' | 'cool-down') => {
    let filtered = orderedTracks;

    if (template === 'warm-up') {
      filtered = orderedTracks.filter((t) => (t.track.energy ?? 50) < 60);
    } else if (template === 'peak') {
      filtered = orderedTracks.filter((t) => (t.track.energy ?? 50) >= 70);
    } else if (template === 'cool-down') {
      filtered = orderedTracks.filter((t) => (t.track.energy ?? 50) < 50);
    }

    filtered.forEach((t, idx) => {
      t.position = idx;
    });
    setOrderedTracks(filtered);
    setSelectedTemplate(template);
  };

  const applySuggestedOrder = () => {
    const optimized = suggestOptimalOrder(orderedTracks);
    setOrderedTracks(optimized);
    onReorder(optimized);
  };

  const generateShareUrl = () => {
    const trackIds = orderedTracks.map((t) => t.track.id).join(',');
    const url = `${window.location.origin}/playlist?tracks=${trackIds}`;
    setShareUrl(url);
    setShowShareModal(true);
  };

  const copyShareUrl = () => {
    navigator.clipboard.writeText(shareUrl);
  };

  const filteredTracks = useMemo(() => {
    return allAvailableTracks.filter((track) => {
      const matchesQuery =
        track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        track.artist.toLowerCase().includes(searchQuery.toLowerCase());

      const isNotInPlaylist = !orderedTracks.some((pt) => pt.track.id === track.id);

      return matchesQuery && isNotInPlaylist;
    });
  }, [searchQuery, allAvailableTracks, orderedTracks]);

  const setDuration = calculateSetDuration(orderedTracks);

  return (
    <div className="w-full bg-gray-900 text-white p-6 space-y-6">
      {/* ========== Header & Controls ========== */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Playlist Builder</h2>
            <p className="text-sm text-gray-400">{orderedTracks.length} tracks • {setDuration.total}</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={applySuggestedOrder}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded text-sm font-semibold flex items-center gap-2"
            >
              <TrendingUp size={16} />
              Auto Order
            </button>
            <button
              onClick={generateShareUrl}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-semibold flex items-center gap-2"
            >
              <Share2 size={16} />
              Share
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-semibold flex items-center gap-2"
            >
              <Plus size={16} />
              Add
            </button>
          </div>
        </div>

        {/* ========== View Options ========== */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowEnergyGraph(!showEnergyGraph)}
            className={`px-3 py-1 text-xs rounded ${
              showEnergyGraph ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'
            }`}
          >
            Energy Graph
          </button>
          <button
            onClick={() => setShowTransitions(!showTransitions)}
            className={`px-3 py-1 text-xs rounded ${
              showTransitions ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'
            }`}
          >
            Transitions
          </button>
          <button
            onClick={() => setSmartMode(!smartMode)}
            className={`px-3 py-1 text-xs rounded ${smartMode ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}
          >
            Smart Mode
          </button>
        </div>
      </div>

      {/* ========== Energy Curve Graph ========== */}
      {showEnergyGraph && orderedTracks.length > 0 && (
        <div className="border border-gray-700 rounded-lg p-4 bg-gray-800/50">
          <div className="h-32 bg-gray-900 rounded relative">
            <svg className="w-full h-full" viewBox={`0 0 ${orderedTracks.length * 40} 100`}>
              {/* Energy curve */}
              <polyline
                points={orderedTracks
                  .map(
                    (t, idx) =>
                      `${idx * 40 + 20},${100 - ((t.track.energy ?? 50) * 0.8)}`
                  )
                  .join(' ')}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
              />

              {/* Energy bars */}
              {orderedTracks.map((t, idx) => (
                <rect
                  key={idx}
                  x={idx * 40 + 5}
                  y={100 - (t.track.energy ?? 50) * 0.8}
                  width="30"
                  height={(t.track.energy ?? 50) * 0.8}
                  fill={
                    (t.track.energy ?? 50) >= 70
                      ? '#ef4444'
                      : (t.track.energy ?? 50) >= 50
                        ? '#f97316'
                        : '#84cc16'
                  }
                  opacity="0.6"
                />
              ))}
            </svg>
          </div>
        </div>
      )}

      {/* ========== Templates ========== */}
      <div className="space-y-2 border-t border-gray-700 pt-4">
        <label className="text-sm font-semibold">Quick Templates</label>
        <div className="grid grid-cols-3 gap-2">
          {(['warm-up', 'peak', 'cool-down'] as const).map((template) => (
            <button
              key={template}
              onClick={() => applyTemplate(template)}
              className={`py-2 px-3 text-xs rounded font-semibold capitalize ${
                selectedTemplate === template
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {template}
            </button>
          ))}
        </div>
      </div>

      {/* ========== Smart Mode ========== */}
      {smartMode && (
        <div className="border border-blue-500 rounded-lg p-4 bg-blue-900/20 space-y-3">
          <label className="text-sm font-semibold">Smart Playlist Criteria</label>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Min BPM: {smartCriteria.minBpm}</span>
            </div>
            <Slider
              value={[smartCriteria.minBpm]}
              onValueChange={(vals) =>
                setSmartCriteria({ ...smartCriteria, minBpm: vals[0] })
              }
              min={60}
              max={200}
              step={5}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Max BPM: {smartCriteria.maxBpm}</span>
            </div>
            <Slider
              value={[smartCriteria.maxBpm]}
              onValueChange={(vals) =>
                setSmartCriteria({ ...smartCriteria, maxBpm: vals[0] })
              }
              min={60}
              max={200}
              step={5}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>Min Energy: {smartCriteria.minEnergy}%</span>
            </div>
            <Slider
              value={[smartCriteria.minEnergy]}
              onValueChange={(vals) =>
                setSmartCriteria({ ...smartCriteria, minEnergy: vals[0] })
              }
              min={0}
              max={100}
              step={5}
              className="w-full"
            />
          </div>

          <p className="text-xs text-gray-400">
            Smart mode will auto-update playlist when new tracks match these criteria.
          </p>
        </div>
      )}

      {/* ========== Playlist Tracks ========== */}
      <div className="space-y-2 border-t border-gray-700 pt-4">
        <label className="text-sm font-semibold">Tracks</label>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {orderedTracks.map((pt, idx) => {
            const nextTrack = orderedTracks[idx + 1];
            const keyCompat = nextTrack ? getKeyCompatibility(pt.track.key, nextTrack.track.key) : 'green';
            const bpmDiff = nextTrack ? Math.abs((pt.track.bpm ?? 0) - (nextTrack.track.bpm ?? 0)) : 0;

            return (
              <div key={pt.id}>
                <div
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={() => handleDragOver(idx)}
                  onDragEnd={handleDragEnd}
                  className="flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded cursor-move transition-colors"
                >
                  <GripVertical size={16} className="text-gray-500" />

                  <div className="flex-1">
                    <div className="font-semibold text-sm">
                      {idx + 1}. {pt.track.title}
                    </div>
                    <div className="text-xs text-gray-400">
                      {pt.track.artist} • {pt.track.bpm || '?'} BPM • {pt.track.key || '?'} •{' '}
                      {pt.track.energy ?? 50}%
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveTrack(pt.id)}
                    className="p-2 hover:bg-red-600 rounded text-red-400"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Gap Analysis */}
                {showTransitions && nextTrack && (
                  <div className="flex items-center gap-2 px-6 py-2 text-xs text-gray-400">
                    {keyCompat === 'green' ? (
                      <span className="text-green-400">✓ Key match</span>
                    ) : keyCompat === 'yellow' ? (
                      <span className="text-yellow-400">⚠ Key caution</span>
                    ) : (
                      <span className="text-red-400 flex items-center gap-1">
                        <AlertCircle size={12} /> Key mismatch
                      </span>
                    )}
                    {bpmDiff > 20 && (
                      <span className="text-yellow-400">BPM jump: {bpmDiff} BPM</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ========== Add Track Modal ========== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 rounded-lg">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">Add Track</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white">
                ✕
              </button>
            </div>

            <input
              type="text"
              placeholder="Search tracks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm"
            />

            <div className="max-h-64 overflow-y-auto space-y-1">
              {filteredTracks.map((track) => (
                <button
                  key={track.id}
                  onClick={() => {
                    onAdd(track);
                    setOrderedTracks([
                      ...orderedTracks,
                      {
                        id: `${track.id}`,
                        track,
                        position: orderedTracks.length,
                      },
                    ]);
                    setShowAddModal(false);
                    setSearchQuery('');
                  }}
                  className="w-full text-left px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded text-xs"
                >
                  <div className="font-semibold">{track.title}</div>
                  <div className="text-gray-400">{track.artist}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========== Share Modal ========== */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 rounded-lg">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">Share Playlist</h3>
              <button onClick={() => setShowShareModal(false)} className="text-gray-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-xs"
              />
              <button
                onClick={copyShareUrl}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded flex items-center gap-2"
              >
                <Copy size={14} />
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
