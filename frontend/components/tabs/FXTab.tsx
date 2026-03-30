'use client';

const EFFECTS = [
  { name: "Reverb", active: false }, { name: "Delay", active: true },
  { name: "Flanger", active: false }, { name: "Phaser", active: false },
  { name: "Filter", active: true }, { name: "Bitcrusher", active: false },
  { name: "Chorus", active: false }, { name: "Tremolo", active: false },
];

export default function FXTab() {
  return (
    <div>
      <div className="text-[13px] font-semibold text-[var(--text-primary)] mb-3">Effets Audio</div>
      <div className="grid grid-cols-4 gap-2">
        {EFFECTS.map(e => (
          <button
            key={e.name}
            className={`py-2.5 px-2 rounded-[9px] text-xs cursor-pointer transition-all ${
              e.active
                ? 'border border-purple-500/50 bg-purple-500/20 text-purple-400 font-semibold'
                : 'border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {e.name}
          </button>
        ))}
      </div>
    </div>
  );
}
