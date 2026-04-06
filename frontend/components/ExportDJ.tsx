'use client';

import React, { useState } from 'react';
import { useElectron } from '@/lib/electron';
import { Download, Disc3, Music2, Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface ExportDJProps {
  /** Tracks à exporter — doit contenir id, title, artist, bpm, key, cue_points, file_path */
  tracks: any[];
  /** Variante d'affichage */
  variant?: 'button' | 'menu-item';
}

type ExportStatus = 'idle' | 'exporting' | 'success' | 'error';

/**
 * Composant d'export DJ — visible uniquement sur desktop.
 * Génère les fichiers Rekordbox XML et/ou Serato .crate via le bridge Electron.
 */
export default function ExportDJ({ tracks, variant = 'button' }: ExportDJProps) {
  const { isDesktop, export: localExport, files } = useElectron();
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [lastFormat, setLastFormat] = useState<string>('');

  // Ne rien rendre sur le web
  if (!isDesktop || !localExport) return null;

  const handleExport = async (format: 'rekordbox' | 'serato') => {
    if (!files || tracks.length === 0) return;
    setStatus('exporting');
    setLastFormat(format === 'rekordbox' ? 'Rekordbox' : 'Serato');

    try {
      if (format === 'rekordbox') {
        await localExport.rekordbox(tracks);
      } else {
        await localExport.serato(tracks);
      }
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      console.error(`Export ${format} failed:`, err);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  // ── Variante menu-item (pour le context menu de TrackRow) ─────────────────
  if (variant === 'menu-item') {
    return (
      <>
        <button
          onClick={() => handleExport('rekordbox')}
          disabled={status === 'exporting'}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors bg-transparent border-none cursor-pointer text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Disc3 size={13} />
          Exporter Rekordbox
        </button>
        <button
          onClick={() => handleExport('serato')}
          disabled={status === 'exporting'}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors bg-transparent border-none cursor-pointer text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Music2 size={13} />
          Exporter Serato
        </button>
      </>
    );
  }

  // ── Variante button (toolbar / barre d'actions) ───────────────────────────
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleExport('rekordbox')}
        disabled={status === 'exporting' || tracks.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
          bg-orange-500/10 text-orange-400 border border-orange-500/30
          hover:bg-orange-500/20 disabled:opacity-50 transition-colors"
      >
        {status === 'exporting' && lastFormat === 'Rekordbox' ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Disc3 size={13} />
        )}
        Rekordbox
      </button>

      <button
        onClick={() => handleExport('serato')}
        disabled={status === 'exporting' || tracks.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
          bg-blue-500/10 text-blue-400 border border-blue-500/30
          hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
      >
        {status === 'exporting' && lastFormat === 'Serato' ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Music2 size={13} />
        )}
        Serato
      </button>

      {/* Feedback status */}
      {status === 'success' && (
        <span className="flex items-center gap-1 text-xs text-green-400 animate-pulse">
          <CheckCircle2 size={13} /> Exporté !
        </span>
      )}
      {status === 'error' && (
        <span className="flex items-center gap-1 text-xs text-red-400">
          <XCircle size={13} /> Erreur d'export
        </span>
      )}
    </div>
  );
}
