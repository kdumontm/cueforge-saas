'use client';
import { HOT_CUE_COLORS, HOT_CUE_LABELS } from '@/lib/constants';

interface HotCue {
  slot: number;
  time: string;
  label: string;
}

interface HotCuesBarProps {
  hotCues: HotCue[];
}

export default function HotCuesBar({ hotCues }: HotCuesBarProps) {
  return (
    <div className="flex items-center gap-1.5 px-[18px] py-[6px] pb-3">
      <span className="text-[10px] text-[var(--text-muted)] font-mono mr-1">HOT CUES</span>
      {HOT_CUE_LABELS.map((label, i) => {
        const cue = hotCues.find(c => c.slot === i);
        return (
          <div key={i} className="flex-1 min-w-0">
            <button
              className="w-full rounded-[7px] text-[10px] font-bold cursor-pointer border-none transition-all overflow-hidden text-ellipsis whitespace-nowrap font-mono"
              style={{
                padding: '5px 4px',
                background: cue ? HOT_CUE_COLORS[i] : 'var(--bg-elevated)',
                color: cue ? 'white' : 'var(--text-muted)',
              }}
            >
              <div>{label}</div>
              {cue && <div className="text-[9px] opacity-85">{cue.time}</div>}
            </button>
          </div>
        );
      })}
    </div>
  );
}
