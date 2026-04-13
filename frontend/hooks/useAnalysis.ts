import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  analyzeTrackQuick,
  batchAnalyzeTracks,
  compareTracksDetailed,
  findCompatibleTracks,
  generateSmartPlaylist,
  suggestCues,
  applySuggestedCues,
  getSpectrogram,
  getLoudnessTimeline,
  getStereoField,
  getHarmonicSummary,
  getVocalAnalysis,
  getProductionAnalysis,
  getMixingCompatibility,
  getTransitionZones,
  getRhythmSummary,
  getSpectralSummary,
  getMixRecommendations,
  getQualityExtended,
  getStructuralSummary,
  getAudioQuality,
  type PlaylistMode,
} from '@/lib/api';

// ── Quick Analysis ──────────────────────────────────────────────────────

export function useQuickAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (trackId: number) => analyzeTrackQuick(trackId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
    },
  });
}

// ── Batch Analysis ──────────────────────────────────────────────────────

export function useBatchAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ trackIds, quick = true }: { trackIds: number[]; quick?: boolean }) =>
      batchAnalyzeTracks(trackIds, quick),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
    },
  });
}

// ── Track Comparison ────────────────────────────────────────────────────

export function useTrackComparison(trackIdA: number, trackIdB: number, enabled = true) {
  return useQuery({
    queryKey: ['track-comparison', trackIdA, trackIdB],
    queryFn: () => compareTracksDetailed(trackIdA, trackIdB),
    enabled: enabled && trackIdA > 0 && trackIdB > 0,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Compatible Tracks ───────────────────────────────────────────────────

export function useCompatibleTracks(trackId: number, limit = 10, enabled = true) {
  return useQuery({
    queryKey: ['compatible-tracks', trackId, limit],
    queryFn: () => findCompatibleTracks(trackId, limit),
    enabled: enabled && trackId > 0,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Smart Playlist ──────────────────────────────────────────────────────

export function useSmartPlaylist() {
  return useMutation({
    mutationFn: ({
      trackIds,
      mode = 'energy_flow',
      targetDurationMin = 60,
    }: {
      trackIds: number[];
      mode?: PlaylistMode;
      targetDurationMin?: number;
    }) => generateSmartPlaylist(trackIds, mode, targetDurationMin),
  });
}

// ── Cue Suggestions ─────────────────────────────────────────────────────

export function useCueSuggestions(trackId: number, maxCues = 8, enabled = true) {
  return useQuery({
    queryKey: ['cue-suggestions', trackId, maxCues],
    queryFn: () => suggestCues(trackId, maxCues),
    enabled: enabled && trackId > 0,
    staleTime: 10 * 60 * 1000,
  });
}

export function useApplySuggestedCues() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ trackId, cueIndices }: { trackId: number; cueIndices?: number[] }) =>
      applySuggestedCues(trackId, cueIndices),
    onSuccess: (_, { trackId }) => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
      queryClient.invalidateQueries({ queryKey: ['cue-suggestions', trackId] });
    },
  });
}

// ── Visualization Hooks ─────────────────────────────────────────────────

export function useSpectrogram(trackId: number, enabled = true) {
  return useQuery({
    queryKey: ['spectrogram', trackId],
    queryFn: () => getSpectrogram(trackId),
    enabled: enabled && trackId > 0,
    staleTime: 30 * 60 * 1000, // Spectrograms don't change
    gcTime: 60 * 60 * 1000,
  });
}

export function useLoudnessTimeline(trackId: number, enabled = true) {
  return useQuery({
    queryKey: ['loudness-timeline', trackId],
    queryFn: () => getLoudnessTimeline(trackId),
    enabled: enabled && trackId > 0,
    staleTime: 30 * 60 * 1000,
  });
}

export function useStereoField(trackId: number, enabled = true) {
  return useQuery({
    queryKey: ['stereo-field', trackId],
    queryFn: () => getStereoField(trackId),
    enabled: enabled && trackId > 0,
    staleTime: 30 * 60 * 1000,
  });
}

// ── Deep Analysis Hooks ─────────────────────────────────────────────────

function useDeepAnalysis<T>(key: string, trackId: number, fetcher: (id: number) => Promise<T>, enabled = true) {
  return useQuery({
    queryKey: [key, trackId],
    queryFn: () => fetcher(trackId),
    enabled: enabled && trackId > 0,
    staleTime: 10 * 60 * 1000,
  });
}

export function useHarmonicSummary(trackId: number, enabled = true) {
  return useDeepAnalysis('harmonic-summary', trackId, getHarmonicSummary, enabled);
}

export function useVocalAnalysis(trackId: number, enabled = true) {
  return useDeepAnalysis('vocal-analysis', trackId, getVocalAnalysis, enabled);
}

export function useProductionAnalysis(trackId: number, enabled = true) {
  return useDeepAnalysis('production-analysis', trackId, getProductionAnalysis, enabled);
}

export function useMixingCompatibility(trackId: number, enabled = true) {
  return useDeepAnalysis('mixing-compatibility', trackId, getMixingCompatibility, enabled);
}

export function useTransitionZones(trackId: number, enabled = true) {
  return useDeepAnalysis('transition-zones', trackId, getTransitionZones, enabled);
}

export function useRhythmSummary(trackId: number, enabled = true) {
  return useDeepAnalysis('rhythm-summary', trackId, getRhythmSummary, enabled);
}

export function useSpectralSummary(trackId: number, enabled = true) {
  return useDeepAnalysis('spectral-summary', trackId, getSpectralSummary, enabled);
}

export function useMixRecommendations(trackId: number, enabled = true) {
  return useDeepAnalysis('mix-recommendations', trackId, getMixRecommendations, enabled);
}

export function useQualityExtended(trackId: number, enabled = true) {
  return useDeepAnalysis('quality-extended', trackId, getQualityExtended, enabled);
}

export function useStructuralSummary(trackId: number, enabled = true) {
  return useDeepAnalysis('structural-summary', trackId, getStructuralSummary, enabled);
}

export function useAudioQuality(trackId: number, enabled = true) {
  return useDeepAnalysis('audio-quality', trackId, getAudioQuality, enabled);
}
