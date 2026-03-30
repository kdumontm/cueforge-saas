'use client';

import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Star, Volume2, Trash2, Zap, Copy, Tag } from 'lucide-react';
import type { Track } from '@/types';

interface TrackRowProps {
  track: Track;
  index: number;
  isSelected: boolean;
  isMultiSelected?: boolean;
  isPlaying: boolean;
  isFavorite: boolean;
  onSelect: (track: Track, e?: React.MouseEvent) => void;
  onDoubleClick: (track: Track) => void;
  onContextMenu: (track: Track, e: React.MouseEvent) => void;
  onFavoriteToggle: (trackId: number) => void;
  onRatingChange?: (trackId: number, rating: number) => void;
}

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  return m + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
};

const EqBars = ({ isAnimating }: { isAnimating: boolean }) => {
  return (
    <div className="flex items-center gap-0.5 h-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`w-1 bg-[var(--accent)] rounded-sm ${
            isAnimating ? 'animate-pulse' : ''
          }`}
          style={{
            height: isAnimating ? `${12 + (i % 2) * 4}px` : '4px',
            animation: isAnimating
              ? `pulse ${0.6 + i * 0.1}s ease-in-out infinite`
              : 'none',
          }}
        />
      ))}
    </div>
  );
};

export function TrackRow({
  track,
  index,
  isSelected,
  isPlaying,
  isMultiSelected = false,
  isFavorite,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onFavoriteToggle,
  onRatingChange,
}: TrackRowProps) {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(track, e);
    setShowContextMenu(true);
  };

  return (
    <div
      onClick={(e) => onSelect(track, e)}
      onDoubleClick={() => onDoubleClick(track)}
      onContextMenu={handleContextMenu}
      className={`
        grid grid-cols-[40px_40px_2fr_80px_80px_120px_100px_80px_40px_40px] gap-3 px-4 py-2
        items-center border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]
        transition-colors cursor-pointer
        ${isSelected ? 'bg-[var(--bg-secondary)] border-l-4 border-l-[var(--accent)]' : ''}
        ${isMultiSelected ? 'bg-blue-500/10 border-l-4 border-l-blue-500' : ''}
      `}
    >
      {/* Index */}
      <div className="text-xs font-medium text-[var(--text-secondary)]">{index + 1}</div>

      {/* Play Indicator */}
      <div className="flex justify-center">
        {isPlaying ? (
          <EqBars isAnimating={true} />
        ) : (
          <Volume2 size={16} className="text-[var(--text-secondary)] opacity-0 group-hover:opacity-100" />
        )}
      </div>

      {/* Title + Artist */}
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
          {track.title}
        </p>
        <p className="text-xs text-[var(--text-secondary)] truncate">{track.artist}</p>
      </div>

      {/* BPM */}
      <div className="text-sm font-mono text-[var(--text-primary)] text-right">
        {track.bpm ? Math.round(track.bpm) : '—'}
      </div>

      {/* Key */}
      <div>
        {track.key ? (
          <span className="inline-block px-2 py-0.5 bg-[var(--accent)] bg-opacity-20 text-[var(--accent)] rounded text-xs font-medium">
            {track.key}
          </span>
        ) : (
          <span className="text-xs text-[var(--text-secondary)]">—</span>
        )}
      </div>

      {/* Energy Bar */}
      <div className="w-full">
        {track.energy !== undefined ? (
          <div className="w-full h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[var(--accent-low)] via-[var(--accent)] to-[var(--accent-high)] rounded-full"
              style={{ width: `${(track.energy / 100) * 100}%` }}
            />
          </div>
        ) : (
          <span className="text-xs text-[var(--text-secondary)]">—</span>
        )}
      </div>

      {/* Genre */}
      <div className="text-xs text-[var(--text-secondary)] truncate">{track.genre || '—'}</div>

      {/* Duration */}
      <div className="text-xs font-mono text-[var(--text-primary)] text-right">
        {typeof (track as any).duration === 'string'
          ? (track as any).duration
          : track.analysis?.duration_ms
            ? formatTime(track.analysis.duration_ms / 1000)
            : '—'}
      </div>

      {/* Rating — Stars */}
      <div
        className="flex justify-center gap-0.5"
        onMouseLeave={() => setHoverRating(0)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onMouseEnter={() => setHoverRating(star)}
            onClick={(e) => {
              e.stopPropagation();
              onRatingChange?.(track.id, star);
            }}
            className="p-0.5 hover:bg-[var(--bg-hover)] rounded transition-colors cursor-pointer"
          >
            <Star
              size={14}
              className={`${
                star <= (hoverRating || track.rating || 0)
                  ? 'fill-yellow-500 text-yellow-500'
                  : 'text-[var(--text-muted)]'
              }`}
            />
          </button>
        ))}
      </div>

      {/* Actions Menu */}
      <div className="flex justify-end relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowContextMenu(!showContextMenu);
          }}
          className="p-1 hover:bg-[var(--bg-primary)] rounded transition-colors"
        >
          <MoreVertical size={16} className="text-[var(--text-secondary)]" />
        </button>
        {showContextMenu && (
          <div
            className="absolute right-0 top-8 w-44 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg shadow-2xl z-50 py-1 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {[
              { icon: Zap, label: 'Re-analyser', action: () => {} },
              { icon: Copy, label: 'Copier le titre', action: () => { navigator.clipboard?.writeText(track.title || ''); setShowContextMenu(false); } },
              { icon: Tag, label: 'Ajouter un tag', action: () => {} },
              { icon: Star, label: isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris', action: () => { onFavoriteToggle(track.id); setShowContextMenu(false); } },
              { icon: Trash2, label: 'Supprimer', action: () => {}, danger: true },
            ].map(({ icon: Icon, label, action, danger }) => (
              <button
                key={label}
                onClick={action}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors bg-transparent border-none cursor-pointer ${
                  danger ? 'text-red-400 hover:bg-red-500/10' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
