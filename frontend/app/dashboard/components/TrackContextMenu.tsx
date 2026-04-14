'use client';

import { RefreshCw, Download, Trash2, Copy, Zap } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { useLang } from '@/components/LangProvider';
import { isDesktopApp } from '@/lib/electron';

export interface TrackContextMenuProps {
  contextMenu: { trackId: number; x: number; y: number } | null;
  contextMenuRef: React.RefObject<HTMLDivElement>;
  playlists: any[];
  isDesktop: boolean;
  onAnalyze: (trackId: number) => void;
  onAnalyzePro: (trackId: number) => void;
  onEnrich: (trackId: number) => void;
  onExportRekordbox: (trackId: number) => void;
  onExportCSV: (trackId: number) => void;
  onExportTXT: (trackId: number) => void;
  onAddToPlaylist: (trackId: number, playlistId: number) => void;
  onDelete: (trackId: number) => void;
  onClose: () => void;
}

export default function TrackContextMenu({
  contextMenu,
  contextMenuRef,
  playlists,
  isDesktop,
  onAnalyze,
  onAnalyzePro,
  onEnrich,
  onExportRekordbox,
  onExportCSV,
  onExportTXT,
  onAddToPlaylist,
  onDelete,
  onClose,
}: TrackContextMenuProps) {
  const { lang } = useLang();

  if (!contextMenu) return null;

  return (
    <div
      ref={contextMenuRef}
      className="fixed z-50 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-lg overflow-hidden"
      style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
    >
      <button
        onClick={() => {
          onAnalyze(contextMenu.trackId);
          onClose();
        }}
        className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2"
      >
        <RefreshCw size={14} /> Analyze
      </button>

      {isDesktop && (
        <button
          onClick={() => {
            onAnalyzePro(contextMenu.trackId);
            onClose();
          }}
          className="w-full text-left px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-500/10 transition-colors flex items-center gap-2 font-medium"
        >
          <Zap size={14} /> Analyse Pro (Stems IA)
        </button>
      )}

      <button
        onClick={() => {
          onEnrich(contextMenu.trackId);
          onClose();
        }}
        className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2"
      >
        🔍 Enrichir les métadonnées
      </button>

      <button
        onClick={() => {
          onExportRekordbox(contextMenu.trackId);
          onClose();
        }}
        className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2"
      >
        <Download size={14} /> Export Rekordbox XML
      </button>

      <button
        onClick={() => {
          onExportCSV(contextMenu.trackId);
          onClose();
        }}
        className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2"
      >
        <Download size={14} /> Export CSV
      </button>

      <button
        onClick={() => {
          onExportTXT(contextMenu.trackId);
          onClose();
        }}
        className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2"
      >
        <Download size={14} /> Export TXT
      </button>

      {playlists.length > 0 && (
        <div className="border-t border-[var(--border-subtle)]">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase">Ajouter à playlist</div>
          {playlists.slice(0, 5).map(pl => (
            <button
              key={pl.id}
              onClick={() => {
                onAddToPlaylist(contextMenu.trackId, pl.id);
                onClose();
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2"
            >
              <Copy size={12} /> {pl.name}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => {
          onDelete(contextMenu.trackId);
          onClose();
        }}
        className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
      >
        <Trash2 size={14} /> Delete
      </button>
    </div>
  );
}
