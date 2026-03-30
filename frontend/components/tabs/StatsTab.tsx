'use client';

import { Track } from '@/types';

interface StatsTabProps {
  tracks: Track[];
}

export function StatsTab({ tracks = [] }: StatsTabProps) {
  const totalTracks = tracks.length;
  const analyzedTracks = tracks.filter((t) => t.analysis).length;

  const bpms = tracks
    .filter((t) => t.analysis?.bpm)
    .map((t) => t.analysis!.bpm!);
  const avgBpm = bpms.length > 0 ? Math.round((bpms.reduce((a, b) => a + b) / bpms.length) * 10) / 10 : 0;

  const genres = new Set(tracks.filter((t) => t.genre).map((t) => t.genre!));
  const genreCount = genres.size;

  const topGenres = Array.from(genres)
    .map((genre) => ({
      genre,
      count: tracks.filter((t) => t.genre === genre).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const keys = tracks
    .filter((t) => t.analysis?.key)
    .map((t) => t.analysis!.key!);

  const keyDistribution = keys.reduce(
    (acc, key) => {
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const topKeys = Object.entries(keyDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const StatCard = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
    <div className="p-3 rounded-lg bg-gray-900 border border-gray-800">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-4 p-4">
      {/* Top Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total morceaux" value={totalTracks} color="text-blue-400" />
        <StatCard label="Analysés" value={analyzedTracks} color="text-green-400" />
        <StatCard label="BPM moyen" value={avgBpm} color="text-yellow-400" />
        <StatCard label="Genres" value={genreCount} color="text-purple-400" />
      </div>

      {/* Top Genres */}
      {topGenres.length > 0 && (
        <div className="p-3 rounded-lg bg-gray-900 border border-gray-800">
          <div className="text-sm font-semibold text-gray-300 mb-3">Top Genres</div>
          <div className="space-y-2">
            {topGenres.map(({ genre, count }) => (
              <div key={genre} className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{genre}</span>
                <span className="font-mono text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Distribution */}
      {topKeys.length > 0 && (
        <div className="p-3 rounded-lg bg-gray-900 border border-gray-800">
          <div className="text-sm font-semibold text-gray-300 mb-3">Distribution des Clés</div>
          <div className="space-y-2">
            {topKeys.map(([key, count]) => {
              const maxCount = Math.max(...topKeys.map(([, c]) => c));
              const percentage = (count / maxCount) * 100;

              return (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">{key}</span>
                    <span className="font-mono text-white">{count}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
