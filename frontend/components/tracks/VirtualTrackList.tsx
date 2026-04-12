'use client';

import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight,
    overscan: 10, // Plus de buffer que l'ancienne implem (5) pour un scroll plus fluide
  });

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto overflow-x-hidden"
      style={{ height: containerHeight }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const track = tracks[virtualItem.index];
          return (
            <div
              key={track.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <TrackRow
                track={track}
                index={virtualItem.index}
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
            </div>
          );
        })}
      </div>
    </div>
  );
});

VirtualTrackList.displayName = 'VirtualTrackList';

export default VirtualTrackList;
