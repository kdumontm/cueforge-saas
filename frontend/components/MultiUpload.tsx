'use client';

import React, { useState, useRef } from 'react';
import { uploadTracks } from '@/lib/api';
import type { TrackResponse } from '@/lib/api';

interface FileProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

interface MultiUploadProps {
  onSuccess?: (tracks: TrackResponse[]) => void;
  onError?: (error: string) => void;
}

const ALLOWED_FORMATS = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/aiff', 'audio/ogg', 'audio/x-m4a'];
const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.flac', '.aiff', '.ogg', '.m4a'];

export default function MultiUpload({ onSuccess, onError }: MultiUploadProps) {
  const [files, setFiles] = useState<FileProgress[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValidFile = (file: File): boolean => {
    const fileExt = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    return ALLOWED_FORMATS.includes(file.type) && ALLOWED_EXTENSIONS.includes(fileExt);
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
    if (files.length === 0) return;
    setIsUploading(true);
    const filesToUpload = files.filter(f => f.status === 'pending' || f.status === 'error').map(f => f.file);
    try {
      const formData = new FormData();
      filesToUpload.forEach(file => formData.append('files', file));
      setFiles(prev => prev.map(f => filesToUpload.includes(f.file) ? { ...f, status: 'uploading' as const } : f));
      const tracks = await uploadTracks(formData);
      const uploadedNames = tracks.map(t => t.original_filename);
      setFiles(prev => prev.map(f => uploadedNames.includes(f.file.name) ? { ...f, status: 'completed' as const, progress: 100 } : f));
      if (onSuccess) onSuccess(tracks);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setFiles(prev => prev.map(f => filesToUpload.includes(f.file) ? { ...f, status: 'error' as const, error: errorMessage } : f));
      if (onError) onError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (index: number) => setFiles(prev => prev.filter((_, i) => i !== index));
  const completedCount = files.filter(f => f.status === 'completed').length;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}
      >
        <p className="text-sm font-medium text-gray-900 mb-2">Drag audio files here or click to browse</p>
        <p className="text-xs text-gray-500 mb-4">Supported: MP3, WAV, FLAC, AIFF, OGG, M4A</p>
        <button type="button" onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
          Select Files
        </button>
        <input ref={fileInputRef} type="file" multiple accept={ALLOWED_EXTENSIONS.join(',')}
          onChange={(e) => handleFileSelect(e.currentTarget.files || new FileList())} className="hidden" />
      </div>
      {files.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Files ({files.length}) {completedCount > 0 && <span className="text-green-600">• {completedCount} done</span>}</h3>
          <div className="space-y-2">
            {files.map((item, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.file.name}</p>
                  <p className="text-xs text-gray-500">{(item.file.size/1024/1024).toFixed(1)}MB — {item.status}</p>
                </div>
                {item.status !== 'uploading' && <button onClick={() => removeFile(index)} className="text-gray-400 hover:text-gray-600">✕</button>}
              </div>
            ))}
          </div>
          {files.some(f => f.status === 'pending') && (
            <button onClick={handleUpload} disabled={isUploading}
              className="mt-4 w-full px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400">
              {isUploading ? 'Uploading...' : 'Start Upload'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
