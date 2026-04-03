export interface User {
  id: number;
  email: string;
  plan: string;
  tracks_today: number;
  created_at: string;
}

export interface CuePoint {
  id: number;
  position_ms: number;
  cue_type: string;
  name: string;
  color: string;
  color_rgb?: string | null;
  cue_mode?: 'memory' | 'hot';
  number: number | null;
  end_position_ms: number | null;
}

export interface LoopMarker {
  id: number;
  track_id: number;
  start_ms: number;
  end_ms: number;
  name?: string | null;
  color?: string;
  number?: number | null;
  length_beats?: number | null;
  is_active: boolean;
  auto_generated: boolean;
}

export interface TrackAnalysis {
  id: number;
  bpm: number | null;
  bpm_confidence: number | null;
  key: string | null;
  energy: number | null;
  duration_ms: number | null;
  drop_positions: number[];
  phrase_positions: number[];
  beat_positions: number[];
  section_labels: Record<string, unknown>[];
  waveform_peaks?: number[] | null;
  spectral_energy?: {
    low_energy: number;
    mid_energy: number;
    high_energy: number;
  } | null;
  analyzed_at: string;
  // v4 fields
  loudness_lufs?: number | null;
  loudness_range_lu?: number | null;
  replay_gain_db?: number | null;
  bpm_map?: Array<{ position_ms: number; bpm: number }> | null;
  bpm_stable?: boolean;
  key_secondary?: string | null;
  key_confidence?: number | null;
  loudness_db?: number | null;
  vocal_percentage?: number | null;
  mood?: string | null;
  danceability?: number | null;
}

export interface Track {
  id: number;
  filename: string;
  original_filename: string;
  status: string;
  created_at: string;
  // Metadata (populated after analysis)
  artist?: string | null;
  title?: string | null;
  album?: string | null;
  genre?: string | null;
  year?: number | null;
  artwork_url?: string | null;
  spotify_id?: string | null;
  spotify_url?: string | null;
  musicbrainz_id?: string | null;
  // DJ Organization
  category?: string | null;
  tags?: string | null;
  rating?: number | null;
  color_code?: string | null;
  comment?: string | null;
  energy_level?: number | null;
  played_count?: number;
  // v4: Remix/version info
  remix_artist?: string | null;
  remix_type?: string | null;
  feat_artist?: string | null;
  label?: string | null;
  camelot_code?: string | null;
  last_played_at?: string | null;
  analysis: TrackAnalysis | null;
  cue_points: CuePoint[];
  loop_markers?: LoopMarker[];
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
}

export type CueColor =
  | 'red' | 'orange' | 'yellow' | 'green'
  | 'cyan' | 'blue' | 'purple' | 'pink' | 'white';

export const CUE_COLORS: Record<CueColor, string> = {
  red: '#e11d48',
  orange: '#ea580c',
  yellow: '#ca8a04',
  green: '#16a34a',
  cyan: '#0891b2',
  blue: '#2563eb',
  purple: '#7c3aed',
  pink: '#db2777',
  white: '#e2e8f0',
};


// Extended Track with metadata (added by update script)
// Note: Track interface already supports optional fields — metadata fields
// are already declared as optional in the backend schema and will be returned
// automatically when available.


// Rekordbox-style cue mode
export type CueMode = 'memory' | 'hot';

// Category presets (Rekordbox-inspired)
export const CATEGORY_PRESETS = [
  'Opening', 'Warm Up', 'Build Up', 'Peak Time',
  'Closing', 'After Hours', 'Chill', 'Transition',
  'B2B', 'Special', 'Edit', 'Mashup',
] as const;

// Rekordbox color palette for cue points
export const REKORDBOX_CUE_COLORS: Record<string, string> = {
  red: '#C02626',
  orange: '#F8821A',
  yellow: '#F1E315',
  green: '#1FAD2D',
  cyan: '#0DC5C1',
  blue: '#1644AD',
  purple: '#9110C2',
  pink: '#E91180',
  white: '#E0E0E0',
};
