'use client';

const MOCK_HISTORY = [
  { title: "Disco Volante", artist: "ANNA", bpm: 136, minutesAgo: 8 },
  { title: "Lost Highway", artist: "Stephan Bodzin", bpm: 134, minutesAgo: 16 },
  { title: "Bangalore", artist: "Bicep", bpm: 128, minutesAgo: 24 },
  { title: "Shed My Skin", artist: "Ben Böhmer", bpm: 124, minutesAgo: 32 },
  { title: "Equinox", artist: "Solomun", bpm: 122, minutesAgo: 40 },
];

export default function HistoryTab() {
  return (
    <div>
      <div className="text-[13px] font-semibold text-[var(--text-primary)] mb-2.5">Historique de lecture</div>
      {MOCK_HISTORY.map((t, i) => (
        <div key={i} className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-[9px] mb-1 bg-[var(--bg-elevated)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors">
          <span className="text-[10px] text-[var(--text-muted)] w-4 text-right font-mono">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[var(--text-primary)] truncate">{t.title}</div>
            <div className="text-[10px] text-[var(--text-muted)]">{t.artist} · Il y a {t.minutesAgo} min</div>
          </div>
          <span className="inline-flex items-center px-[7px] py-[2px] rounded-[5px] text-[10px] font-bold font-mono bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
            {t.bpm}
          </span>
        </div>
      ))}
    </div>
  );
}
