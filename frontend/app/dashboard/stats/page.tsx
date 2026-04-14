'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Music, Disc3, Zap, Calendar, HardDrive } from 'lucide-react';
import FeatureGate from '@/components/FeatureGate';
import { useLang } from '@/components/LangProvider';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface StatsOverview {
  total_tracks: number;
  total_analyses: number;
  total_playlists: number;
  total_sets: number;
  genres_breakdown: Array<{ genre: string; count: number }>;
  bpm_range: { min: number | null; max: number | null; avg: number | null };
  key_distribution: Array<{ key: string; count: number }>;
  activity_last_30_days: Array<{ date: string; uploads: number; analyses: number }>;
  member_since: string;
  storage_used_mb: number;
}

export default function StatsPage() {
  const { lang } = useLang();
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('trackcue_token');
        const response = await fetch(`${API_URL}/stats/overview`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Failed to fetch stats');
        const data = await response.json();
        setStats(data);
      } catch (err) {
        setError('Erreur lors du chargement des statistiques');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-8 bg-gray-700 rounded w-40 animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-2 text-red-500 mb-4">
          <span>{error || 'Erreur'}</span>
        </div>
        <Link href="/dashboard" className="flex items-center gap-2 text-purple-400 hover:text-purple-300">
          <ArrowLeft className="w-4 h-4" />
          Retour au dashboard
        </Link>
      </div>
    );
  }

  const memberSinceDate = new Date(stats.member_since);
  const daysSinceMember = Math.floor((Date.now() - memberSinceDate.getTime()) / (1000 * 60 * 60 * 24));

  const maxGenreCount = Math.max(...stats.genres_breakdown.map((g) => g.count), 1);
  const maxKeyCount = Math.max(...stats.key_distribution.map((k) => k.count), 1);

  return (
    <FeatureGate featureKey="stats">
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Mes Statistiques</h1>
          <p className="text-gray-400">Analyse et suivi de ta bibliothèque</p>
        </div>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-purple-500 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-400 text-sm font-medium">Morceaux Total</h3>
            <Music className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-white">{stats.total_tracks}</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-purple-500 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-400 text-sm font-medium">Analysés</h3>
            <BarChart3 className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-white">{stats.total_analyses}</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-purple-500 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-400 text-sm font-medium">Playlists</h3>
            <Disc3 className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-white">{stats.total_playlists}</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-purple-500 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-400 text-sm font-medium">Sets</h3>
            <Zap className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-white">{stats.total_sets}</p>
        </div>
      </div>

      {/* Activity Chart */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-purple-500" />
          Activité 30 derniers jours
        </h2>
        <div className="space-y-3">
          {stats.activity_last_30_days.slice(0, 10).map((day, idx) => {
            const maxActivity = Math.max(...stats.activity_last_30_days.map((d) => d.uploads), 1);
            const width = ((day.uploads / maxActivity) * 100) || 5;
            return (
              <div key={idx} className="flex items-center gap-3">
                <div className="w-20 text-xs text-gray-400">
                  {new Date(day.date).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
                <div className="flex-1 h-6 bg-gray-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-600 to-purple-500 transition-all"
                    style={{ width: `${width}%` }}
                  />
                </div>
                <div className="w-12 text-right text-xs text-gray-400">{day.uploads} uploads</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Genre and Key Distribution */}
      <div className="grid grid-cols-2 gap-6">
        {/* Genres */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-lg font-bold text-white mb-4">Genres (Top 5)</h2>
          <div className="space-y-3">
            {stats.genres_breakdown.slice(0, 5).map((genre) => (
              <div key={genre.genre} className="flex items-center gap-3">
                <div className="w-24 text-sm text-gray-300">{genre.genre}</div>
                <div className="flex-1 h-5 bg-gray-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-blue-500 transition-all"
                    style={{ width: `${(genre.count / maxGenreCount) * 100}%` }}
                  />
                </div>
                <div className="w-8 text-right text-xs text-gray-400">{genre.count}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Keys */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-lg font-bold text-white mb-4">Tonalités (Top 5)</h2>
          <div className="space-y-3">
            {stats.key_distribution.slice(0, 5).map((key) => (
              <div key={key.key} className="flex items-center gap-3">
                <div className="w-12 text-sm text-gray-300 font-semibold">{key.key}</div>
                <div className="flex-1 h-5 bg-gray-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-600 to-green-500 transition-all"
                    style={{ width: `${(key.count / maxKeyCount) * 100}%` }}
                  />
                </div>
                <div className="w-8 text-right text-xs text-gray-400">{key.count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BPM and Other Info */}
      <div className="grid grid-cols-2 gap-6">
        {/* BPM Range */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-lg font-bold text-white mb-4">Plage BPM</h2>
          <div className="space-y-4">
            <div>
              <p className="text-gray-400 text-sm mb-1">Minimum</p>
              <p className="text-2xl font-bold text-white">{stats.bpm_range.min?.toFixed(0) || '—'} BPM</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm mb-1">Moyen</p>
              <p className="text-2xl font-bold text-purple-400">{stats.bpm_range.avg?.toFixed(0) || '—'} BPM</p>
            </div>
            <div>
              <p className="text-gray-400 text-sm mb-1">Maximum</p>
              <p className="text-2xl font-bold text-white">{stats.bpm_range.max?.toFixed(0) || '—'} BPM</p>
            </div>
          </div>
        </div>

        {/* Member Info & Storage */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="space-y-6">
            <div>
              <h3 className="text-gray-400 text-sm font-medium mb-2">Membre depuis</h3>
              <p className="text-xl font-bold text-white mb-1">
                {daysSinceMember} jours
              </p>
              <p className="text-xs text-gray-500">
                {memberSinceDate.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US')}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="w-4 h-4 text-purple-500" />
                <h3 className="text-gray-400 text-sm font-medium">Stockage estimé</h3>
              </div>
              <p className="text-xl font-bold text-white">{stats.storage_used_mb.toFixed(0)} MB</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </FeatureGate>
  );
}
