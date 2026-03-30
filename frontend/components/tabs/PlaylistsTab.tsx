'use client';
import { Plus, Disc3 } from 'lucide-react';

const MOCK_PLAYLISTS = [
  { id: "playlist1", label: "Set Berghain 2024", count: 12 },
  { id: "playlist2", label: "Outdoor Summer", count: 8 },
];

export default function PlaylistsTab() {
  return (
    <div>
      <div className="flex justify-between mb-3">
        <div className="text-[13px] font-semibold text-[var(--text-primary)]">Mes Playlists</div>
        <button className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-semibold cursor-pointer border-none hover:bg-blue-500 transition-colors">
          <Plus size={11} /> Nouvelle playlist
        </button>
      </div>
      {MOCK_PLAYLISTS.map(p => (
        <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-[9px] bg-[var(--bg-elevated)] mb-1.5 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors">
          <Disc3 size={20} className="text-[var(--text-muted)]" />
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-[var(--text-primary)]">{p.label}</div>
            <div className="text-[11px] text-[var(--text-muted)]">{p.count} tracks</div>
          </div>
          <button className="px-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] text-[11px] cursor-pointer hover:bg-[var(--bg-hover)]">
            Ouvrir
          </button>
        </div>
      ))}
    </div>
  );
}
