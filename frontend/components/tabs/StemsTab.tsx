// @ts-nocheck
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Track } from '@/types';
import { Play, Pause, Download, Loader2, AlertCircle, Scissors, VolumeX, Volume2 } from 'lucide-react';

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
  { key: 'vocals_url', name: 'Vocals', emoji: '🎤', desc: 'Voix / fréquences vocales',       dot: 'bg-red-400',    accent: 'border-red-400/60 bg-red-400/10'    },
  { key: 'drums_url',  name: 'Drums',  emoji: '🥁', desc: 'Percussions (HPSS)',               dot: 'bg-yellow-400', accent: 'border-yellow-400/60 bg-yellow-400/10' },
  { key: 'bass_url',   name: 'Bass',   emoji: '🎸', desc: 'Graves (0 – 200 Hz)',              dot: 'bg-purple-400', accent: 'border-purple-400/60 bg-purple-400/10' },
  { key: 'other_url',  name: 'Other',  emoji: '🎹', desc: 'Harmoniques hautes (> 3,5 kHz)',   dot: 'bg-blue-400',   accent: 'border-blue-400/60 bg-blue-400/10'   },
];

function fmt(s: number) {
  if (!isFinite(s) || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function StemsTab({ track, stemsStatus, onRequestStems }: StemsTabProps) {
  const audioRefs  = useRef<Record<string, HTMLAudioElement>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [masterPlaying, setMasterPlaying] = useState(false);
  const [mutedStems,    setMutedStems]    = useState<Set<string>>(new Set());
  const [currentTime,   setCurrentTime]   = useState(0);
  const [duration,      setDuration]      = useState(0);
  const [ready,         setReady]         = useState(false);

  const isProcessing = stemsStatus?.status === 'processing';
  const isCompleted  = stemsStatus?.status === 'completed';
  const isFailed     = stemsStatus?.status === 'failed';

  /* ── Init audio elements when stems arrive ─────────────────────────── */
  useEffect(() => {
    if (!isCompleted) return;

    let loadedCount = 0;
    const total = STEM_CONFIG.length;

    STEM_CONFIG.forEach(({ key }) => {
      const url = stemsStatus?.[key as keyof StemsStatus];
      if (!url || typeof url !== 'string') return;
      if (audioRefs.current[key]) return; // already created

      const a = new Audio(url);
      a.preload = 'auto';
      a.volume  = 1;

      a.onloadedmetadata = () => {
        setDuration(a.duration);
        loadedCount++;
        if (loadedCount === total) setReady(true);
      };
      a.onended = () => {
        setMasterPlaying(false);
        setCurrentTime(0);
        if (intervalRef.current) clearInterval(intervalRef.current);
      };

      audioRefs.current[key] = a;
    });

    return () => {
      Object.values(audioRefs.current).forEach(a => { a.pause(); a.src = ''; });
      audioRefs.current = {};
      if (intervalRef.current) clearInterval(intervalRef.current);
      setMasterPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompleted]);

  /* ── Master play / pause ────────────────────────────────────────────── */
  const toggleMaster = useCallback(() => {
    const audios = Object.values(audioRefs.current);
    if (!audios.length) return;

    if (masterPlaying) {
      audios.forEach(a => a.pause());
      if (intervalRef.current) clearInterval(intervalRef.current);
      setMasterPlaying(false);
    } else {
      // Sync all to the same position
      const refTime = audioRefs.current[STEM_CONFIG[0].key]?.currentTime ?? 0;
      audios.forEach(a => {
        a.currentTime = refTime;
        a.play().catch(() => {});
      });
      intervalRef.current = setInterval(() => {
        const a = audioRefs.current[STEM_CONFIG[0].key];
        if (a) setCurrentTime(a.currentTime);
      }, 200);
      setMasterPlaying(true);
    }
  }, [masterPlaying]);

  /* ── Seek ───────────────────────────────────────────────────────────── */
  const seek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    Object.values(audioRefs.current).forEach(a => { a.currentTime = t; });
    setCurrentTime(t);
  }, []);

  /* ── Toggle mute for a single stem ─────────────────────────────────── */
  const toggleMute = useCallback((key: string) => {
    setMutedStems(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        if (audioRefs.current[key]) audioRefs.current[key].volume = 1;
      } else {
        next.add(key);
        if (audioRefs.current[key]) audioRefs.current[key].volume = 0;
      }
      return next;
    });
  }, []);

  /* ── Render ─────────────────────────────────────────────────────────── */
  if (!track) {
    return (
      <div className="flex items-center justify-center h-48 text-[var(--text-muted)] text-sm">
        Sélectionne un morceau
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">

      {/* Processing banner */}
      {isProcessing && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300">
          <Loader2 size={15} className="animate-spin shrink-0" />
          <div>
            <p className="text-xs font-semibold">Séparation en cours…</p>
            <p className="text-[10px] text-blue-300/70">HPSS + filtres fréquentiels · ~1–2 min</p>
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

      {/* ── Stem cards ─────────────────────────────────────── */}
      {isCompleted && (
        <>
          {/* Hint */}
          <p className="text-[10px] text-[var(--text-muted)] px-1 leading-relaxed">
            🎛️ <strong>Clique sur un stem</strong> pour le couper / le réactiver · écoute le mix en temps réel avant de télécharger
          </p>

          <div className="space-y-2">
            {STEM_CONFIG.map(({ key, name, emoji, desc, dot, accent }) => {
              const url    = stemsStatus?.[key as keyof StemsStatus];
              const avail  = typeof url === 'string' && url.length > 0;
              const muted  = mutedStems.has(key);

              return (
                <div
                  key={key}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    muted
                      ? 'opacity-40 bg-[var(--bg-card)] border-[var(--border-subtle)] scale-[0.98]'
                      : avail
                        ? `${accent} border`
                        : 'bg-[var(--bg-card)] border-[var(--border-subtle)] opacity-50'
                  }`}
                >
                  <span className="text-base w-6 text-center select-none">{emoji}</span>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${dot} ${muted ? 'opacity-30' : ''}`} />

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                      {name}
                      {muted && (
                        <span className="text-[9px] font-normal text-red-400 bg-red-400/10 border border-red-400/30 rounded px-1 py-0">
                          COUPÉ
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)] truncate">{desc}</p>
                  </div>

                  {avail && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Mute toggle */}
                      <button
                        onClick={() => toggleMute(key)}
                        title={muted ? `Réactiver ${name}` : `Couper ${name}`}
                        className={`p-1.5 rounded-lg border text-[11px] transition-all cursor-pointer ${
                          muted
                            ? 'bg-red-500/20 border-red-500/50 text-red-400'
                            : 'bg-transparent border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-red-400/50 hover:text-red-400'
                        }`}
                      >
                        {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                      </button>

                      {/* Download */}
                      <a
                        href={url as string}
                        download={`${track?.title ?? 'track'}_${name.toLowerCase()}.mp3`}
                        className="p-1.5 rounded-lg bg-transparent border border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)] transition-all"
                        title={`Télécharger ${name}`}
                      >
                        <Download size={12} />
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Master player ──────────────────────────────── */}
          <div className="mt-3 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleMaster}
                disabled={!ready}
                title={masterPlaying ? 'Pause' : 'Écouter le mix'}
                className={`w-8 h-8 flex items-center justify-center rounded-full border transition-all shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  masterPlaying
                    ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white'
                    : 'bg-transparent border-[var(--border-default)] text-[var(--text-muted)] hover:text-white hover:border-[var(--accent-primary)]'
                }`}
              >
                {masterPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>

              <div className="flex-1 flex flex-col gap-1">
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={seek}
                  className="w-full h-1.5 accent-[var(--accent-primary)] cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-[var(--text-muted)]">
                  <span>{fmt(currentTime)}</span>
                  <span>
                    {mutedStems.size > 0
                      ? `${mutedStems.size} stem${mutedStems.size > 1 ? 's' : ''} coupé${mutedStems.size > 1 ? 's' : ''}`
                      : 'Mix complet'}
                  </span>
                  <span>{fmt(duration)}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* No stems yet */}
      {!isCompleted && !isProcessing && (
        <>
          <p className="text-[10px] text-[var(--text-muted)] leading-relaxed px-1">
            Utilise <strong>HPSS</strong> (Harmonic-Percussive Source Separation) + filtres fréquentiels.<br />
            Qualité correcte pour DJ use, pas de GPU nécessaire.
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
