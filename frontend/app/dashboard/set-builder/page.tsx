'use client';
import { Plus, Wand2, Download } from 'lucide-react';
import KeyBadge from '@/components/ui/KeyBadge';

const SET_TRACKS = [
  { id: 5, title: "Dreamer", artist: "Tale Of Us", bpm: 120, key: "1A", duration: "9:10", energy: 58, color: "#06b6d4", startMin: 0 },
  { id: 3, title: "Equinox", artist: "Solomun", bpm: 122, key: "3A", duration: "7:30", energy: 65, color: "#3b82f6", startMin: 9 },
  { id: 1, title: "Shed My Skin", artist: "Ben Böhmer", bpm: 124, key: "6A", duration: "6:42", energy: 72, color: "#22c55e", startMin: 17 },
  { id: 6, title: "Bangalore", artist: "Bicep", bpm: 128, key: "4B", duration: "5:55", energy: 80, color: "#f97316", startMin: 24 },
  { id: 2, title: "Lost Highway", artist: "Stephan Bodzin", bpm: 134, key: "10B", duration: "8:15", energy: 88, color: "#ef4444", startMin: 30 },
  { id: 4, title: "Disco Volante", artist: "ANNA", bpm: 136, key: "8A", duration: "7:05", energy: 91, color: "#ef4444", startMin: 38 },
];

export default function SetBuilderPage() {
  const totalMin = 45;

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Mon Set — Berghain 2024</h2>
          <p className="text-[11px] text-[var(--text-muted)]">{SET_TRACKS.length} tracks · ~{totalMin} min · 120→136 BPM</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] text-xs cursor-pointer hover:bg-[var(--bg-hover)]">
            <Download size={13} /> Exporter tracklist
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold cursor-pointer border-none hover:bg-purple-500">
            <Wand2 size={13} /> Suggérer suivant
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer border-none hover:bg-blue-500">
            <Plus size={13} /> Ajouter track
          </button>
        </div>
      </div>

      {/* Energy curve */}
      <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] p-4">
        <div className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Courbe d'énergie</div>
        <svg width="100%" height="80" viewBox="0 0 600 80" preserveAspectRatio="none">
          <defs>
            <linearGradient id="energyGrad" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="40%" stopColor="#22c55e" />
              <stop offset="70%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
          {/* Energy area */}
          <path
            d={`M 0 ${80 - (58 / 100) * 70} ${SET_TRACKS.map((t, i) => `L ${(t.startMin / totalMin) * 600} ${80 - (t.energy / 100) * 70}`).join(' ')} L 600 ${80 - (91 / 100) * 70} L 600 80 L 0 80 Z`}
            fill="url(#energyGrad)"
            opacity={0.3}
          />
          {/* Energy line */}
          <polyline
            points={SET_TRACKS.map(t => `${(t.startMin / totalMin) * 600},${80 - (t.energy / 100) * 70}`).join(' ')}
            fill="none"
            stroke="url(#energyGrad)"
            strokeWidth={2.5}
          />
          {/* Dots */}
          {SET_TRACKS.map((t, i) => (
            <circle key={i} cx={(t.startMin / totalMin) * 600} cy={80 - (t.energy / 100) * 70} r={4} fill={t.color} stroke="white" strokeWidth={1.5} />
          ))}
        </svg>
      </div>

      {/* Timeline */}
      <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border-subtle)]">
          <span className="text-sm font-bold text-[var(--text-primary)]">Timeline</span>
        </div>
        {SET_TRACKS.map((t, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer">
            {/* Position */}
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: t.color }}>
              {i + 1}
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{t.title}</div>
              <div className="text-[11px] text-[var(--text-muted)]">{t.artist}</div>
            </div>
            {/* BPM */}
            <span className="text-xs font-semibold text-[var(--text-primary)] font-mono">{t.bpm}</span>
            {/* Key */}
            <KeyBadge camelotKey={t.key} />
            {/* Energy */}
            <div className="flex items-center gap-1.5">
              <div className="w-9 h-1 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${t.energy}%`, background: `linear-gradient(90deg, #22c55e, #eab308, #ef4444)` }} />
              </div>
              <span className="text-[10px] text-[var(--text-muted)] font-mono">{t.energy}</span>
            </div>
            {/* Time in set */}
            <span className="text-[11px] text-[var(--text-muted)] font-mono w-12 text-right">{t.startMin}:00</span>
            {/* Transition indicator */}
            {i < SET_TRACKS.length - 1 && (
              <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-elevated)] px-2 py-[2px] rounded">blend</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
