'use client';
import { useState, useEffect } from 'react';
import { Download, FileText, Music, Database, Tag, Disc3, FileJson, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  exportAllRekordbox, exportBatchRekordbox, exportPlaylistM3U,
  listTracks, listPlaylists, downloadBlob,
  type Playlist,
} from '@/lib/api';
import type { Track } from '@/types';

type ExportStatus = 'idle' | 'exporting' | 'done' | 'error';

export default function ExportPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [status, setStatus] = useState<Record<string, ExportStatus>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTracks().then(data => {
      const list = Array.isArray(data) ? data : (data?.tracks || []);
      setTracks(list);
    }).catch(() => {});
    listPlaylists().then(setPlaylists).catch(() => {});
  }, []);

  function setFormatStatus(name: string, s: ExportStatus) {
    setStatus(prev => ({ ...prev, [name]: s }));
  }

  async function handleExport(format: string) {
    setError(null);
    setFormatStatus(format, 'exporting');

    try {
      switch (format) {
        case 'rekordbox': {
          const blob = await exportAllRekordbox();
          downloadBlob(blob, 'CueForge_Library.xml');
          break;
        }
        case 'm3u': {
          if (playlists.length === 0) {
            throw new Error('Aucune playlist à exporter. Crée d\'abord une playlist.');
          }
          // Export first playlist as demo
          const blob = await exportPlaylistM3U(playlists[0].id);
          downloadBlob(blob, `${playlists[0].name}.m3u`);
          break;
        }
        case 'id3': {
          // Write ID3 tags to all tracks
          const { fixTags } = await import('@/lib/api');
          let count = 0;
          for (const track of tracks.slice(0, 50)) {
            try { await fixTags(track.id); count++; } catch {}
          }
          setError(`Tags ID3 écrits pour ${count} tracks`);
          break;
        }
        case 'tracklist_txt': {
          const lines = tracks.map((t, i) =>
            `${i + 1}. ${t.artist || 'Unknown'} - ${t.title || t.original_filename}`
          );
          const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
          downloadBlob(blob, 'CueForge_Tracklist.txt');
          break;
        }
        case 'json': {
          const data = tracks.map(t => ({
            id: t.id, title: t.title, artist: t.artist, genre: t.genre,
            bpm: t.analysis?.bpm, key: t.analysis?.key, energy: t.analysis?.energy,
            duration_ms: t.analysis?.duration_ms, rating: t.rating, tags: t.tags,
          }));
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          downloadBlob(blob, 'CueForge_Export.json');
          break;
        }
        case 'csv': {
          const headers = ['Title', 'Artist', 'Genre', 'BPM', 'Key', 'Energy', 'Duration', 'Rating', 'Tags'];
          const rows = tracks.map(t => [
            t.title || '', t.artist || '', t.genre || '',
            t.analysis?.bpm?.toFixed(1) || '', t.analysis?.key || '',
            t.analysis?.energy ? Math.round(t.analysis.energy * 100).toString() : '',
            t.analysis?.duration_ms ? Math.round(t.analysis.duration_ms / 1000).toString() : '',
            (t.rating || '').toString(), t.tags || '',
          ].map(v => `"${v.replace(/"/g, '""')}"`).join(','));
          const csv = [headers.join(','), ...rows].join('\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          downloadBlob(blob, 'CueForge_Export.csv');
          break;
        }
        default:
          throw new Error('Format non supporté');
      }
      setFormatStatus(format, 'done');
      setTimeout(() => setFormatStatus(format, 'idle'), 3000);
    } catch (e: any) {
      setFormatStatus(format, 'error');
      setError(e?.message || 'Export échoué');
      setTimeout(() => setFormatStatus(format, 'idle'), 3000);
    }
  }

  const EXPORT_FORMATS = [
    { key: 'rekordbox', name: "Rekordbox XML", desc: "Collection Rekordbox", icon: Database, color: "#ef4444" },
    { key: 'm3u', name: "Playlist M3U", desc: "Playlist universelle", icon: Music, color: "#22c55e" },
    { key: 'id3', name: "Tags ID3", desc: "Écrire BPM/Key dans les fichiers", icon: Tag, color: "#3b82f6" },
    { key: 'tracklist_txt', name: "Tracklist TXT", desc: "Liste de tracks texte", icon: FileText, color: "#8b5cf6" },
    { key: 'json', name: "JSON Export", desc: "Données brutes JSON", icon: FileJson, color: "#06b6d4" },
    { key: 'csv', name: "CSV Export", desc: "Tableur CSV", icon: FileSpreadsheet, color: "#eab308" },
  ];

  const formatStatus = (key: string) => status[key] || 'idle';

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Download size={18} className="text-[var(--text-secondary)]" />
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Exporter</h2>
        <span className="text-[13px] text-[var(--text-muted)] ml-2">
          {tracks.length} track{tracks.length !== 1 ? 's' : ''} dans ta bibliothèque
        </span>
      </div>
      <p className="text-[13px] text-[var(--text-muted)]">Exporte ta bibliothèque ou tes playlists vers ton logiciel DJ préféré</p>

      {error && (
        <div className="px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-sm text-blue-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {EXPORT_FORMATS.map(fmt => {
          const Icon = fmt.icon;
          const st = formatStatus(fmt.key);
          return (
            <button
              key={fmt.key}
              onClick={() => handleExport(fmt.key)}
              disabled={st === 'exporting' || tracks.length === 0}
              className="flex flex-col items-center gap-3 p-6 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] cursor-pointer hover:bg-[var(--bg-hover)] hover:border-[var(--border-default)] transition-all text-center disabled:opacity-40 disabled:cursor-not-allowed group"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                style={{ background: fmt.color + '20', border: `1px solid ${fmt.color}40` }}
              >
                {st === 'exporting' ? (
                  <Loader2 size={22} className="animate-spin" style={{ color: fmt.color }} />
                ) : st === 'done' ? (
                  <CheckCircle2 size={22} className="text-emerald-400" />
                ) : st === 'error' ? (
                  <AlertCircle size={22} className="text-red-400" />
                ) : (
                  <Icon size={22} style={{ color: fmt.color }} />
                )}
              </div>
              <div>
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">{fmt.name}</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{fmt.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {tracks.length === 0 && (
        <div className="text-center py-8 text-[var(--text-muted)] text-sm">
          Importe des tracks d'abord pour pouvoir exporter.
        </div>
      )}
    </div>
  );
}
