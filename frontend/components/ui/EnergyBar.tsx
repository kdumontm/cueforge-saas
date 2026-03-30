'use client';

interface EnergyBarProps {
  energy: number | null; // 0-100
  showValue?: boolean;
  width?: number;
}

export default function EnergyBar({ energy, showValue = false, width = 50 }: EnergyBarProps) {
  if (energy == null) return <span className="text-[var(--text-muted)]">—</span>;
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="h-[5px] rounded-full bg-[var(--bg-elevated)] overflow-hidden"
        style={{ width }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${energy}%`,
            background: 'linear-gradient(90deg, #22c55e, #eab308, #ef4444)',
          }}
        />
      </div>
      {showValue && (
        <span className="text-[10px] text-[var(--text-muted)] font-mono">{energy}</span>
      )}
    </div>
  );
}
