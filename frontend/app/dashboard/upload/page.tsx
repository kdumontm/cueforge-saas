'use client';
import { Upload, FolderSearch, Music } from 'lucide-react';

const DJ_SOFTWARE = [
  { name: "Rekordbox", icon: "🔴", desc: "Import XML" },
  { name: "Serato DJ", icon: "🟢", desc: "Import Base" },
  { name: "Traktor", icon: "🔵", desc: "Import NML" },
  { name: "Engine DJ", icon: "🟠", desc: "Import DB" },
];

export default function UploadPage() {
  return (
    <div className="p-5 space-y-4">
      {/* Drag zone */}
      <div className="bg-[var(--bg-card)] border-2 border-dashed border-[var(--border-default)] rounded-[14px] p-12 flex flex-col items-center gap-4 hover:border-blue-500/50 hover:bg-blue-600/5 transition-all cursor-pointer">
        <div className="w-16 h-16 rounded-2xl bg-blue-600/15 flex items-center justify-center">
          <Upload size={28} className="text-blue-400" />
        </div>
        <div className="text-center">
          <div className="text-base font-semibold text-[var(--text-primary)]">Glisse tes fichiers audio ici</div>
          <div className="text-[13px] text-[var(--text-muted)] mt-1">MP3, WAV, FLAC, AIFF, AAC — Pas de limite de taille</div>
        </div>
        <button className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold cursor-pointer border-none hover:bg-blue-500 transition-colors">
          Parcourir les fichiers
        </button>
      </div>

      {/* Import from DJ software */}
      <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <FolderSearch size={16} className="text-[var(--text-secondary)]" />
          <span className="text-sm font-bold text-[var(--text-primary)]">Importer depuis un logiciel DJ</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {DJ_SOFTWARE.map(sw => (
            <button
              key={sw.name}
              className="flex flex-col items-center gap-2 p-5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] cursor-pointer hover:bg-[var(--bg-hover)] hover:border-[var(--border-default)] transition-all"
            >
              <span className="text-3xl">{sw.icon}</span>
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">{sw.name}</span>
              <span className="text-[11px] text-[var(--text-muted)]">{sw.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scan folder */}
      <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Music size={16} className="text-[var(--text-secondary)]" />
          <span className="text-sm font-bold text-[var(--text-primary)]">Scanner un dossier</span>
        </div>
        <p className="text-[13px] text-[var(--text-muted)] mb-3">Pointe vers un dossier contenant tes fichiers audio. CueForge analysera automatiquement tous les tracks trouvés.</p>
        <button className="px-4 py-2 rounded-lg border border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] text-sm cursor-pointer hover:bg-[var(--bg-hover)] transition-colors">
          Choisir un dossier
        </button>
      </div>
    </div>
  );
}
