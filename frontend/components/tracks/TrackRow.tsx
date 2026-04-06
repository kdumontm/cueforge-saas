'use client';

import React, { useState, useCallback } from 'react';
import { MoreVertical, Star, Volume2, Trash2, Zap, Copy, Tag, Loader2, FolderOpen, Disc3, Music2 } from 'lucide-react';
import { useLang } from '@/components/LangProvider';
import { tr } from '@/lib/i18n';
import type { Track } from '@/types';
import { useElectron } from '@/lib/electron';
import { mixScore } from '@/lib/camelot';

interface TrackRowProps {
  track: Track;
  index: number;
  isSelected: boolean;
  isMultiSelected?: boolean;
  isPlaying: boolean;
  isFavorite: boolean;
  isAnalyzing?: boolean;
  referenceTrack?: Track | null;
  onSelect: (track: Track, e?: React.MouseEvent) => void;
  onDoubleClick: (track: Track) => void;
  onContextMenu: (track: Track, e: React.MouseEvent) => void;
  onFavoriteToggle: (trackId: number) => void;
  onRatingChange?: (trackId: number, rating: number) => void;
  onReanalyze?: (trackId: number) => void;
  onDelete?: (trackId: number) => void;
  onAddTag?: (trackId: number) => void;
}

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  return m + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
};

const EqBars = React.memo(({ isAnimating }: { isAnimating: boolean }) => (
  <div className="flex items-center gap-0.5 h-4">
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        className={`w-1 bg-[var(--accent)] rounded-sm ${isAnimating ? 'animate-pulse' : ''}`}
        style={{
          height: isAnimating ? `${12 + (i % 2) * 4}px` : '4px',
          animation: isAnimating ? `pulse ${0.6 + i * 0.1}s ease-in-out infinite` : 'none',
        }}
      />
    ))}
  </div>
));
EqBars.displayName = 'EqBars';

export const TrackRow = React.memo(function TrackRow({
  track,
  index,
  isSelected,
  isPlaying,
  isMultiSelected = false,
  isFavorite,
  isAnalyzing = false,
  referenceTrack,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onFavoriteToggle,
  onRatingChange,
  onReanalyze,
  onDelete,
  onAddTag,
}: TrackRowProps) {
  const { isDesktop, files, export: localExport } = useElectron();
  const { lang } = useLang();
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);

  const handleClick = useCallback((e: React.MouseEvent) => onSelect(track, e), [track, onSelect]);
  const handleDblClick = useCallback(() => onDoubleClick(track), [track, onDoubleClick]);
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(track, e);
  }, [track, onContextMenu]);

  const handleRatingLeave = useCallback(() => setHoverRating(0), []);
  const handleMenuToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowContextMenu(v => !v);
  }, []);

  return (
    <div
      onClick={handleClick}
      onDoubleClick={handleDblClick}
      onContextMenu={handleContextMenu}
      className={`
        grid grid-cols-[28px_1fr_40px] sm:grid-cols-[32px_32px_2fr_60px_60px_40px] lg:grid-cols-[40px_40px_2fr_80px_80px_50px_120px_100px_80px_40px_40px] gap-2 sm:gap-3 px-3 sm:px-4 py-2
        items-center border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]
        transition-colors cursor-pointer
        ${isSelected ? 'bg-[var(--bg-secondary)] border-l-4 border-l-[var(--accent)]' : ''}
        ${isMultiSelected ? 'bg-blue-500/10 border-l-4 border-l-blue-500' : ''}
      `}
    >
      {/* Index + Color indicator */}
      <div className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1">
        {(track as any).color_code && (
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: (track as any).color_code }} />
        )}
        {index + 1}
      </div>

      {/* Play Indicator */}
      <div className="hidden sm:flex justify-center">
        {isPlaying ? (
          <EqBars isAnimating={true} />
        ) : (
          <Volume2 size={16} className="text-[var(--text-secondary)] opacity-0 group-hover:opacity-100" />
        )}
      </div>

      {/* Title + Artist */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{track.title}</p>
          {isAnalyzing && (
            <Loader2 size={13} className="animate-spin text-[var(--accent)] flex-shrink-0" title={tr('analysis.in_progress', lang)} />
          )}
        </div>
        <p className="text-xs text-[var(--text-secondary)] truncate">{track.artist}</p>
        <div className="flex items-center gap-2 sm:hidden mt-0.5">
          {track.bpm ? <span className="text-[10px] font-mono text-cyan-400">{Math.round(track.bpm)} BPM</span> : null}
          {track.key ? <span className="text-[10px] font-mono text-blue-400">{track.key}</span> : null}
          {(track as any).duration && (track as any).duration !== '—' ? <span className="text-[10px] font-mono text-[var(--text-muted)]">{(track as any).duration}</span> : null}
          {track.genre ? <span className="text-[10px] text-[var(--text-muted)]">{track.genre}</span> : null}
        </div>
      </div>

      {/* BPM */}
      <div className="hidden sm:block text-sm font-mono text-[var(--text-primary)] text-right">
        {track.bpm ? Math.round(track.bpm) : '—'}
      </div>

      {/* Key */}
      <div className="hidden sm:block">
        {track.key ? (
          <span className="inline-block px-2 py-0.5 bg-[var(--accent)] bg-opacity-20 text-[var(--accent)] rounded text-xs font-medium">
            {track.key}
          </span>
        ) : (
          <span className="text-xs text-[var(--text-secondary)]">—</span>
        )}
      </div>

      {/* Mix Score */}
      <div className="hidden lg:flex justify-center">
        {referenceTrack && referenceTrack.id !== track.id && track.key && referenceTrack.key ? (
          (() => {
            const ms = mixScore(
              referenceTrack.bpm || 0, referenceTrack.key || '',
              referenceTrack.energy || 0,
              track.bpm || 0, track.key || '', track.energy || 0,
            );
            return (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  color: ms.color,
                  background: `${ms.color}18`,
                  border: `1px solid ${ms.color}30`,
                }}
                title={`${ms.label} — ${ms.score}%`}
              >
                {ms.score}
              </span>
            );
          })()
        ) : (
          <span className="text-[10px] text-[var(--text-muted)]">—</span>
        )}
      </div>

      {/* Energy Bar */}
      <div className="hidden lg:block w-full">
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
      <div className="hidden lg:block text-xs text-[var(--text-secondary)] truncate">{track.genre || '—'}</div>

      {/* Duration */}
      <div className="hidden lg:block text-xs font-mono text-[var(--text-primary)] text-right">
        {typeof (track as any).duration === 'string'
          ? (track as any).duration
          : track.analysis?.duration_ms
            ? formatTime(track.analysis.duration_ms / 1000)
            : '—'}
      </div>

      {/* Rating — Stars */}
      <div className="hidden lg:flex justify-center gap-0.5" onMouseLeave={handleRatingLeave}>
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
          onClick={handleMenuToggle}
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
              { icon: Zap, label: tr('ctx.reanalyze', lang), action: () => { onReanalyze?.(track.id); setShowContextMenu(false); } },
              { icon: Copy, label: tr('ctx.copy_title', lang), action: () => { navigator.clipboard?.writeText(track.title || ''); setShowContextMenu(false); } },
              { icon: Tag, label: tr('ctx.add_tag', lang), action: () => { onAddTag?.(track.id); setShowContextMenu(false); } },
              { icon: Star, label: isFavorite ? tr('ctx.remove_fav', lang) : tr('ctx.add_fav', lang), action: () => { onFavoriteToggle(track.id); setShowContextMenu(false); } },
              // Desktop only : ouvrir le fichier dans le Finder / Explorateur
              ...(isDesktop && files && (track as any).file_path ? [{
                icon: FolderOpen,
                label: tr('ctx.reveal_finder', lang),
                action: () => { files.revealInFinder((track as any).file_path); setShowContextMenu(false); },
              }] : []),
              // Desktop only : exports DJ
              ...(isDesktop && localExport ? [
                {
                  icon: Disc3,
                  label: tr('ctx.export_rekordbox', lang),
                  action: () => { localExport.rekordbox([track]); setShowContextMenu(false); },
                },
                {
                  icon: Music2,
                  label: tr('ctx.export_serato', lang),
                  action: () => { localExport.serato([track]); setShowContextMenu(false); },
                },
              ] : []),
              { icon: Trash2, label: tr('ctx.delete', lang), action: () => { onDelete?.(track.id); setShowContextMenu(false); }, danger: true },
            ].map(({ icon: Icon, label, action, danger }: any) => (
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
});

TrackRow.displayName = 'TrackRow';
