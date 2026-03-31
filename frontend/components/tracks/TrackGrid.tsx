'use client';

import { Music, Heart } from 'lucide-react';
import type { Track } from '@/types';

interface TrackGridProps {
  tracks: Track[];
  selectedTrack: Track | null;
  playingTrackId: number | null;
  favoriteIds: Set<number>;
  onSelect: (track: Track) => void;
  onDoubleClick: (track: Track) => void;
  onContextMenu: (track: Track, e: React.MouseEvent) => void;
  onFavoriteToggle: (trackId: number) => void;
  onRatingChange?: (trackId: number, rating: number) => void;
}

const EqBars = ({ isAnimating }: { isAnimating: boolean }) => {
  return (
    <div className="flex items-end justify-center gap-0.5 h-8">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`w-1.5 bg-[var(--accent)] rounded-sm ${
            isAnimating ? 'animate-pulse' : ''
          }`}
          style={{
            height: isAnimating ? `${8 + (i % 3) * 6}px` : '4px',
            animation: isAnimating
              ? `pulse ${0.5 + i * 0.1}s ease-in-out infinite`
              : 'none',
          }}
        />
      ))}
    </div>
  );
};

export function TrackGrid({
  tracks,
  selectedTrack,
  playingTrackId,
  favoriteIds,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onFavoriteToggle,
}: TrackGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
      {tracks.map((track) => {
        const isSelected = selectedTrack?.id === track.id;
        const isPlaying = playingTrackId === track.id;
        const isFavorite = favoriteIds.has(track.id);

        return (
          <div
            key={track.id}
            onClick={() => onSelect(track)}
            onDoubleClick={() => onDoubleClick(track)}
            onContextMenu={(e) => onContextMenu(track, e)}
            className={`
              group bg-[var(--bg-secondary)] rounded-lg overflow-hidden cursor-pointer
              transition-all duration-200 border border-[var(--border-color)]
              hover:shadow-lg hover:border-[var(--accent)]
              ${isSelected ? 'border-[var(--accent)] border-2 shadow-lg' : ''}
            `}
          >
            {/* Artwork Area */}
            <div className="relative aspect-square bg-gradient-to-br from-[var(--accent)] to-[var(--accent-high)] overflow-hidden flex items-center justify-center">
              {isPlaying ? (
                <div className="flex items-center justify-center">
                  <EqBars isAnimating={true} />
                </div>
              ) : (
                <Music size={48} className="text-white opacity-50" />
              )}

              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center">
                {!isPlaying && (
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-[var(--accent)] flex items-center justify-center">
                      <div className="w-0 h-0 border-l-6 border-l-white border-t-4 border-t-transparent border-b-4 border-b-transparent ml-1" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Track Info */}
            <div className="p-3 space-y-2">
              {/* Title and Artist */}
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-[var(--text-primary)] truncate">
                  {track.title}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] truncate">{track.artist}</p>
              </div>

              {/* BPM + Key Badges */}
              <div className="flex gap-2 flex-wrap">
                {track.bpm && (
                  <span className="inline-block px-2 py-0.5 bg-[var(--bg-primary)] rounded text-xs font-mono text-[var(--text-primary)]">
                    {Math.round(track.bpm)} BPM
                  </span>
                )}
                {track.key && (
                  <span className="inline-block px-2 py-0.5 bg-[var(--accent)] bg-opacity-20 text-[var(--accent)] rounded text-xs font-medium">
                    {track.key}
                  </span>
                )}
              </div>

              {/* Energy Bar */}
              {track.energy !== undefined && (
                <div className="w-full h-1.5 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--accent-low)] via-[var(--accent)] to-[var(--accent-high)]"
                    style={{ width: `${(track.energy / 100) * 100}%` }}
                  />
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-[var(--border-color)]">
                <span className="text-xs text-[var(--text-secondary)]">
                  {track.genre || 'Aucun genre'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onFavoriteToggle(track.id);
                  }}
                  className="p-1 hover:bg-[var(--bg-primary)] rounded transition-colors"
                >
                  <Heart
                    size={14}
                    className={`${
                      isFavorite
                        ? 'fill-[var(--accent)] text-[var(--accent)]'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
