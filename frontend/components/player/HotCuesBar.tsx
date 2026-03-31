'use client';
import { HOT_CUE_COLORS, HOT_CUE_LABELS } from '@/lib/constants';

interface HotCue {
  slot: number;
  time: string;
  label: string;
  positionMs?: number;
  cueType?: string;
  endPositionMs?: number | null;
}

interface HotCuesBarProps {
  hotCues: HotCue[];
  onCueClick?: (cue: HotCue) => void;
}

export default function HotCuesBar({ hotCues, onCueClick }: HotCuesBarProps) {
  return (
    <div className="flex items-center gap-1.5 px-[18px] py-[6px] pb-3">
      <span className="text-[10px] text-[var(--text-muted)] font-mono mr-1">HOT CUES</span>
      {HOT_CUE_LABELS.map((label, i) => {
        const cue = hotCues.find(c => c.slot === i);
        const isLoop = cue?.cueType === 'loop';
        return (
          <div key={i} className="flex-1 min-w-0">
            <button
              onClick={() => cue && onCueClick?.(cue)}
              disabled={!cue}
              className="w-full rounded-[7px] text-[10px] font-bold border-none transition-all overflow-hidden text-ellipsis whitespace-nowrap font-mono disabled:cursor-default"
              style={{
                padding: '5px 4px',
                background: cue ? HOT_CUE_COLORS[i] : 'var(--bg-elevated)',
                color: cue ? 'white' : 'var(--text-muted)',
                cursor: cue ? 'pointer' : 'default',
                opacity: cue ? 1 : 0.5,
              }}
              title={cue ? `${isLoop ? '🔁 Loop' : '🎯 Cue'} ${cue.label} @ ${cue.time}` : `Slot ${label} vide`}
            >
              <div className="flex items-center justify-center gap-0.5">
                {isLoop && <span className="text-[8px]">🔁</span>}
                <span>{label}</span>
              </div>
              {cue && <div className="text-[9px] opacity-85">{cue.time}</div>}
            </button>
          </div>
        );
      })}
    </div>
  );
}
