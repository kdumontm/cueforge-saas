export const HOT_CUE_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

export const HOT_CUE_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// Improvement #53: Cue type badges for hot cues bar (small icons/labels)
export const CUE_TYPE_BADGES: Record<string, { emoji: string; label: string; color: string }> = {
  drop: { emoji: '💥', label: 'D', color: '#ef4444' },
  build: { emoji: '📈', label: 'B', color: '#f59e0b' },
  vocal: { emoji: '🎤', label: 'V', color: '#8b5cf6' },
  loop: { emoji: '🔁', label: 'L', color: '#3b82f6' },
  phrase: { emoji: '🎵', label: 'P', color: '#22c55e' },
  section: { emoji: '📍', label: 'S', color: '#06b6d4' },
  hot_cue: { emoji: '🎯', label: 'C', color: '#22c55e' },
  fade_in: { emoji: '⬆️', label: 'FI', color: '#f59e0b' },
  fade_out: { emoji: '⬇️', label: 'FO', color: '#f97316' },
  load: { emoji: '📌', label: 'LD', color: '#ec4899' },
};

// Improvement #43: Pad layout configurations
export const PAD_LAYOUTS = {
  '1x8': { rows: 1, cols: 8, label: '1×8 Linear' },
  '2x4': { rows: 2, cols: 4, label: '2×4 Grid' },
  '4x2': { rows: 4, cols: 2, label: '4×2 Grid' },
  '8x1': { rows: 8, cols: 1, label: '8×1 Stack' },
};

// Improvement #46: Pad bank configurations
export const CUE_BANKS = ['A', 'B', 'C', 'D'];

// Improvement #48: Rekordbox color palette (exact color codes)
export const REKORDBOX_PAD_COLORS = [
  '#FF0080', '#FF8000', '#FFFF00', '#00FF00',
  '#00FFFF', '#0080FF', '#FF00FF', '#FFFFFF',
];

// Improvement #52: Loop length displays
export const LOOP_LENGTH_LABELS: Record<number, string> = {
  1: '1 bar',
  2: '2 bars',
  4: '4 bars',
  8: '8 bars',
  16: '16 bars',
  32: '32 bars',
};

// Improvement #54: Haptic patterns for different actions
export const HAPTIC_PATTERNS = {
  tap: [50],
  doubletap: [50, 100, 50],
  longpress: [100, 50, 100],
  success: [50, 150, 50],
  error: [100, 50, 100, 50, 100],
};

// Improvement #31: Animation durations map
export const ANIMATION_DURATIONS = {
  fast: 150,
  normal: 300,
  slow: 500,
} as const;

// Improvement #32: Keyboard shortcuts map complet
export const KEYBOARD_SHORTCUTS = {
  PLAY_PAUSE: 'Space',
  PREVIOUS_CUE: 'ArrowLeft',
  NEXT_CUE: 'ArrowRight',
  DELETE_CUE: 'Delete',
  UNDO: 'Ctrl+Z',
  REDO: 'Ctrl+Shift+Z',
  SEARCH: 'Ctrl+F',
  NEW_CUE: 'Ctrl+K',
  EXPORT: 'Ctrl+E',
  SAVE: 'Ctrl+S',
} as const;

// Improvement #33: Cue quality grades map
export const CUE_QUALITY_GRADES: Record<string, { label: string; color: string; minScore: number }> = {
  A: { label: 'A - Excellent', color: '#22c55e', minScore: 0.9 },
  B: { label: 'B - Good', color: '#eab308', minScore: 0.75 },
  C: { label: 'C - Fair', color: '#f97316', minScore: 0.6 },
  D: { label: 'D - Poor', color: '#ef4444', minScore: 0.4 },
  F: { label: 'F - Fail', color: '#7c3aed', minScore: 0 },
};

// Improvement #34: Export format labels français
export const EXPORT_FORMAT_LABELS: Record<string, { label: string; description: string }> = {
  rekordbox: { label: 'Rekordbox XML', description: 'Pioneer Rekordbox format' },
  serato: { label: 'Serato CSV', description: 'Serato DJ format' },
  traktor: { label: 'Traktor NML', description: 'Native Instruments Traktor' },
  virtual_dj: { label: 'Virtual DJ XML', description: 'Virtual DJ format' },
  json: { label: 'JSON Export', description: 'Generic JSON format' },
};

// Improvement #35: Waveform styles config
export const WAVEFORM_STYLES: Record<string, { label: string; description: string }> = {
  bars: { label: 'Bars', description: 'Classic vertical bars' },
  lines: { label: 'Lines', description: 'Continuous line visualization' },
  mirror: { label: 'Mirror', description: 'Symmetrical top/bottom' },
  filled: { label: 'Filled', description: 'Solid waveform area' },
};

// Improvement #36: Zoom levels preset array
export const ZOOM_LEVELS = [0.25, 0.5, 1, 2, 4] as const;

// Improvement #37: Confidence thresholds
export const CONFIDENCE_THRESHOLDS = {
  LOW: 0.3,
  MEDIUM: 0.6,
  HIGH: 0.8,
} as const;

// Improvement #38: Pad bank config
export const PAD_BANK_CONFIG = {
  A: { label: 'Bank A', color: '#3b82f6' },
  B: { label: 'Bank B', color: '#8b5cf6' },
  C: { label: 'Bank C', color: '#ec4899' },
  D: { label: 'Bank D', color: '#f59e0b' },
} as const;

// Improvement #39: Section colors map
export const SECTION_COLORS: Record<string, string> = {
  intro: '#3b82f6',
  buildup: '#f59e0b',
  drop: '#ef4444',
  breakdown: '#8b5cf6',
  outro: '#06b6d4',
  vocal: '#22c55e',
  bridge: '#06b6d4',
  chorus: '#ec4899',
  verse: '#f97316',
};

// Improvement #40: DJ software colors map
export const DJ_SOFTWARE_COLORS: Record<string, string> = {
  rekordbox: '#000000',
  serato: '#00d4ff',
  traktor: '#ff6b00',
  virtual_dj: '#00adef',
  scratch: '#ff0080',
  pacemaker: '#1db954',
};

// Improvement #38: CUE_TYPE_ICONS map with lucide-react icon names per type
export const CUE_TYPE_ICONS: Record<string, string> = {
  hot_cue: 'Zap',
  loop: 'RotateCw',
  fade_in: 'Volume2',
  fade_out: 'VolumeX',
  drop: 'Zap',
  phrase: 'Music',
  section: 'MapPin',
  load: 'Flag',
};

// Improvement #39: CUE_TYPE_LABELS_FR map for French translations of cue types
export const CUE_TYPE_LABELS_FR: Record<string, string> = {
  hot_cue: 'Hot Cue',
  loop: 'Boucle',
  fade_in: 'Fondu entrant',
  fade_out: 'Fondu sortant',
  drop: 'Drop',
  phrase: 'Phrase',
  section: 'Section',
  load: 'Point de chargement',
};

// Improvement #40: BAR_COLORS map (different background for different bar ranges)
export const BAR_COLORS = {
  bass: '#ef4444',      // Red for bass (0-250Hz)
  mids: '#22c55e',      // Green for mids (250-4kHz)
  highs: '#3b82f6',     // Blue for highs (4kHz+)
  played: {
    bass: '#ef444488',
    mids: '#22c55e88',
    highs: '#3b82f688',
  },
  unplayed: {
    bass: '#ef444440',
    mids: '#22c55e40',
    highs: '#3b82f640',
  },
};

// Improvement #41: RESPONSIVE_BREAKPOINTS for mobile/tablet/desktop layouts
export const RESPONSIVE_BREAKPOINTS = {
  mobile: 320,
  tablet: 768,
  desktop: 1280,
  wide: 1600,
} as const;

// Improvement #42: CUE_GROUPING_OPTIONS for organizing cues by section type
export const CUE_GROUPING_OPTIONS = {
  none: { label: 'No Grouping', icon: '─' },
  byType: { label: 'By Type', icon: '▪' },
  bySection: { label: 'By Section', icon: '▦' },
  byTime: { label: 'By Time Range', icon: '⟳' },
} as const;

// Improvement #43: CUE_TEMPLATE_PRESETS for save-as-template feature
export const CUE_TEMPLATE_PRESETS: Record<string, { name: string; description: string; cueTypes: string[] }> = {
  progressive: { name: 'Progressive Mix', description: 'Intro, buildup, drop, breakdown, outro', cueTypes: ['section', 'phrase', 'drop', 'vocal'] },
  techno: { name: 'Techno Set', description: 'Beat drop, builds, rolls', cueTypes: ['drop', 'phrase', 'section'] },
  house: { name: 'House Music', description: 'Intro, drop, vocal zones', cueTypes: ['hot_cue', 'vocal', 'phrase'] },
  minimal: { name: 'Minimal Structure', description: 'Key entry points only', cueTypes: ['section', 'load'] },
};

// Improvement #44: LOOP_TEMPLATES for quick loop creation (bar counts)
export const LOOP_TEMPLATES = [1, 2, 4, 8, 16, 32] as const;

// Improvement #45: PRINT_STYLES for print-friendly CSS
export const PRINT_STYLES = `
  @media print {
    body { background: white; color: black; }
    .no-print { display: none !important; }
    .cue-list-item { page-break-inside: avoid; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  }
`;

// Improvement #46: ERROR_RECOVERY_MESSAGES for user-friendly error handling
export const ERROR_RECOVERY_MESSAGES: Record<string, string> = {
  timeout: 'Request timed out. Please check your connection and try again.',
  notFound: 'Track not found. It may have been deleted.',
  unauthorized: 'Session expired. Please log in again.',
  rateLimited: 'Too many requests. Please wait a moment before trying again.',
  serverError: 'Server error occurred. Please try again later.',
  networkError: 'Network error. Please check your internet connection.',
};

// Improvement #47: CUE_SUGGESTION_THRESHOLDS for AI cue recommendations
export const CUE_SUGGESTION_THRESHOLDS = {
  drop: { minEnergy: 0.6, confidence: 0.75 },
  vocal: { minEnergy: 0.4, confidence: 0.7 },
  build: { minEnergy: 0.3, confidence: 0.65 },
  beat: { minEnergy: 0.5, confidence: 0.8 },
} as const;

// Improvement #48: MIDI_CONTROLLER_MAPPINGS for external hardware integration
export const MIDI_CONTROLLER_MAPPINGS: Record<string, { cc: number; min: number; max: number; name: string }> = {
  hotCueA: { cc: 1, min: 0, max: 127, name: 'Hot Cue A' },
  hotCueB: { cc: 2, min: 0, max: 127, name: 'Hot Cue B' },
  loop: { cc: 3, min: 0, max: 127, name: 'Loop Trigger' },
  pitchFader: { cc: 4, min: 0, max: 127, name: 'Pitch Fader' },
};

// Improvement #49: UNDO_REDO_LIMITS for undo/redo stack management
export const UNDO_REDO_LIMITS = {
  maxStackSize: 50,
  groupActionsPeriod: 300, // ms: group actions within this period
  autoSavePeriod: 5000, // ms: auto-save to localStorage
} as const;

export const CAMELOT_WHEEL = [
  { n: "1A", key: "Am", color: "#4a9eff" },
  { n: "1B", key: "C", color: "#6ab4ff" },
  { n: "2A", key: "Em", color: "#4ecdc4" },
  { n: "2B", key: "G", color: "#6ee4da" },
  { n: "3A", key: "Bm", color: "#45b7d1" },
  { n: "3B", key: "D", color: "#63cddf" },
  { n: "4A", key: "F#m", color: "#96ceb4" },
  { n: "4B", key: "A", color: "#a8dcc5" },
  { n: "5A", key: "C#m", color: "#88d8a3" },
  { n: "5B", key: "E", color: "#9de8b5" },
  { n: "6A", key: "G#m", color: "#a8e6cf" },
  { n: "6B", key: "B", color: "#b8f0dd" },
  { n: "7A", key: "Ebm", color: "#ffd93d" },
  { n: "7B", key: "F#", color: "#ffe566" },
  { n: "8A", key: "Bbm", color: "#ffb347" },
  { n: "8B", key: "Db", color: "#ffc566" },
  { n: "9A", key: "Fm", color: "#ff8c69" },
  { n: "9B", key: "Ab", color: "#ffa085" },
  { n: "10A", key: "Cm", color: "#ff6b9d" },
  { n: "10B", key: "Eb", color: "#ff85b0" },
  { n: "11A", key: "Gm", color: "#c589e8" },
  { n: "11B", key: "Bb", color: "#d4a0f0" },
  { n: "12A", key: "Dm", color: "#a390f0" },
  { n: "12B", key: "F", color: "#b8a8f8" },
];

export function getKeyColor(camelotKey: string): string {
  return CAMELOT_WHEEL.find(c => c.n === camelotKey)?.color || "#64748b";
}

export function getCompatibleKeys(camelotKey: string): string[] {
  const num = parseInt(camelotKey);
  const mode = camelotKey.includes("A") ? "A" : "B";
  return [
    camelotKey,
    `${num === 12 ? 1 : num + 1}${mode}`,
    `${num === 1 ? 12 : num - 1}${mode}`,
    `${num}${mode === "A" ? "B" : "A"}`,
  ];
}

export function formatTimeMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor((ms % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(2, '0')}`;
}

export function toCamelot(camelotKey: string): string {
  return camelotKey;
}

export function isMixCompatible(key1: string, key2: string, bpmTolerance: number = 0.06): boolean {
  if (!key1 || !key2) return false;
  const compatibleKeys = getCompatibleKeys(key1);
  return compatibleKeys.includes(key2);
}

export function getCompatibilityScore(key1: string, key2: string, bpm1: number, bpm2: number, tolerance: number = 0.06): number {
  if (!isMixCompatible(key1, key2)) return 0;

  const bpmDiff = Math.abs(bpm1 - bpm2) / Math.max(bpm1, bpm2);
  if (bpmDiff > tolerance) return 0;

  const num1 = parseInt(key1);
  const num2 = parseInt(key2);
  const mode1 = key1.includes("A") ? "A" : "B";
  const mode2 = key2.includes("A") ? "A" : "B";

  if (key1 === key2) return 100;
  if (mode1 === mode2 && Math.abs(num1 - num2) === 1) return 90;
  if (mode1 !== mode2) return 85;

  return 70;
}
