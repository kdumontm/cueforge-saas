'use client';
import { useEffect, useState } from 'react';
import { Music2, ChevronDown, AlertCircle, CheckCircle2, Music } from 'lucide-react';
import { getTracks, compareTracksAPI } from '@/lib/api';

interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  bpm?: number;
  key?: string;
  energy?: number;
  genre?: string;
  duration?: number;
  cue_points?: any[];
}

interface ComparisonData {
  track_a_details: Track;
  track_b_details: Track;
  compatibility_score: number;
  bpm_diff: number;
  key_compatible: boolean;
  energy_diff: number;
  transition_tips: string[];
}

export default function ComparePage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackA, setSelectedTrackA] = useState<string>('');
  const [selectedTrackB, setSelectedTrackB] = useState<string>('');
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadTracks = async () => {
      try {
        const data = await getTracks();
        setTracks((data.tracks || []) as unknown as Track[]);
      } catch (err) {
        setError('Erreur lors du chargement des tracks');
      }
    };
    loadTracks();
  }, []);

  const handleCompare = async () => {
    if (!selectedTrackA || !selectedTrackB) {
      setError('Sélectionne deux tracks');
      return;
    }
    if (selectedTrackA === selectedTrackB) {
      setError('Sélectionne deux tracks différents');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await compareTracksAPI(selectedTrackA, selectedTrackB);
      setComparison(data);
    } catch (err) {
      setError('Erreur lors de la comparaison');
    } finally {
      setLoading(false);
    }
  };

  const getBPMColor = (diff: number) => {
    if (diff < 3) return 'text-green-500';
    if (diff < 6) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getCompatibilityColor = (score: number) => {
    if (score >= 75) return 'from-green-600 to-emerald-600';
    if (score >= 50) return 'from-yellow-600 to-orange-600';
    return 'from-red-600 to-pink-600';
  };

  const getRecommendation = (score: number) => {
    if (score >= 75) return 'Parfait pour enchaîner';
    if (score >= 50) return 'Transition possible';
    return 'Peu compatible';
  };

  return (
    <div className="min-h-screen bg-bg-primary pt-20">
      <div className="max-w-7xl mx-auto px-6 pb-20">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-white mb-2">Comparer deux tracks</h1>
          <p className="text-slate-400">Analyse la compatibilité BPM, tonalité et énergie entre deux morceaux</p>
        </div>

        {/* Track Selection */}
        <div className="bg-bg-secondary border border-slate-800/50 rounded-2xl p-6 mb-8">
          <h2 className="text-white font-semibold mb-6">Sélectionne deux tracks</h2>
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            {/* Track A */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Track A</label>
              <div className="relative">
                <select
                  value={selectedTrackA}
                  onChange={(e) => setSelectedTrackA(e.target.value)}
                  className="w-full px-4 py-3 bg-bg-elevated border border-slate-700/50 rounded-lg text-white focus:border-accent-purple outline-none appearance-none cursor-pointer"
                >
                  <option value="">Sélectionne un track...</option>
                  {tracks.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.title} — {t.artist}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>

            {/* Track B */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Track B</label>
              <div className="relative">
                <select
                  value={selectedTrackB}
                  onChange={(e) => setSelectedTrackB(e.target.value)}
                  className="w-full px-4 py-3 bg-bg-elevated border border-slate-700/50 rounded-lg text-white focus:border-accent-purple outline-none appearance-none cursor-pointer"
                >
                  <option value="">Sélectionne un track...</option>
                  {tracks.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.title} — {t.artist}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm mb-6">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <button
            onClick={handleCompare}
            disabled={loading}
            className="w-full px-6 py-3 bg-accent-purple hover:bg-accent-purple-light disabled:opacity-50 text-white font-semibold rounded-lg transition-all"
          >
            {loading ? 'Comparaison en cours...' : 'Comparer'}
          </button>
        </div>

        {comparison && (
          <>
            {/* Compatibility Score */}
            <div className={`bg-gradient-to-br ${getCompatibilityColor(comparison.compatibility_score)} rounded-2xl p-8 mb-8 text-white`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">Compatibilité Mix</h2>
                <CheckCircle2 size={32} />
              </div>
              <div className="text-5xl font-bold mb-2">{Math.round(comparison.compatibility_score)}%</div>
              <p className="text-lg font-semibold opacity-90 mb-6">{getRecommendation(comparison.compatibility_score)}</p>

              {comparison.transition_tips.length > 0 && (
                <div className="bg-white/10 rounded-lg p-4">
                  <h3 className="font-semibold mb-2">Tips de transition:</h3>
                  <ul className="space-y-1 text-sm">
                    {comparison.transition_tips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-yellow-300">•</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Comparison Grid */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Track A Details */}
              <div className="bg-bg-secondary border border-slate-800/50 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-6 pb-6 border-b border-slate-700/50">
                  <div className="w-10 h-10 rounded-lg bg-accent-purple/20 flex items-center justify-center">
                    <Music2 size={20} className="text-accent-purple" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">{comparison.track_a_details.title}</h3>
                    <p className="text-slate-400 text-sm">{comparison.track_a_details.artist}</p>
                  </div>
                </div>

                {comparison.track_a_details.album && (
                  <div className="mb-4">
                    <span className="text-xs text-slate-500 uppercase">Album</span>
                    <p className="text-white">{comparison.track_a_details.album}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <span className="text-xs text-slate-500 uppercase">BPM</span>
                    <p className="text-2xl font-bold text-white">{comparison.track_a_details.bpm}</p>
                  </div>

                  {comparison.track_a_details.key && (
                    <div>
                      <span className="text-xs text-slate-500 uppercase">Tonalité</span>
                      <p className="text-2xl font-bold text-white">{comparison.track_a_details.key}</p>
                    </div>
                  )}

                  {comparison.track_a_details.energy !== undefined && (
                    <div>
                      <span className="text-xs text-slate-500 uppercase">Énergie</span>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-2 bg-bg-elevated rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
                            style={{ width: `${comparison.track_a_details.energy}%` }}
                          />
                        </div>
                        <span className="text-white font-semibold">{comparison.track_a_details.energy}%</span>
                      </div>
                    </div>
                  )}

                  {comparison.track_a_details.genre && (
                    <div>
                      <span className="text-xs text-slate-500 uppercase">Genre</span>
                      <p className="text-white">{comparison.track_a_details.genre}</p>
                    </div>
                  )}

                  {comparison.track_a_details.duration && (
                    <div>
                      <span className="text-xs text-slate-500 uppercase">Durée</span>
                      <p className="text-white font-mono">{Math.floor(comparison.track_a_details.duration / 60000)}:{String(Math.floor((comparison.track_a_details.duration % 60000) / 1000)).padStart(2, '0')}</p>
                    </div>
                  )}

                  {comparison.track_a_details.cue_points && (
                    <div>
                      <span className="text-xs text-slate-500 uppercase">Cue Points</span>
                      <p className="text-white">{comparison.track_a_details.cue_points.length}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Track B Details */}
              <div className="bg-bg-secondary border border-slate-800/50 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-6 pb-6 border-b border-slate-700/50">
                  <div className="w-10 h-10 rounded-lg bg-accent-pink/20 flex items-center justify-center">
                    <Music2 size={20} className="text-accent-pink" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">{comparison.track_b_details.title}</h3>
                    <p className="text-slate-400 text-sm">{comparison.track_b_details.artist}</p>
                  </div>
                </div>

                {comparison.track_b_details.album && (
                  <div className="mb-4">
                    <span className="text-xs text-slate-500 uppercase">Album</span>
                    <p className="text-white">{comparison.track_b_details.album}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <span className="text-xs text-slate-500 uppercase">BPM</span>
                    <p className="text-2xl font-bold text-white">{comparison.track_b_details.bpm}</p>
                  </div>

                  {comparison.track_b_details.key && (
                    <div>
                      <span className="text-xs text-slate-500 uppercase">Tonalité</span>
                      <p className="text-2xl font-bold text-white">{comparison.track_b_details.key}</p>
                    </div>
                  )}

                  {comparison.track_b_details.energy !== undefined && (
                    <div>
                      <span className="text-xs text-slate-500 uppercase">Énergie</span>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-2 bg-bg-elevated rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
                            style={{ width: `${comparison.track_b_details.energy}%` }}
                          />
                        </div>
                        <span className="text-white font-semibold">{comparison.track_b_details.energy}%</span>
                      </div>
                    </div>
                  )}

                  {comparison.track_b_details.genre && (
                    <div>
                      <span className="text-xs text-slate-500 uppercase">Genre</span>
                      <p className="text-white">{comparison.track_b_details.genre}</p>
                    </div>
                  )}

                  {comparison.track_b_details.duration && (
                    <div>
                      <span className="text-xs text-slate-500 uppercase">Durée</span>
                      <p className="text-white font-mono">{Math.floor(comparison.track_b_details.duration / 60000)}:{String(Math.floor((comparison.track_b_details.duration % 60000) / 1000)).padStart(2, '0')}</p>
                    </div>
                  )}

                  {comparison.track_b_details.cue_points && (
                    <div>
                      <span className="text-xs text-slate-500 uppercase">Cue Points</span>
                      <p className="text-white">{comparison.track_b_details.cue_points.length}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Comparison Metrics */}
            <div className="grid md:grid-cols-3 gap-6 mt-8">
              {/* BPM Diff */}
              <div className="bg-bg-secondary border border-slate-800/50 rounded-2xl p-6">
                <h3 className="text-white font-semibold mb-4">Différence BPM</h3>
                <div className="flex items-center gap-3">
                  <span className={`text-3xl font-bold ${getBPMColor(comparison.bpm_diff)}`}>
                    {comparison.bpm_diff}
                  </span>
                  <span className="text-slate-400 text-sm">BPM</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {comparison.bpm_diff < 3 ? '✓ Vert' : comparison.bpm_diff < 6 ? '⚠ Orange' : '✗ Rouge'}
                </p>
              </div>

              {/* Key Compatible */}
              <div className="bg-bg-secondary border border-slate-800/50 rounded-2xl p-6">
                <h3 className="text-white font-semibold mb-4">Harmonie</h3>
                <div className={`text-3xl font-bold ${comparison.key_compatible ? 'text-green-500' : 'text-red-500'}`}>
                  {comparison.key_compatible ? '✓ Compatible' : '✗ Incompatible'}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {comparison.key_compatible ? 'Cercle de Camelot OK' : 'Transition harmonique difficile'}
                </p>
              </div>

              {/* Energy Diff */}
              <div className="bg-bg-secondary border border-slate-800/50 rounded-2xl p-6">
                <h3 className="text-white font-semibold mb-4">Différence Énergie</h3>
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-bold text-white">
                    {comparison.energy_diff}
                  </span>
                  <span className="text-slate-400 text-sm">%</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {comparison.energy_diff < 2 ? '✓ Bonne' : '⚠ À adapter'}
                </p>
              </div>
            </div>
          </>
        )}

        {!comparison && !loading && (
          <div className="text-center py-20">
            <Music size={48} className="text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">Sélectionne deux tracks pour voir la comparaison</p>
          </div>
        )}
      </div>
    </div>
  );
}
