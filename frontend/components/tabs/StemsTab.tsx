'use client';
import { Zap } from 'lucide-react';

const STEMS = [
  { id: "vocals", label: "Voix", icon: "🎤", color: "#ec4899" },
  { id: "drums", label: "Drums", icon: "🥁", color: "#f97316" },
  { id: "bass", label: "Basse", icon: "🎸", color: "#22c55e" },
  { id: "melody", label: "Mélodie", icon: "🎹", color: "#3b82f6" },
];

export default function StemsTab() {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">Stem Separation</div>
          <div className="text-[11px] text-[var(--text-muted)]">Isoler ou muter chaque élément du track</div>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-semibold cursor-pointer border-none hover:bg-blue-500 transition-colors">
          <Zap size={12} /> Séparer les stems
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {STEMS.map(s => (
          <div key={s.id} className="rounded-[10px] p-[10px_14px]" style={{ border: `1px solid ${s.color}40`, background: s.color + '10' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-base">{s.icon}</span>
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">{s.label}</span>
              </div>
              <div className="flex gap-1">
                <button className="px-2 py-[2px] rounded-[5px] text-[10px] font-bold cursor-pointer border" style={{ borderColor: s.color + '50', background: s.color + '20', color: s.color }}>S</button>
                <button className="px-2 py-[2px] rounded-[5px] text-[10px] cursor-pointer border border-[var(--border-default)] bg-transparent text-[var(--text-muted)]">M</button>
              </div>
            </div>
            <div className="h-6 bg-[var(--bg-primary)] rounded-[5px] overflow-hidden">
              <svg width="100%" height="24" viewBox="0 0 100 24">
                {Array.from({ length: 50 }, (_, i) => {
                  const h = Math.abs(Math.sin(i * 0.5 + s.id.length)) * 18 + 3;
                  return <rect key={i} x={i * 2} y={(24 - h) / 2} width={1.5} height={h} fill={s.color + '80'} />;
                })}
              </svg>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
