'use client';
import { RefreshCw, Check } from 'lucide-react';

interface BeatgridTabProps {
  bpm?: number | null;
}

export default function BeatgridTab({ bpm }: BeatgridTabProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">Beatgrid Editor</div>
          <div className="text-[11px] text-[var(--text-muted)]">Corrige le grid manuellement pour un mix parfait</div>
        </div>
        <div className="flex gap-1.5">
          <button className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] text-[11px] cursor-pointer hover:bg-[var(--bg-hover)]">
            <RefreshCw size={11} /> Re-analyser
          </button>
          <button className="px-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] text-[11px] cursor-pointer hover:bg-[var(--bg-hover)]">÷2 BPM</button>
          <button className="px-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] text-[11px] cursor-pointer hover:bg-[var(--bg-hover)]">×2 BPM</button>
        </div>
      </div>
      {/* Waveform with beatgrid */}
      <div className="bg-[var(--bg-primary)] rounded-[9px] p-3 mb-3 relative h-20 overflow-hidden">
        {/* Simplified waveform bars */}
        <svg width="100%" height="56" viewBox="0 0 120 56" preserveAspectRatio="none" className="absolute inset-3">
          {Array.from({ length: 120 }, (_, i) => {
            const h = (Math.sin(i * 0.3) * 0.4 + 0.6) * 45;
            return <rect key={i} x={i} y={(56 - h) / 2} width={0.6} height={h} fill="#3b82f640" />;
          })}
        </svg>
        {/* Beat markers */}
        {Array.from({ length: 32 }, (_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0"
            style={{
              left: `${(i / 32) * 100}%`,
              width: i % 4 === 0 ? 2 : 1,
              background: i % 4 === 0 ? 'rgba(37,99,235,0.6)' : 'rgba(37,99,235,0.2)',
              cursor: 'pointer',
            }}
          >
            {i % 4 === 0 && (
              <div className="absolute top-[2px] left-[3px] text-[9px] text-blue-500 font-mono">
                {Math.floor(i / 4) + 1}
              </div>
            )}
          </div>
        ))}
      </div>
      {/* BPM controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-muted)]">BPM détecté:</span>
          <span className="text-lg font-bold text-[var(--text-primary)] font-mono">{bpm ?? '—'}</span>
        </div>
        <div className="flex gap-1">
          {['-0.5', '-0.1', '+0.1', '+0.5'].map(adj => (
            <button key={adj} className="px-2 py-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-[13px] cursor-pointer font-mono hover:bg-[var(--bg-hover)] transition-colors">
              {adj}
            </button>
          ))}
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[11px] font-semibold cursor-pointer hover:bg-emerald-500/30 transition-colors">
          <Check size={12} /> Confirmer le grid
        </button>
      </div>
    </div>
  );
}
