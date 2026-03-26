'use client';

import React, { useState } from 'react';
import { updateTrackMetadata } from '@/lib/api';
import type { TrackWithMetadata } from '@/lib/api';

interface MetadataApprovalModalProps {
  track: TrackWithMetadata;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (updatedTrack: TrackWithMetadata) => void;
  onError?: (error: string) => void;
}

export default function MetadataApprovalModal({ track, isOpen, onClose, onSuccess, onError }: MetadataApprovalModalProps) {
  const [artist, setArtist] = useState(track.artist || track.suggested_artist || '');
  const [title, setTitle] = useState(track.title || '');
  const [album, setAlbum] = useState(track.album || track.suggested_album || '');
  const [genre, setGenre] = useState(track.genre || track.suggested_genre || '');
  const [year, setYear] = useState(track.year ? String(track.year) : '');
  const [isLoading, setIsLoading] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const handleApply = async () => {
    setIsLoading(true);
    try {
      const response = await updateTrackMetadata(track.id, {
        artist: artist || undefined,
        title: title || undefined,
        album: album || undefined,
        genre: genre || undefined,
        year: year ? parseInt(year, 10) : undefined,
      });
      setShowFeedback(true);
      setTimeout(() => {
        if (onSuccess) onSuccess(response as TrackWithMetadata);
        onClose();
      }, 1500);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update metadata';
      if (onError) onError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const confidencePercentage = Math.round((track.metadata_confidence || 0) * 100);
  const hasChanges =
    artist !== (track.artist || track.suggested_artist || '') ||
    title !== (track.title || '') ||
    album !== (track.album || track.suggested_album || '') ||
    genre !== (track.genre || track.suggested_genre || '') ||
    year !== (track.year ? String(track.year) : '');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Metadata Suggestions</h2>
            <p className="text-sm text-gray-500 mt-1">Review and adjust track information</p>
          </div>
          <button onClick={onClose} disabled={isLoading} className="text-gray-400 hover:text-gray-600">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4">
          {track.metadata_confidence > 0 && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-900">Detection Confidence</span>
                <span className="text-sm font-bold text-blue-600">{confidencePercentage}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${confidencePercentage}%` }} />
              </div>
            </div>
          )}

          {showFeedback && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <span className="text-sm font-medium text-green-800">Metadata updated successfully!</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-900">Artist</label>
                {track.suggested_artist && <span className="text-xs text-gray-500">Suggestion: {track.suggested_artist}</span>}
              </div>
              <input type="text" value={artist} onChange={(e) => setArtist(e.target.value)} disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-900 block mb-1">Title</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-900">Album</label>
                {track.suggested_album && <span className="text-xs text-gray-500">Suggestion: {track.suggested_album}</span>}
              </div>
              <input type="text" value={album} onChange={(e) => setAlbum(e.target.value)} disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-900">Genre</label>
                {track.suggested_genre && <span className="text-xs text-gray-500">Suggestion: {track.suggested_genre}</span>}
              </div>
              <select value={genre} onChange={(e) => setGenre(e.target.value)} disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100">
                <option value="">Select a genre</option>
                <optgroup label="Electronic">
                  <option value="Techno">Techno</option>
                  <option value="House">House</option>
                  <option value="Trance">Trance</option>
                  <option value="Drum and Bass">Drum and Bass</option>
                  <option value="Ambient">Ambient</option>
                </optgroup>
                <optgroup label="Urban">
                  <option value="Hip-Hop">Hip-Hop</option>
                  <option value="Rap">Rap</option>
                  <option value="R&B">R&amp;B</option>
                </optgroup>
                <optgroup label="Pop & Rock">
                  <option value="Pop">Pop</option>
                  <option value="Rock">Rock</option>
                  <option value="Alternative">Alternative</option>
                </optgroup>
                <optgroup label="Jazz & Soul">
                  <option value="Jazz">Jazz</option>
                  <option value="Soul">Soul</option>
                  <option value="Funk">Funk</option>
                </optgroup>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-900">Year</label>
                {track.suggested_year && <span className="text-xs text-gray-500">Suggestion: {track.suggested_year}</span>}
              </div>
              <input type="number" min="1900" max={new Date().getFullYear()} value={year}
                onChange={(e) => setYear(e.target.value)} disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" />
            </div>

            {(track.bpm || track.key || track.energy != null) && (
              <div className="pt-4 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Audio Characteristics</h3>
                <div className="space-y-2">
                  {track.bpm && <div className="flex justify-between text-sm"><span className="text-gray-600">BPM</span><span className="font-medium">{Math.round(track.bpm)}</span></div>}
                  {track.key && <div className="flex justify-between text-sm"><span className="text-gray-600">Key (Camelot)</span><span className="font-medium">{track.key}</span></div>}
                  {track.energy != null && <div className="flex justify-between text-sm"><span className="text-gray-600">Energy</span><span className="font-medium">{Math.round(track.energy * 100)}%</span></div>}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3">
          <button onClick={onClose} disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
            Skip
          </button>
          <button onClick={handleApply} disabled={isLoading || !hasChanges}
            className="flex-1 px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center">
            {isLoading ? 'Saving...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
