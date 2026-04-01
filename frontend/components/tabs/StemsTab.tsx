// @ts-nocheck
'use client';

import { Download, Loader2, AlertCircle, Scissors } from 'lucide-react';
import { Track } from '@/types';

interface StemsStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string | null;
  vocals_url?: string | null;
  drums_url?: string | null;
  bass_url?: string | null;
  other_url?: string | null;
}

interface StemsTabProps {
  track: Track | null;
  stemsStatus?: StemsStatus | null;
  mutedStems?: Set<string>;
  onToggleMute?: (key: string) => void;
  onRequestStems?: () => void;
}

const STEM_CONFIG = [
  {
    key: 'vocals_url',
    name: 'Vocals',
    emoji: '🎤',
    desc: 'Voix & fréquences vocales',
    color: 'from-red-500/30 to-red-500/5',
    border: 'border-red-400/40',
    dot: 'bg-red-400',
    glow: 'shadow-red-500/20',
  },
  {
    key: 'drums_url',
    name: 'Drums',
    emoji: '🥁',
    desc: 'Percussions & batterie',
    color: 'from-yellow-500/30 to-yellow-500/5',
    border: 'border-yellow-400/40',
    dot: 'bg-yellow-400',
    glow: 'shadow-yellow-500/20',
  },
  {
    key: 'bass_url',
    name: 'Bass',
    emoji: '🎸',
    desc: 'Graves (0 – 200 Hz)',
    color: 'from-purple-500/30 to-purple-500/5',
    border: 'border-purple-400/40',
    dot: 'bg-purple-400',
    glow: 'shadow-purple-500/20',
  },
  {
    key: 'other_url',
    name: 'Other',
    emoji: '🎹',
    desc: 'Harmoniques & synthés',
    color: 'from-blue-500/30 to-blue-500/5',
    border: 'border-blue-400/40',
    dot: 'bg-blue-400',
    glow: 'shadow-blue-500/20',
  },
];

function downloadAll(stemsStatus: StemsStatus, mutedStems: Set<string>, trackTitle: string) {
  STEM_CONFIG.forEach(({ key, name }) => {
    if (mutedStems.has(key)) return; // skip muted
    const url = stemsStatus[key as keyof StemsStatus];
    if (!url || typeof url !== 'string') return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${trackTitle}_${name.toLowerCase()}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}

export function StemsTab({
  track,
  stemsStatus,
  mutedStems = new Set(),
  onToggleMute,
  onRequestStems,
}: StemsTabProps) {
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

  const activeCount = STEM_CONFIG.filter(({ key }) => {
    const url = stemsStatus?.[key as keyof StemsStatus];
    return typeof url === 'string' && url.length > 0 && !mutedStems.has(key);
  }).length;

  return (
    <div className="p-4 space-y-3">

      {/* Processing banner */}
      {isProcessing && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300">
          <Loader2 size={15} className="animate-spin shrink-0" />
          <div>
            <p className="text-xs font-semibold">Séparation en cours…</p>
            <p className="text-[10px] text-blue-300/70">Demucs AI · qualité DJ · ~3–5 min</p>
          </div>
        </div>
      )}

      {isFailed && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300">
          <AlertCircle size={15} className="shrink-0" />
          <div>
            <p className="text-xs font-semibold">Erreur lors de la séparation</p>
            <p className="text-[10px] text-red-300/70 break-all">
              {stemsStatus?.error || 'Vérifie que le fichier audio est présent sur le serveur'}
            </p>
            {onRequestStems && (
              <button
                onClick={onRequestStems}
                className="mt-1.5 text-[10px] text-red-300 underline hover:text-red-200 cursor-pointer"
              >
                Réessayer
              </button>
            )}
          </div>
        </div>
      )}

      {/* Completed — stem cards */}
      {isCompleted && (
        <>
          <p className="text-[10px] text-[var(--text-muted)] px-0.5">
            🎛️ <strong>Clique</strong> pour couper/activer un stem dans la lecture
          </p>

          <div className="grid grid-cols-2 gap-2">
            {STEM_CONFIG.map(({ key, name, emoji, desc, color, border, dot, glow }) => {
              const url   = stemsStatus?.[key as keyof StemsStatus];
              const avail = typeof url === 'string' && url.length > 0;
              const muted = mutedStems.has(key);

              return (
                <div key={key} className="relative group">
                  {/* Main clickable card */}
                  <button
                    onClick={() => avail && onToggleMute?.(key)}
                    disabled={!avail}
                    title={muted ? `Réactiver ${name}` : `Couper ${name}`}
                    className={`
                      w-full text-left rounded-xl border p-3 transition-all duration-200 cursor-pointer
                      bg-gradient-to-br ${color} ${border}
                      ${muted
                        ? 'opacity-35 scale-[0.97] grayscale'
                        : `shadow-lg ${glow} hover:scale-[1.02] hover:brightness-110`
                      }
                      ${!avail ? 'opacity-25 cursor-not-allowed grayscale' : ''}
                    `}
                  >
                    <div className="text-3xl mb-2 leading-none">{emoji}</div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                      <span className="text-xs font-bold text-[var(--text-primary)]">{name}</span>
                    </div>
                    <p className="text-[9px] text-[var(--text-muted)] leading-tight">{desc}</p>
                    {muted && (
                      <div className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40">
                        <span className="text-[8px] font-bold text-red-400 tracking-wide">COUPÉ</span>
                      </div>
                    )}
                    {isProcessing && !avail && (
                      <Loader2 size={12} className="mt-1 text-[var(--text-muted)] animate-spin" />
                    )}
                  </button>

                  {/* Individual download — apparaît au survol */}
                  {avail && (
                    <a
                      href={url as string}
                      download={`${track?.title ?? 'track'}_${name.toLowerCase()}.mp3`}
                      title={`Télécharger ${name}`}
                      onClick={e => e.stopPropagation()}
                      className="
                        absolute bottom-2 right-2 p-1 rounded-md
                        bg-black/40 border border-white/10
                        text-white/50 hover:text-white hover:bg-black/60
                        transition-all opacity-0 group-hover:opacity-100 z-10
                      "
                    >
                      <Download size={11} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {/* Status + Download all active */}
          <div className="flex items-center gap-2 pt-1">
            <p className="text-[9px] text-[var(--text-muted)] flex-1">
              {mutedStems.size === 0
                ? '✅ Mix complet — tous les stems actifs'
                : `🔇 ${mutedStems.size} stem${mutedStems.size > 1 ? 's' : ''} coupé${mutedStems.size > 1 ? 's' : ''}`}
            </p>
            <button
              onClick={() => stemsStatus && downloadAll(stemsStatus, mutedStems, track?.title ?? 'track')}
              disabled={activeCount === 0}
              title={`Télécharger les ${activeCount} stems actifs`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 text-[var(--accent-primary)] text-[10px] font-semibold hover:bg-[var(--accent-primary)]/25 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              <Download size={11} />
              Télécharger ({activeCount})
            </button>
          </div>
        </>
      )}

      {/* Not started */}
      {!isCompleted && !isProcessing && (
        <>
          <p className="text-[10px] text-[var(--text-muted)] leading-relaxed px-1">
            Utilise <strong>Demucs</strong> (Meta AI) — séparation deep learning qualité DJ.<br />
            4 stems: voix, drums, basse, instruments · ~3–5 min par track.
          </p>
          <button
            onClick={onRequestStems}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors cursor-pointer border-none"
          >
            <Scissors size={14} /> Séparer les stems
          </button>
        </>
      )}
    </div>
  );
}

export default StemsTab;
