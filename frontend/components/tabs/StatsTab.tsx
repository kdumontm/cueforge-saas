'use client';

const STATS = [
  { label: "Total tracks", value: "8", icon: "🎵" },
  { label: "Analysés", value: "6", icon: "✅" },
  { label: "BPM moyen", value: "127", icon: "⚡" },
  { label: "Genres", value: "4", icon: "🎨" },
];

const BPM_DIST = [20, 35, 80, 100, 75, 45, 30];
const BPM_LABELS = ["115", "118", "122", "126", "130", "134", "138"];

export default function StatsTab() {
  return (
    <div>
      <div className="grid grid-cols-4 gap-2.5 mb-3.5">
        {STATS.map(s => (
          <div key={s.label} className="bg-[var(--bg-elevated)] rounded-[10px] p-3">
            <div className="text-lg">{s.icon}</div>
            <div className="text-xl font-extrabold text-[var(--text-primary)] font-mono">{s.value}</div>
            <div className="text-[10px] text-[var(--text-muted)]">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Distribution BPM</div>
      <div className="flex gap-[2px] h-10 items-end">
        {BPM_DIST.map((h, i) => (
          <div key={i} className="flex-1 rounded-t-[3px] bg-blue-600/50" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="flex justify-between mt-1">
        {BPM_LABELS.map(bpm => (
          <span key={bpm} className="text-[9px] text-[var(--text-muted)]">{bpm}</span>
        ))}
      </div>
    </div>
  );
}
