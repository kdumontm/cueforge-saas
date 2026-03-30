export const HOT_CUE_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

export const HOT_CUE_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

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
