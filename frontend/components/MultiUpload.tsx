'use client';

import React, { useState, useRef } from 'react';
import { uploadTracksWithProgress } from '@/lib/api';
import type { TrackUploadResponse } from '@/lib/api';
import { useElectron } from '@/lib/electron';
import { Upload, CheckCircle, AlertCircle, X, Loader2 } from 'lucide-react';

interface FileProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

interface MultiUploadProps {
  onSuccess?: (tracks: TrackUploadResponse[]) => void;
  onError?: (error: string) => void;
}

const ALLOWED_FORMATS = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/aiff', 'audio/ogg', 'audio/x-m4a'];
const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.flac', '.aiff', '.ogg', '.m4a'];

export default function MultiUpload({ onSuccess, onError }: MultiUploadProps) {
  const { isDesktop, files: desktopFiles } = useElectron();
  const [files, setFiles] = useState<FileProgress[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [globalProgress, setGlobalProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDesktopFileSelect = async () => {
    if (!desktopFiles?.openDialog) return;
    try {
      const paths: string[] = await desktopFiles.openDialog({
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'aiff', 'ogg', 'm4a'] }],
        multiple: true,
      });
      if (!paths || paths.length === 0) return;
      const newFiles: FileProgress[] = [];
      for (const filePath of paths) {
        const name = filePath.split(/[\\/]/).pop() || filePath;
        if (!files.some(f => f.file.name === name)) {
          const buffer = await desktopFiles.readBuffer(filePath);
          const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
          const mimeMap: Record<string, string> = {
            '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac',
            '.aiff': 'audio/aiff', '.ogg': 'audio/ogg', '.m4a': 'audio/x-m4a',
          };
          const blob = new Blob([buffer], { type: mimeMap[ext] || 'audio/mpeg' });
          const file = new File([blob], name, { type: blob.type });
          (file as any).__localPath = filePath;
          newFiles.push({ file, progress: 0, status: 'pending' });
        }
      }
      setFiles(prev => [...prev, ...newFiles]);
    } catch (err) {
      onError?.('Erreur lors de la sélection des fichiers');
    }
  };

  const isValidFile = (file: File): boolean => {
    const fileExt = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    return ALLOWED_FORMATS.includes(file.type) || ALLOWED_EXTENSIONS.includes(fileExt);
  };

  const handleFileSelect = (selectedFiles: FileList) => {
    const newFiles: FileProgress[] = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (!isValidFile(file)) continue;
      if (!files.some(f => f.file.name === file.name)) {
        newFiles.push({ file, progress: 0, status: 'pending' });
      }
    }
    setFiles(prev => [...prev, ...newFiles]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    const pending = files.filter(f => f.status === 'pending' || f.status === 'error');
    if (pending.length === 0) return;
    setIsUploading(true);
    setGlobalProgress(0);

    const formData = new FormData();
    pending.forEach(fp => formData.append('files', fp.file));
    const pendingNames = new Set(pending.map(f => f.file.name));

    setFiles(prev => prev.map(f => pendingNames.has(f.file.name) ? { ...f, status: 'uploading' as const, progress: 0 } : f));

    try {
      const tracks = await uploadTracksWithProgress(formData, (pct) => {
        setGlobalProgress(pct);
        setFiles(prev => prev.map(f =>
          pendingNames.has(f.file.name) && f.status === 'uploading'
            ? { ...f, progress: pct }
            : f
        ));
      });
      const uploadedNames = new Set(tracks.map(t => t.original_filename));
      setFiles(prev => prev.map(f =>
        pendingNames.has(f.file.name)
          ? { ...f, status: uploadedNames.has(f.file.name) ? 'completed' as const : 'error' as const, progress: 100 }
          : f
      ));
      setGlobalProgress(100);
      if (onSuccess) onSuccess(tracks);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Upload failed';
      setFiles(prev => prev.map(f =>
        pendingNames.has(f.file.name) ? { ...f, status: 'error' as const, error: msg } : f
      ));
      if (onError) onError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (index: number) => setFiles(prev => prev.filter((_, i) => i !== index));
  const completedCount = files.filter(f => f.status === 'completed').length;
  const pendingCount = files.filter(f => f.status === 'pending' || f.status === 'error').length;
  const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
          isDragging
            ? 'border-blue-500 bg-blue-500/10 scale-[1.01]'
            : 'border-[var(--border-default)] bg-[var(--bg-secondary)] hover:border-[var(--border-hover)]'
        }`}
      >
        <Upload size={32} className="mx-auto mb-3 text-[var(--text-muted)] opacity-60" />
        <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
          Glisse tes fichiers audio ici
        </p>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          MP3, WAV, FLAC, AIFF, OGG, M4A
        </p>
        <div className="flex gap-2 justify-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 text-xs font-semibold rounded-lg text-white transition-all cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
          >
            Parcourir
          </button>
          {isDesktop && desktopFiles && (
            <button
              type="button"
              onClick={handleDesktopFileSelect}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-white bg-purple-600 hover:bg-purple-700 transition-all cursor-pointer"
            >
              Importer depuis l'ordinateur
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_EXTENSIONS.join(',')}
          onChange={(e) => handleFileSelect(e.currentTarget.files || new FileList())}
          className="hidden"
        />
      </div>

      {/* File list + progress */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {files.length} fichier{files.length > 1 ? 's' : ''}
              <span className="text-[var(--text-muted)] font-normal ml-2">
                ({(totalSize / 1024 / 1024).toFixed(1)} MB)
              </span>
            </h3>
            {completedCount > 0 && (
              <span className="text-xs text-green-400 font-semibold">{completedCount} terminé{completedCount > 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Global progress bar */}
          {isUploading && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span className="flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin text-blue-400" />
                  Upload en cours...
                </span>
                <span className="font-mono text-blue-400">{globalProgress}%</span>
              </div>
              <div className="w-full h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${globalProgress}%`,
                    background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                    boxShadow: '0 0 8px rgba(59,130,246,0.4)',
                  }}
                />
              </div>
            </div>
          )}

          {/* File items */}
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {files.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border transition-all"
                style={{
                  background: item.status === 'completed' ? 'rgba(34,197,94,0.05)' : item.status === 'error' ? 'rgba(239,68,68,0.05)' : 'var(--bg-secondary)',
                  borderColor: item.status === 'completed' ? 'rgba(34,197,94,0.2)' : item.status === 'error' ? 'rgba(239,68,68,0.2)' : 'var(--border-subtle)',
                }}
              >
                {/* Status icon */}
                <div className="flex-shrink-0">
                  {item.status === 'completed' && <CheckCircle size={16} className="text-green-400" />}
                  {item.status === 'error' && <AlertCircle size={16} className="text-red-400" />}
                  {item.status === 'uploading' && <Loader2 size={16} className="animate-spin text-blue-400" />}
                  {item.status === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-[var(--border-default)]" />}
                </div>

                {/* File info + individual progress */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[var(--text-primary)] truncate">{item.file.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {(item.file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    {item.status === 'uploading' && (
                      <div className="flex-1 h-1 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${item.progress}%`, background: '#3b82f6' }}
                        />
                      </div>
                    )}
                    {item.status === 'error' && (
                      <span className="text-[10px] text-red-400">{item.error}</span>
                    )}
                  </div>
                </div>

                {/* Remove */}
                {item.status !== 'uploading' && (
                  <button
                    onClick={() => removeFile(index)}
                    className="flex-shrink-0 p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Upload button */}
          {pendingCount > 0 && (
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg text-white transition-all cursor-pointer disabled:opacity-50"
              style={{
                background: isUploading ? '#6b7280' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
                boxShadow: isUploading ? 'none' : '0 4px 12px rgba(59,130,246,0.3)',
              }}
            >
              {isUploading ? `Upload en cours… ${globalProgress}%` : `Uploader ${pendingCount} fichier${pendingCount > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
