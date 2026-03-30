'use client';
import { Wand2, Plus, Pencil } from 'lucide-react';
import { HOT_CUE_COLORS, HOT_CUE_LABELS } from '@/lib/constants';

interface HotCue {
  slot: number;
  time: string;
  label: string;
}

// Mock data — will come from API
const MOCK_CUES: HotCue[] = [
  { slot: 0, time: "0:32", label: "Intro" },
  { slot: 2, time: "1:45", label: "Drop" },
  { slot: 4, time: "4:10", label: "Break" },
  { slot: 6, time: "5:55", label: "Outro" },
];

export default function CuesTab({ trackTitle }: { trackTitle?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-semibold text-[var(--text-primary)]">
          Hot Cues{trackTitle ? ` — ${trackTitle}` : ''}
        </div>
        <div className="flex gap-1.5">
          <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] text-[11px] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors">
            <Wand2 size={11} /> Auto-détecter
          </button>
          <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-semibold cursor-pointer border-none hover:bg-blue-500 transition-colors">
            <Plus size={11} /> Ajouter cue
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {HOT_CUE_LABELS.map((label, i) => {
          const cue = MOCK_CUES.find(c => c.slot === i);
          return (
            <div
              key={i}
              className="flex items-center gap-2.5 px-3 py-2 rounded-[9px]"
              style={{
                border: `1px solid ${cue ? HOT_CUE_COLORS[i] + '50' : 'var(--border-subtle)'}`,
                background: cue ? HOT_CUE_COLORS[i] + '10' : 'var(--bg-elevated)',
              }}
            >
              <div
                className="w-[26px] h-[26px] rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                style={{
                  background: cue ? HOT_CUE_COLORS[i] : 'var(--bg-primary)',
                  border: `1px solid ${cue ? HOT_CUE_COLORS[i] : 'var(--border-default)'}`,
                  color: cue ? 'white' : 'var(--text-muted)',
                }}
              >
                {label}
              </div>
              {cue ? (
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-[var(--text-primary)] font-mono">{cue.time}</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">{cue.label}</div>
                </div>
              ) : (
                <div className="text-[11px] text-[var(--text-muted)]">Vide — Cliquer pour poser</div>
              )}
              {cue && (
                <button className="bg-transparent border-none cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5">
                  <Pencil size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
