'use client';
import { Download, FileText, Music, Database, Tag, Disc3, FileJson, FileSpreadsheet } from 'lucide-react';

const EXPORT_FORMATS = [
  { name: "Engine DJ", desc: "Export pour Denon DJ", icon: Disc3, color: "#f97316" },
  { name: "Rekordbox XML", desc: "Collection Rekordbox", icon: Database, color: "#ef4444" },
  { name: "Playlist M3U", desc: "Playlist universelle", icon: Music, color: "#22c55e" },
  { name: "Tags ID3", desc: "Écrire BPM/Key dans les fichiers", icon: Tag, color: "#3b82f6" },
  { name: "Tracklist TXT", desc: "Liste de tracks texte", icon: FileText, color: "#8b5cf6" },
  { name: "Tracklist PDF", desc: "Tracklist formatée", icon: FileText, color: "#ec4899" },
  { name: "JSON Export", desc: "Données brutes JSON", icon: FileJson, color: "#06b6d4" },
  { name: "CSV Export", desc: "Tableur CSV", icon: FileSpreadsheet, color: "#eab308" },
];

export default function ExportPage() {
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Download size={18} className="text-[var(--text-secondary)]" />
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Exporter</h2>
      </div>
      <p className="text-[13px] text-[var(--text-muted)]">Exporte ta bibliothèque ou tes playlists vers ton logiciel DJ préféré</p>

      <div className="grid grid-cols-4 gap-3">
        {EXPORT_FORMATS.map(fmt => {
          const Icon = fmt.icon;
          return (
            <button
              key={fmt.name}
              className="flex flex-col items-center gap-3 p-6 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] cursor-pointer hover:bg-[var(--bg-hover)] hover:border-[var(--border-default)] transition-all text-center"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: fmt.color + '20', border: `1px solid ${fmt.color}40` }}
              >
                <Icon size={22} style={{ color: fmt.color }} />
              </div>
              <div>
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">{fmt.name}</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{fmt.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
