'use client';

import Skeleton from './Skeleton';
import TrackListSkeleton from './TrackListSkeleton';

export default function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-bg-primary flex">
      {/* Sidebar skeleton — hidden on mobile */}
      <div className="hidden md:flex w-56 flex-shrink-0 bg-bg-secondary border-r border-slate-800/40">
        <div className="w-full p-4 space-y-6">
          {/* Logo */}
          <Skeleton width={32} height={32} variant="circle" />

          {/* Nav items */}
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={40} variant="rect" />
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-screen">
        {/* TopBar skeleton */}
        <div className="bg-bg-secondary border-b border-slate-800/40 p-6">
          <div className="space-y-2">
            <Skeleton width="40%" height={24} variant="text" />
            <Skeleton width="60%" height={16} variant="text" />
          </div>
        </div>

        {/* Main content area */}
        <main className="p-6 space-y-6">
          {/* Stats cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-bg-secondary rounded-xl border border-slate-800/40 p-6 space-y-3"
              >
                <Skeleton width="50%" height={14} variant="text" />
                <Skeleton width="40%" height={20} variant="text" />
              </div>
            ))}
          </div>

          {/* Track list section */}
          <div className="bg-bg-secondary rounded-xl border border-slate-800/40 p-6">
            <div className="mb-4 space-y-2">
              <Skeleton width="30%" height={20} variant="text" />
            </div>
            <TrackListSkeleton count={5} />
          </div>
        </main>
      </div>
    </div>
  );
}
