'use client';
import { useState, useRef, useCallback } from 'react';
import { Upload, FolderSearch, Music, Loader2, CheckCircle2, AlertCircle, FileAudio } from 'lucide-react';
import { uploadTrack, analyzeTrack, pollTrackUntilDone, importRekordbox, importSerato, importTraktor } from '@/lib/api';

const DJ_SOFTWARE = [
  { name: "Rekordbox", icon: "🔴", desc: "Import XML", accept: ".xml", importFn: 'rekordbox' as const },
  { name: "Serato DJ", icon: "🟢", desc: "Import .crate", accept: ".crate", importFn: 'serato' as const },
  { name: "Traktor", icon: "🔵", desc: "Import NML", accept: ".nml", importFn: 'traktor' as const },
];

type UploadStatus = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error';

interface FileUploadState {
  file: File;
  status: UploadStatus;
  progress: string;
}

export default function UploadPage() {
  const [files, setFiles] = useState<FileUploadState[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const djInputRef = useRef<HTMLInputElement>(null);
  const [currentDjSoftware, setCurrentDjSoftware] = useState<string | null>(null);

  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    const audioFiles = Array.from(fileList).filter(f =>
      /\.(mp3|wav|flac|aac|ogg|m4a|aif|aiff)$/i.test(f.name)
    );
    if (audioFiles.length === 0) return;

    const newFiles: FileUploadState[] = audioFiles.map(f => ({
      file: f, status: 'idle' as UploadStatus, progress: 'En attente...',
    }));
    setFiles(prev => [...prev, ...newFiles]);

    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      const idx = files.length + i; // NOTE: uses closure, but we update via callback

      setFiles(prev => prev.map((f, j) =>
        f.file === file ? { ...f, status: 'uploading', progress: 'Upload en cours...' } : f
      ));

      try {
        const uploaded = await uploadTrack(file);
        setFiles(prev => prev.map(f =>
          f.file === file ? { ...f, status: 'analyzing', progress: 'Analyse audio...' } : f
        ));

        if (uploaded?.id) {
          await analyzeTrack(uploaded.id);
          await pollTrackUntilDone(uploaded.id);
        }

        setFiles(prev => prev.map(f =>
          f.file === file ? { ...f, status: 'done', progress: 'Terminé !' } : f
        ));
      } catch (e: any) {
        setFiles(prev => prev.map(f =>
          f.file === file ? { ...f, status: 'error', progress: e?.message || 'Erreur' } : f
        ));
      }
    }
  }, [files.length]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  async function handleDjImport(software: string) {
    setCurrentDjSoftware(software);
    djInputRef.current?.click();
  }

  async function handleDjFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !currentDjSoftware) return;

    setImporting(currentDjSoftware);
    setImportResult(null);

    try {
      let result;
      if (currentDjSoftware === 'rekordbox') result = await importRekordbox(file);
      else if (currentDjSoftware === 'serato') result = await importSerato(file);
      else if (currentDjSoftware === 'traktor') result = await importTraktor(file);
      else throw new Error('Unknown software');

      setImportResult(result!);
    } catch (e: any) {
      setImportResult({ imported: 0, skipped: 0, errors: [e?.message || 'Import échoué'] });
    } finally {
      setImporting(null);
      setCurrentDjSoftware(null);
      if (djInputRef.current) djInputRef.current.value = '';
    }
  }

  const statusIcon = (s: UploadStatus) => {
    if (s === 'uploading' || s === 'analyzing') return <Loader2 size={16} className="text-blue-400 animate-spin" />;
    if (s === 'done') return <CheckCircle2 size={16} className="text-emerald-400" />;
    if (s === 'error') return <AlertCircle size={16} className="text-red-400" />;
    return <FileAudio size={16} className="text-[var(--text-muted)]" />;
  };

  return (
    <div className="p-5 space-y-4">
      {/* Drag zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => audioInputRef.current?.click()}
        className={`bg-[var(--bg-card)] border-2 border-dashed rounded-[14px] p-12 flex flex-col items-center gap-4 transition-all cursor-pointer ${
          isDragOver
            ? 'border-blue-500 bg-blue-600/10 scale-[1.01]'
            : 'border-[var(--border-default)] hover:border-blue-500/50 hover:bg-blue-600/5'
        }`}
      >
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${
          isDragOver ? 'bg-blue-600/30' : 'bg-blue-600/15'
        }`}>
          <Upload size={28} className="text-blue-400" />
        </div>
        <div className="text-center">
          <div className="text-base font-semibold text-[var(--text-primary)]">
            {isDragOver ? 'Lâche les fichiers ici !' : 'Glisse tes fichiers audio ici'}
          </div>
          <div className="text-[13px] text-[var(--text-muted)] mt-1">MP3, WAV, FLAC, AIFF, AAC — Pas de limite de taille</div>
        </div>
        <button className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold cursor-pointer border-none hover:bg-blue-500 transition-colors">
          Parcourir les fichiers
        </button>
      </div>

      {/* Hidden inputs */}
      <input
        ref={audioInputRef}
        type="file"
        multiple
        accept=".mp3,.wav,.flac,.aac,.ogg,.m4a,.aif,.aiff"
        onChange={(e) => e.target.files && processFiles(e.target.files)}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        accept=".mp3,.wav,.flac,.aac,.ogg,.m4a,.aif,.aiff"
        // @ts-ignore — webkitdirectory is a non-standard attribute
        webkitdirectory=""
        onChange={(e) => e.target.files && processFiles(e.target.files)}
        className="hidden"
      />
      <input
        ref={djInputRef}
        type="file"
        accept=".xml,.nml,.crate"
        onChange={handleDjFileSelected}
        className="hidden"
      />

      {/* Upload progress */}
      {files.length > 0 && (
        <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] p-4 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-[var(--text-primary)]">
              Fichiers ({files.filter(f => f.status === 'done').length}/{files.length})
            </span>
            {files.every(f => f.status === 'done' || f.status === 'error') && (
              <button
                onClick={() => setFiles([])}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer bg-transparent border-none"
              >
                Effacer
              </button>
            )}
          </div>
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg-elevated)]">
              {statusIcon(f.status)}
              <span className="flex-1 text-[13px] text-[var(--text-primary)] truncate">{f.file.name}</span>
              <span className={`text-[11px] font-medium ${
                f.status === 'done' ? 'text-emerald-400' : f.status === 'error' ? 'text-red-400' : 'text-[var(--text-muted)]'
              }`}>{f.progress}</span>
            </div>
          ))}
        </div>
      )}

      {/* Import from DJ software */}
      <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <FolderSearch size={16} className="text-[var(--text-secondary)]" />
          <span className="text-sm font-bold text-[var(--text-primary)]">Importer depuis un logiciel DJ</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {DJ_SOFTWARE.map(sw => (
            <button
              key={sw.name}
              onClick={() => handleDjImport(sw.importFn)}
              disabled={importing !== null}
              className="flex flex-col items-center gap-2 p-5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] cursor-pointer hover:bg-[var(--bg-hover)] hover:border-[var(--border-default)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing === sw.importFn ? (
                <Loader2 size={28} className="text-blue-400 animate-spin" />
              ) : (
                <span className="text-3xl">{sw.icon}</span>
              )}
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">{sw.name}</span>
              <span className="text-[11px] text-[var(--text-muted)]">{sw.desc}</span>
            </button>
          ))}
        </div>

        {/* Import result */}
        {importResult && (
          <div className={`mt-4 p-3 rounded-lg border ${
            importResult.errors.length > 0
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-emerald-500/10 border-emerald-500/30'
          }`}>
            <div className="text-sm font-medium text-[var(--text-primary)]">
              {importResult.imported} tracks importés · {importResult.skipped} ignorés
            </div>
            {importResult.errors.length > 0 && (
              <div className="text-xs text-red-400 mt-1">
                {importResult.errors.slice(0, 3).join(', ')}
                {importResult.errors.length > 3 && ` +${importResult.errors.length - 3} erreurs`}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scan folder */}
      <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Music size={16} className="text-[var(--text-secondary)]" />
          <span className="text-sm font-bold text-[var(--text-primary)]">Scanner un dossier</span>
        </div>
        <p className="text-[13px] text-[var(--text-muted)] mb-3">Pointe vers un dossier contenant tes fichiers audio. CueForge analysera automatiquement tous les tracks trouvés.</p>
        <button
          onClick={() => folderInputRef.current?.click()}
          className="px-4 py-2 rounded-lg border border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] text-sm cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
        >
          Choisir un dossier
        </button>
      </div>
    </div>
  );
}
