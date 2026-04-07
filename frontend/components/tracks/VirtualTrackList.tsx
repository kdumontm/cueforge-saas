'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { TrackRow } from './TrackRow';
import type { Track } from '@/types';

interface VirtualTrackListProps {
  tracks: Track[];
  selectedTrack: Track | null;
  playingTrackId: number | null;
  favoriteIds: Set<number>;
  selectedIds?: Set<number>;
  analyzingIds?: Set<number>;
  rowHeight?: number;
  containerHeight?: number;
  onSelect: (track: Track, e?: React.MouseEvent) => void;
  onDoubleClick: (track: Track) => void;
  onContextMenu: (track: Track, e: React.MouseEvent) => void;
  onFavoriteToggle: (trackId: number) => void;
  onRatingChange?: (trackId: number, rating: number) => void;
  onReanalyzeTrack?: (trackId: number) => void;
  onDeleteTrack?: (trackId: number) => void;
  onAddTagTrack?: (trackId: number) => void;
}

export const VirtualTrackList = React.memo(function VirtualTrackList({
  tracks,
  selectedTrack,
  playingTrackId,
  favoriteIds,
  selectedIds = new Set(),
  analyzingIds = new Set(),
  rowHeight = 60,
  containerHeight = 600,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onFavoriteToggle,
  onRatingChange,
  onReanalyzeTrack,
  onDeleteTrack,
  onAddTagTrack,
}: VirtualTrackListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Calculate visible items
  const visibleItemsCount = Math.ceil(containerHeight / rowHeight);
  const bufferSize = 5;
  const startIndex = Math.max(0, Math.floor(scrollOffset / rowHeight) - bufferSize);
  const endIndex = Math.min(tracks.length, startIndex + visibleItemsCount + bufferSize * 2);

  // Visible tracks
  const visibleTracks = tracks.slice(startIndex, endIndex);
  const offsetY = startIndex * rowHeight;

  // Handle scroll with requestAnimationFrame for performance
  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollOffset(containerRef.current.scrollTop);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number;
    const onScroll = () => {
      rafId = requestAnimationFrame(handleScroll);
    };

    container.addEventListener('scroll', onScroll);
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [handleScroll]);

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto overflow-x-hidden"
      style={{ height: containerHeight }}
    >
      {/* Top spacer */}
      <div style={{ height: offsetY }} />

      {/* Visible rows */}
      {visibleTracks.map((track, idx) => (
        <TrackRow
          key={track.id}
          track={track}
          index={startIndex + idx}
          isSelected={selectedTrack?.id === track.id}
          isMultiSelected={selectedIds.has(track.id)}
          isPlaying={playingTrackId === track.id}
          isFavorite={favoriteIds.has(track.id)}
          isAnalyzing={analyzingIds.has(track.id)}
          referenceTrack={selectedTrack}
          onSelect={onSelect}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
          onFavoriteToggle={onFavoriteToggle}
          onRatingChange={onRatingChange}
          onReanalyze={onReanalyzeTrack}
          onDelete={onDeleteTrack}
          onAddTag={onAddTagTrack}
        />
      ))}

      {/* Bottom spacer */}
      <div style={{ height: Math.max(0, (tracks.length - endIndex) * rowHeight) }} />
    </div>
  );
});

VirtualTrackList.displayName = 'VirtualTrackList';

export default VirtualTrackList;
