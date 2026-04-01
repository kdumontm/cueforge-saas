// @ts-nocheck
'use client';

import { useState } from 'react';
import { Track } from '@/types';
import { Play, Pause, Download, Loader2, AlertCircle, Scissors } from 'lucide-react';

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

const STEM_CONFIG = [
  { key: 'vocals_url', name: 'Vocals',  emoji: '🎤', desc: 'Fréquences vocales (200 Hz – 3,5 kHz)', dot: 'bg-red-400'    },
  { key: 'drums_url',  name: 'Drums',   emoji: '🥁', desc: 'Composante percussive (HPSS)',          dot: 'bg-yellow-400' },
  { key: 'bass_url',   name: 'Bass',    emoji: '🎸', desc: 'Graves (0 – 200 Hz)',                   dot: 'bg-purple-400' },
  { key: 'other_url',  name: 'Other',   emoji: '🎹', desc: 'Hautes fréquences (> 3,5 kHz)',         dot: 'bg-blue-400'   },
];

export function StemsTab({ track, stemsStatus, onRequestStems }: StemsTabProps) {
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [audioEls] = useState<Record<string, HTMLAudioElement>>({});

  if (!track) {
    return (
      <div className="flex items-center justify-center h-48 text-[var(--text-muted)] text-sm">
        Sélectionne un morceau
      </div>
    );
  }

  const isProcessing = stemsStatus?.status === 'processing';
  const isCompleted  = stemsStatus?.status === 'completed';
  const isFailed     = stemsStatus?.status === 'failed';

  const togglePlay = (key: string, url: string) => {
    if (playingKey === key) {
      audioEls[key]?.pause();
      setPlayingKey(null);
    } else {
      // Stop any playing
      if (playingKey && audioEls[playingKey]) audioEls[playingKey].pause();
      if (!audioEls[key]) {
        const a = new Audio(url);
        a.onended = () => setPlayingKey(null);
        audioEls[key] = a;
      }
      audioEls[key].play();
      setPlayingKey(key);
    }
  };

  return (
    <div className="p-4 space-y-3">

      {/* Processing banner */}
      {isProcessing && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300">
          <Loader2 size={15} className="animate-spin shrink-0" />
          <div>
            <p className="text-xs font-semibold">Séparation en cours…</p>
            <p className="text-[10px] text-blue-300/70">HPSS + filtres fréquentiels · ~1–2 min selon la durée du track</p>
          </div>
        </div>
      )}

      {isFailed && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300">
          <AlertCircle size={15} className="shrink-0" />
          <div>
            <p className="text-xs font-semibold">Erreur lors de la séparation</p>
            <p className="text-[10px] text-red-300/70">Vérifie que le fichier audio est présent sur le serveur</p>
          </div>
        </div>
      )}

      {/* Stems list */}
      <div className="space-y-2">
        {STEM_CONFIG.map(({ key, name, emoji, desc, dot }) => {
          const url = stemsStatus?.[key as keyof StemsStatus];
          const available = typeof url === 'string' && url.length > 0;
          const playing = playingKey === key;

          return (
            <div
              key={key}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                available
                  ? 'bg-[var(--bg-elevated)] border-[var(--border-default)]'
                  : 'bg-[var(--bg-card)] border-[var(--border-subtle)] opacity-60'
              }`}
            >
              <span className="text-base w-6 text-center">{emoji}</span>
              <div className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[var(--text-primary)]">{name}</p>
                <p className="text-[10px] text-[var(--text-muted)] truncate">{desc}</p>
              </div>

              {available && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => togglePlay(key, url as string)}
                    className={`p-1.5 rounded-lg border text-[11px] transition-all cursor-pointer ${
                      playing
                        ? 'bg-[var(--accent-primary)]/20 border-[var(--accent-primary)]/50 text-[var(--accent-primary)]'
                        : 'bg-transparent border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)]'
                    }`}
                    title={playing ? 'Pause' : 'Écouter'}
                  >
                    {playing ? <Pause size={12} /> : <Play size={12} />}
                  </button>
                  <a
                    href={url as string}
                    download={`${name.toLowerCase()}.mp3`}
                    className="p-1.5 rounded-lg bg-transparent border border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)] transition-all"
                    title="Télécharger"
                  >
                    <Download size={12} />
                  </a>
                </div>
              )}

              {isProcessing && !available && (
                <Loader2 size={13} className="text-[var(--text-muted)] animate-spin shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Info note */}
      {!isCompleted && !isProcessing && (
        <p className="text-[10px] text-[var(--text-muted)] leading-relaxed px-1">
          Utilise <strong>HPSS</strong> (Harmonic-Percussive Source Separation) + filtres fréquentiels.<br />
          Qualité correcte pour DJ use, pas de GPU nécessaire.
        </p>
      )}

      {/* CTA button */}
      {!isCompleted && !isProcessing && (
        <button
          onClick={onRequestStems}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors cursor-pointer border-none"
        >
          <Scissors size={14} /> Séparer les stems
        </button>
      )}

      {isCompleted && (
        <p className="text-[10px] text-center text-[var(--text-muted)]">
          ✅ Stems générés — écoute ou télécharge chaque piste ci-dessus
        </p>
      )}
    </div>
  );
}

export default StemsTab;
