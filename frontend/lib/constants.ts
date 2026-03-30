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
