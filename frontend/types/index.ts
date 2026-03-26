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
  number: number | null;
  end_position_ms: number | null;
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
  analyzed_at: string;
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
  analysis: TrackAnalysis | null;
  cue_points: CuePoint[];
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
