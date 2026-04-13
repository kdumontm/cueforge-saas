/**
 * Zustand stores — player state, stems, global cache (points 651-670)
 * Minimizes prop drilling, enables perf optimizations via selectors
 */

import { create } from 'zustand';

// ── Player Store (singleton AudioContext + playback state) ──
interface PlayerState {
  audioContext: AudioContext | null;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  playbackRate: number;
  isMuted: boolean;

  // Actions
  initAudioContext: () => AudioContext;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (ms: number) => void;
  setVolume: (v: number) => void;
  setPlaybackRate: (r: number) => void;
  toggleMute: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  audioContext: null,
  isPlaying: false,
  currentTime: 0,
  volume: 0.8,
  playbackRate: 1,
  isMuted: false,

  initAudioContext: () => {
    const { audioContext } = get();
    if (audioContext) return audioContext;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    set({ audioContext: ctx });
    return ctx;
  },

  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (ms) => set({ currentTime: ms }),
  setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),
  setPlaybackRate: (r) => set({ playbackRate: Math.max(0.5, Math.min(2, r)) }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
}));

// ── Stems Store (muted stems, volumes per stem) ──
interface StemsState {
  mutedStems: Set<string>;
  stemVolumes: Record<string, number>;
  stemPans: Record<string, number>;

  // Actions
  toggleMuteStem: (key: string) => void;
  setStemVolume: (key: string, v: number) => void;
  setStemPan: (key: string, p: number) => void;
  setAllMuted: (keys: Set<string>) => void;
}

export const useStemsStore = create<StemsState>((set) => ({
  mutedStems: new Set(),
  stemVolumes: { vocals_url: 1, drums_url: 1, bass_url: 1, other_url: 1 },
  stemPans: { vocals_url: 0, drums_url: 0, bass_url: 0, other_url: 0 },

  toggleMuteStem: (key) =>
    set((s) => {
      const newSet = new Set(s.mutedStems);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return { mutedStems: newSet };
    }),

  setStemVolume: (key, v) =>
    set((s) => ({
      stemVolumes: { ...s.stemVolumes, [key]: Math.max(0, Math.min(1, v)) },
    })),

  setStemPan: (key, p) =>
    set((s) => ({
      stemPans: { ...s.stemPans, [key]: Math.max(-1, Math.min(1, p)) },
    })),

  setAllMuted: (keys) => set({ mutedStems: keys }),
}));

// ── Waveform Cache (LRU cache for precomputed spectral data) ──
interface CachedWaveform {
  trackId: number;
  colors: Array<{ r: number; g: number; b: number; amp: number }>;
  timestamp: number;
}

interface WaveformCacheState {
  cache: Map<number, CachedWaveform>;
  maxSize: number;

  get: (trackId: number) => CachedWaveform | null;
  set: (trackId: number, data: CachedWaveform) => void;
  clear: () => void;
}

export const useWaveformCache = create<WaveformCacheState>((set, get) => ({
  cache: new Map(),
  maxSize: 20, // Keep last 20 waveforms in memory

  get: (trackId) => {
    const { cache } = get();
    return cache.get(trackId) || null;
  },

  set: (trackId, data) => {
    set((s) => {
      const newCache = new Map(s.cache);
      newCache.set(trackId, data);

      // LRU eviction: remove oldest if over maxSize
      if (newCache.size > s.maxSize) {
        let oldest: [number, CachedWaveform] | null = null;
        for (const entry of newCache.entries()) {
          if (!oldest || entry[1].timestamp < oldest[1].timestamp) {
            oldest = entry;
          }
        }
        if (oldest) newCache.delete(oldest[0]);
      }

      return { cache: newCache };
    });
  },

  clear: () => set({ cache: new Map() }),
}));

// ── Peak Cache (for LOD rendering in beatgrid, cues) ──
interface PeakCacheState {
  peaks: Map<number, Float32Array>; // trackId → peaks

  getPeaks: (trackId: number) => Float32Array | null;
  setPeaks: (trackId: number, peaks: Float32Array) => void;
  clear: () => void;
}

export const usePeakCache = create<PeakCacheState>((set, get) => ({
  peaks: new Map(),

  getPeaks: (trackId) => {
    const { peaks } = get();
    return peaks.get(trackId) || null;
  },

  setPeaks: (trackId, peaks) => {
    set((s) => {
      const newPeaks = new Map(s.peaks);
      newPeaks.set(trackId, peaks);
      // Evict if too many
      if (newPeaks.size > 30) {
        const first = newPeaks.keys().next();
        if (!first.done) newPeaks.delete(first.value);
      }
      return { peaks: newPeaks };
    });
  },

  clear: () => set({ peaks: new Map() }),
}));
