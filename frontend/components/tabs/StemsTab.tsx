'use client';

import { Track } from '@/types';
import { Play, Download, Loader2, AlertCircle } from 'lucide-react';

interface StemsStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  vocals_url?: string | null;
  drums_url?: string | null;
  bass_url?: string | null;
  other_url?: string | null;
}

interface StemsTabProps {
  track: Track | null;
  stemsStatus?: StemsStatus | null;
  onRequestStems?: () => void;
}

export function StemsTab({
  track,
  stemsStatus,
  onRequestStems,
}: StemsTabProps) {
  if (!track) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <p>Sélectionne un morceau</p>
      </div>
    );
  }

  const stems = [
    { name: 'Vocals', key: 'vocals_url', color: 'text-red-400' },
    { name: 'Drums', key: 'drums_url', color: 'text-yellow-400' },
    { name: 'Bass', key: 'bass_url', color: 'text-purple-400' },
    { name: 'Other', key: 'other_url', color: 'text-blue-400' },
  ];

  const isProcessing = stemsStatus?.status === 'processing';
  const isCompleted = stemsStatus?.status === 'completed';
  const isFailed = stemsStatus?.status === 'failed';

  return (
    <div className="space-y-4 p-4">
      {/* Status Indicator */}
      {isProcessing && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-900/30 border border-blue-800 text-blue-300">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Séparation des stems en cours...</span>
        </div>
      )}

      {isFailed && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">Erreur lors de la séparation</span>
        </div>
      )}

      {/* Stems Grid */}
      <div className="space-y-3">
        {stems.map((stem) => {
          const url = stemsStatus?.[stem.key as keyof StemsStatus];
          const isAvailable = url && typeof url === 'string';

          return (
            <div
              key={stem.name}
              className="flex items-center gap-3 p-3 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-700"
            >
              <div className={`w-3 h-3 rounded-full ${stem.color}`} />
              <div className="flex-1">
                <div className="text-sm font-medium text-white">{stem.name}</div>
                <div className="text-xs text-gray-400">
                  {isAvailable ? 'Disponible' : isProcessing ? 'En cours...' : 'Non disponible'}
                </div>
              </div>

              <div className="flex gap-2">
                {isAvailable && (
                  <>
                    <button
                      className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                      title="Lire"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                    <a
                      href={url}
                      download
                      className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                      title="Télécharger"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </>
                )}
                {isProcessing && (
                  <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Button */}
      {!isCompleted && !isProcessing && (
        <button
          onClick={onRequestStems}
          className="w-full px-4 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
        >
          Séparer les stems
        </button>
      )}
    </div>
  );
}
