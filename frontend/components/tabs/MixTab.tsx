'use client';
import { CAMELOT_WHEEL, getKeyColor, getCompatibleKeys } from '@/lib/constants';
import KeyBadge from '@/components/ui/KeyBadge';

interface Track {
  id: number;
  title: string;
  artist: string;
  bpm?: number | null;
  key?: string | null;
}

interface MixTabProps {
  selectedKey?: string | null;
  compatibleTracks?: Track[];
}

function CamelotWheel({ selectedKey }: { selectedKey?: string | null }) {
  const size = 200;
  const cx = size / 2, cy = size / 2;
  const outerR = 88, innerR = 55;
  const compatible = selectedKey ? getCompatibleKeys(selectedKey) : [];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {CAMELOT_WHEEL.map((item) => {
        const isOuter = item.n.includes("B");
        const num = parseInt(item.n);
        const r = isOuter ? outerR : innerR;
        const textR = isOuter ? 75 : 43;
        const angle = ((num - 1) / 12) * 2 * Math.PI - Math.PI / 2;
        const slice = (2 * Math.PI) / 12;
        const startAngle = angle - slice / 2;
        const endAngle = angle + slice / 2;
        const gap = 0.04;
        const x1 = cx + (r - 14) * Math.cos(startAngle + gap);
        const y1 = cy + (r - 14) * Math.sin(startAngle + gap);
        const x2 = cx + (r + 14) * Math.cos(startAngle + gap);
        const y2 = cy + (r + 14) * Math.sin(startAngle + gap);
        const x3 = cx + (r + 14) * Math.cos(endAngle - gap);
        const y3 = cy + (r + 14) * Math.sin(endAngle - gap);
        const x4 = cx + (r - 14) * Math.cos(endAngle - gap);
        const y4 = cy + (r - 14) * Math.sin(endAngle - gap);
        const isSelected = item.n === selectedKey;
        const isCompat = compatible.includes(item.n);
        const tx = cx + textR * Math.cos(angle);
        const ty = cy + textR * Math.sin(angle);

        return (
          <g key={item.n}>
            <path
              d={`M ${x1} ${y1} L ${x2} ${y2} A ${r + 14} ${r + 14} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${r - 14} ${r - 14} 0 0 0 ${x1} ${y1}`}
              fill={isSelected ? item.color : isCompat ? item.color + '70' : item.color + '30'}
              stroke={isSelected ? 'white' : isCompat ? item.color + '90' : 'transparent'}
              strokeWidth={isSelected ? 2 : 1}
              style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            />
            <text
              x={tx} y={ty}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={isSelected ? 9 : 8}
              fontWeight={isSelected ? 700 : 500}
              fill={isSelected || isCompat ? 'white' : 'rgba(255,255,255,0.5)'}
            >
              {item.n}
            </text>
          </g>
        );
      })}
      {/* Center */}
      <circle cx={cx} cy={cy} r={28} fill="var(--bg-elevated)" stroke="var(--border-default)" strokeWidth={1} />
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--text-primary)">Camelot</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize={12} fontWeight={700} fill={selectedKey ? getKeyColor(selectedKey) : 'var(--text-muted)'}>{selectedKey || '—'}</text>
    </svg>
  );
}

// Mock compatible tracks
const MOCK_COMPATIBLE: Track[] = [
  { id: 3, title: "Equinox", artist: "Solomun", bpm: 122, key: "3A" },
  { id: 5, title: "Dreamer", artist: "Tale Of Us", bpm: 120, key: "1A" },
  { id: 6, title: "Bangalore", artist: "Bicep", bpm: 128, key: "4B" },
  { id: 1, title: "Shed My Skin", artist: "Ben Böhmer", bpm: 124, key: "6A" },
];

export default function MixTab({ selectedKey, compatibleTracks }: MixTabProps) {
  const tracks = compatibleTracks || MOCK_COMPATIBLE;

  return (
    <div className="flex gap-5">
      {/* Camelot Wheel */}
      <div className="flex-shrink-0 flex flex-col items-center gap-2">
        <div className="text-xs font-semibold text-[var(--text-secondary)]">Roue de Camelot</div>
        <CamelotWheel selectedKey={selectedKey} />
      </div>
      {/* Compatible tracks */}
      <div className="flex-1">
        <div className="text-xs font-semibold text-[var(--text-secondary)] mb-2.5">
          Tracks compatibles{selectedKey ? ` avec ${selectedKey}` : ''}
        </div>
        {tracks.map(t => {
          const score = t.key === selectedKey ? 100 : Math.floor(Math.random() * 40 + 55);
          const scoreColor = score > 85 ? '#10b981' : score > 70 ? '#f59e0b' : '#ef4444';
          return (
            <div key={t.id} className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-[9px] mb-1 bg-[var(--bg-elevated)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors">
              <div className="w-1 h-[30px] rounded-sm" style={{ background: scoreColor }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[var(--text-primary)] truncate">{t.title}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{t.artist}</div>
              </div>
              {t.key && <KeyBadge camelotKey={t.key} />}
              {t.bpm && (
                <span className="inline-flex items-center px-[7px] py-[2px] rounded-[5px] text-[10px] font-bold font-mono bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                  {t.bpm}
                </span>
              )}
              <span className="text-[11px] font-bold font-mono" style={{ color: scoreColor }}>{score}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
