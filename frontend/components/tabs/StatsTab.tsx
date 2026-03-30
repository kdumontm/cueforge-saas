// @ts-nocheck
'use client';

import { useMemo } from 'react';
import { BarChart3, Music2, Disc3, Zap, Clock, Tag, Star, TrendingUp } from 'lucide-react';
import { Track } from '@/types';

interface StatsTabProps {
  tracks: Track[];
}

const CAMELOT_MAP: Record<string, string> = {
  'C': '8B', 'Am': '8A', 'G': '9B', 'Em': '9A', 'D': '10B', 'Bm': '10A',
  'A': '11B', 'F#m': '11A', 'E': '12B', 'C#m': '12A', 'B': '1B', 'G#m': '1A',
  'F#': '2B', 'Ebm': '2A', 'Db': '3B', 'Bbm': '3A', 'Ab': '4B', 'Fm': '4A',
  'Eb': '5B', 'Cm': '5A', 'Bb': '6B', 'Gm': '6A', 'F': '7B', 'Dm': '7A',
};

const KEY_COLORS: Record<string, string> = {
  '1A': '#e74c3c', '1B': '#e74c3c', '2A': '#e67e22', '2B': '#e67e22',
  '3A': '#f1c40f', '3B': '#f1c40f', '4A': '#2ecc71', '4B': '#2ecc71',
  '5A': '#1abc9c', '5B': '#1abc9c', '6A': '#3498db', '6B': '#3498db',
  '7A': '#9b59b6', '7B': '#9b59b6', '8A': '#e91e63', '8B': '#e91e63',
  '9A': '#ff5722', '9B': '#ff5722', '10A': '#ff9800', '10B': '#ff9800',
  '11A': '#8bc34a', '11B': '#8bc34a', '12A': '#00bcd4', '12B': '#00bcd4',
};

export function StatsTab({ tracks = [] }: StatsTabProps) {
  const stats = useMemo(() => {
    const totalTracks = tracks.length;
    const analyzedTracks = tracks.filter((t) => t.analysis).length;

    // BPM stats
    const bpms = tracks.filter((t) => t.analysis?.bpm).map((t) => t.analysis!.bpm!);
    const avgBpm = bpms.length > 0 ? Math.round((bpms.reduce((a, b) => a + b) / bpms.length) * 10) / 10 : 0;
    const minBpm = bpms.length > 0 ? Math.round(Math.min(...bpms)) : 0;
    const maxBpm = bpms.length > 0 ? Math.round(Math.max(...bpms)) : 0;

    // BPM histogram (buckets of 5)
    const bpmBuckets: Record<number, number> = {};
    bpms.forEach(bpm => {
      const bucket = Math.floor(bpm / 5) * 5;
      bpmBuckets[bucket] = (bpmBuckets[bucket] || 0) + 1;
    });
    const bpmHistogram = Object.entries(bpmBuckets)
      .map(([bpm, count]) => ({ bpm: parseInt(bpm), count }))
      .sort((a, b) => a.bpm - b.bpm);

    // Energy stats
    const energies = tracks.filter(t => t.analysis?.energy).map(t => t.analysis!.energy!);
    const avgEnergy = energies.length > 0 ? Math.round((energies.reduce((a, b) => a + b) / energies.length) * 100) : 0;

    // Energy distribution
    const energyBuckets = { low: 0, mid: 0, high: 0, peak: 0 };
    energies.forEach(e => {
      if (e < 0.3) energyBuckets.low++;
      else if (e < 0.6) energyBuckets.mid++;
      else if (e < 0.8) energyBuckets.high++;
      else energyBuckets.peak++;
    });

    // Genre distribution
    const genres: Record<string, number> = {};
    tracks.forEach(t => {
      const g = t.genre || (t.analysis as any)?.genre;
      if (g) genres[g] = (genres[g] || 0) + 1;
    });
    const topGenres = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 8);

    // Key distribution (Camelot)
    const keys: Record<string, number> = {};
    tracks.forEach(t => {
      if (t.analysis?.key) {
        const cam = CAMELOT_MAP[t.analysis.key] || t.analysis.key;
        keys[cam] = (keys[cam] || 0) + 1;
      }
    });
    const topKeys = Object.entries(keys).sort((a, b) => b[1] - a[1]).slice(0, 12);

    // Duration stats
    const durations = tracks.filter(t => t.analysis?.duration_ms).map(t => t.analysis!.duration_ms! / 60000);
    const totalDuration = durations.reduce((a, b) => a + b, 0);
    const avgDuration = durations.length > 0 ? totalDuration / durations.length : 0;

    // Category distribution
    const categories: Record<string, number> = {};
    tracks.forEach(t => {
      if (t.category) categories[t.category] = (categories[t.category] || 0) + 1;
    });
    const topCategories = Object.entries(categories).sort((a, b) => b[1] - a[1]);

    // Rating distribution
    const ratings: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    tracks.forEach(t => {
      if (t.rating && t.rating >= 1 && t.rating <= 5) ratings[t.rating]++;
    });
    const ratedCount = Object.values(ratings).reduce((a, b) => a + b, 0);

    // Tag cloud
    const tagCounts: Record<string, number> = {};
    tracks.forEach(t => {
      if (t.tags) {
        const tags = typeof t.tags === 'string' ? t.tags.split(',') : t.tags;
        (tags as string[]).forEach(tag => {
          const trimmed = tag.trim().toLowerCase();
          if (trimmed) tagCounts[trimmed] = (tagCounts[trimmed] || 0) + 1;
        });
      }
    });
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);

    return {
      totalTracks, analyzedTracks, avgBpm, minBpm, maxBpm, bpmHistogram,
      avgEnergy, energyBuckets, topGenres, topKeys, totalDuration, avgDuration,
      topCategories, ratings, ratedCount, topTags,
    };
  }, [tracks]);

  const StatCard = ({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon?: any; color: string }) => (
    <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-colors">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon size={12} className={color} />}
        <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">{label}</div>
      </div>
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{sub}</div>}
    </div>
  );

  const BarChart = ({ data, maxVal, colorFn }: { data: { label: string; value: number }[]; maxVal: number; colorFn?: (label: string) => string }) => (
    <div className="space-y-1.5">
      {data.map(({ label, value }) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-muted)] w-16 text-right truncate font-mono">{label}</span>
          <div className="flex-1 h-3 bg-[var(--bg-primary)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${maxVal > 0 ? (value / maxVal) * 100 : 0}%`,
                background: colorFn ? colorFn(label) : 'linear-gradient(90deg, #6366f1, #a855f7)',
              }}
            />
          </div>
          <span className="text-[10px] text-[var(--text-primary)] font-mono w-6 text-right">{value}</span>
        </div>
      ))}
    </div>
  );

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-[var(--text-muted)]">
        <BarChart3 size={32} className="opacity-30 mb-2" />
        <span className="text-sm">Importe des morceaux pour voir tes stats</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-y-auto max-h-[500px] pr-1">
      {/* Top Stats Grid */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Morceaux" value={stats.totalTracks} sub={`${stats.analyzedTracks} analysés`} icon={Music2} color="text-blue-400" />
        <StatCard label="BPM moyen" value={stats.avgBpm} sub={`${stats.minBpm}–${stats.maxBpm}`} icon={Disc3} color="text-purple-400" />
        <StatCard label="Énergie moy." value={`${stats.avgEnergy}%`} icon={Zap} color="text-yellow-400" />
        <StatCard
          label="Durée totale"
          value={stats.totalDuration >= 60 ? `${Math.floor(stats.totalDuration / 60)}h${Math.round(stats.totalDuration % 60)}` : `${Math.round(stats.totalDuration)}min`}
          sub={`~${Math.round(stats.avgDuration)}min/morceau`}
          icon={Clock}
          color="text-emerald-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* BPM Distribution */}
        {stats.bpmHistogram.length > 0 && (
          <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <TrendingUp size={11} /> Distribution BPM
            </div>
            <div className="flex items-end gap-0.5 h-20">
              {stats.bpmHistogram.map(({ bpm, count }) => {
                const maxCount = Math.max(...stats.bpmHistogram.map(b => b.count));
                const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                return (
                  <div key={bpm} className="flex-1 flex flex-col items-center gap-0.5" title={`${bpm}-${bpm + 4} BPM: ${count} tracks`}>
                    <span className="text-[8px] text-[var(--text-muted)] font-mono">{count}</span>
                    <div
                      className="w-full rounded-t transition-all"
                      style={{
                        height: `${Math.max(height * 0.7, 2)}px`,
                        background: `linear-gradient(to top, #6366f140, #6366f1)`,
                      }}
                    />
                    <span className="text-[7px] text-[var(--text-muted)] font-mono">{bpm}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Energy Distribution */}
        <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
          <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Zap size={11} /> Répartition énergie
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Chill', value: stats.energyBuckets.low, color: '#22c55e', range: '0-30%' },
              { label: 'Medium', value: stats.energyBuckets.mid, color: '#eab308', range: '30-60%' },
              { label: 'High', value: stats.energyBuckets.high, color: '#f97316', range: '60-80%' },
              { label: 'Peak', value: stats.energyBuckets.peak, color: '#ef4444', range: '80-100%' },
            ].map(e => (
              <div key={e.label} className="text-center">
                <div className="w-full h-12 rounded-lg flex items-end justify-center overflow-hidden bg-[var(--bg-primary)] mb-1">
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${tracks.length > 0 ? Math.max((e.value / tracks.length) * 100, 4) : 4}%`,
                      backgroundColor: e.color,
                    }}
                  />
                </div>
                <div className="text-[11px] font-bold font-mono" style={{ color: e.color }}>{e.value}</div>
                <div className="text-[8px] text-[var(--text-muted)]">{e.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Genre Distribution */}
        {stats.topGenres.length > 0 && (
          <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Music2 size={11} /> Genres
            </div>
            <BarChart
              data={stats.topGenres.map(([genre, count]) => ({ label: genre, value: count }))}
              maxVal={Math.max(...stats.topGenres.map(([, c]) => c))}
            />
          </div>
        )}

        {/* Key Distribution */}
        {stats.topKeys.length > 0 && (
          <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Disc3 size={11} /> Tonalités (Camelot)
            </div>
            <BarChart
              data={stats.topKeys.map(([key, count]) => ({ label: key, value: count }))}
              maxVal={Math.max(...stats.topKeys.map(([, c]) => c))}
              colorFn={(label) => KEY_COLORS[label] || '#6366f1'}
            />
          </div>
        )}
      </div>

      {/* Tags & Ratings */}
      <div className="grid grid-cols-2 gap-3">
        {/* Tags Cloud */}
        {stats.topTags.length > 0 && (
          <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Tag size={11} /> Tags populaires
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stats.topTags.map(([tag, count]) => {
                const maxCount = stats.topTags[0][1];
                const opacity = 0.4 + (count / maxCount) * 0.6;
                return (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium border"
                    style={{
                      backgroundColor: `rgba(99, 102, 241, ${opacity * 0.2})`,
                      borderColor: `rgba(99, 102, 241, ${opacity * 0.4})`,
                      color: `rgba(165, 180, 252, ${opacity})`,
                    }}
                  >
                    {tag} ({count})
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Rating Distribution */}
        {stats.ratedCount > 0 && (
          <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Star size={11} /> Évaluations
            </div>
            <div className="space-y-1.5">
              {[5, 4, 3, 2, 1].map(star => (
                <div key={star} className="flex items-center gap-2">
                  <div className="flex gap-0.5 w-14">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} size={9} className={i < star ? 'fill-yellow-500 text-yellow-500' : 'text-[var(--text-muted)]'} />
                    ))}
                  </div>
                  <div className="flex-1 h-2.5 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-yellow-500 transition-all"
                      style={{ width: `${stats.ratedCount > 0 ? (stats.ratings[star] / stats.ratedCount) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--text-primary)] font-mono w-6 text-right">{stats.ratings[star]}</span>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-2 text-center">
              {stats.ratedCount} morceaux évalués sur {tracks.length}
            </div>
          </div>
        )}

        {/* Categories */}
        {stats.topCategories.length > 0 && (
          <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Catégories</div>
            <BarChart
              data={stats.topCategories.map(([cat, count]) => ({ label: cat, value: count }))}
              maxVal={Math.max(...stats.topCategories.map(([, c]) => c))}
              colorFn={() => 'linear-gradient(90deg, #f97316, #ef4444)'}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default StatsTab;
