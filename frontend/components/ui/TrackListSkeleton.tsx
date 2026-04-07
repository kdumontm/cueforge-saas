'use client';

import Skeleton from './Skeleton';

interface TrackListSkeletonProps {
  count?: number;
}

export default function TrackListSkeleton({ count = 6 }: TrackListSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-4 bg-bg-secondary rounded-xl border border-slate-800/40"
        >
          {/* Artwork */}
          <Skeleton
            width={48}
            height={48}
            variant="rect"
            className="flex-shrink-0"
          />

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Title */}
            <Skeleton width="60%" height={16} variant="text" />
            {/* Artist */}
            <Skeleton width="40%" height={14} variant="text" />
          </div>

          {/* Stats */}
          <div className="hidden sm:flex gap-6 flex-shrink-0">
            <div className="space-y-1.5">
              <Skeleton width={40} height={12} variant="text" className="text-xs" />
              <Skeleton width={32} height={14} variant="text" />
            </div>
            <div className="space-y-1.5">
              <Skeleton width={28} height={12} variant="text" className="text-xs" />
              <Skeleton width={24} height={14} variant="text" />
            </div>
            <div className="space-y-1.5">
              <Skeleton width={45} height={12} variant="text" className="text-xs" />
              <Skeleton width={40} height={14} variant="text" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
