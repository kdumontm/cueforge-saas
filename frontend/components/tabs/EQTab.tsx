'use client';

const BANDS = [
  { label: "LOW", freq: "32Hz-512Hz", val: 0 },
  { label: "MID", freq: "512Hz-8kHz", val: 2 },
  { label: "HIGH", freq: "8kHz-20kHz", val: -1 },
];

export default function EQTab() {
  return (
    <div className="flex gap-6 items-end justify-center py-4">
      {BANDS.map(b => (
        <div key={b.label} className="flex flex-col items-center gap-2 flex-1 max-w-[80px]">
          <span className="text-lg font-bold text-[var(--text-primary)] font-mono">
            {b.val > 0 ? '+' : ''}{b.val}
          </span>
          <div className="w-2 h-[120px] bg-[var(--bg-elevated)] rounded relative overflow-hidden">
            <div
              className="absolute left-0 right-0 rounded"
              style={{
                bottom: '50%',
                height: `${Math.abs(b.val) * 8}%`,
                background: b.val > 0 ? '#10b981' : '#ef4444',
              }}
            />
            <div className="absolute top-[49%] left-0 right-0 h-[2px] bg-[var(--border-strong)]" />
          </div>
          <span className="text-[13px] font-bold text-[var(--text-secondary)]">{b.label}</span>
          <span className="text-[9px] text-[var(--text-muted)]">{b.freq}</span>
        </div>
      ))}
    </div>
  );
}
