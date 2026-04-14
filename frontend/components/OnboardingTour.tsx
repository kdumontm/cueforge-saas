// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Upload, Zap, Music, Download, Target, Layers, ChevronRight, ChevronLeft, X, Sparkles } from 'lucide-react';

interface TourStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  tip?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Bienvenue sur TrackCue !',
    description: 'L\'outil ultime pour les DJs. Analyse tes morceaux, génère des cue points pro, et prépare tes sets comme un pro.',
    icon: <Sparkles size={28} className="text-yellow-400" />,
    tip: 'Ce tour ne s\'affiche qu\'une seule fois. Tu peux le relancer dans les paramètres.',
  },
  {
    title: '1. Importe tes morceaux',
    description: 'Glisse tes fichiers audio (MP3, WAV, FLAC…) dans la zone d\'upload ou clique "Importer" dans le menu. Tu peux uploader plusieurs fichiers à la fois.',
    icon: <Upload size={28} className="text-blue-400" />,
    tip: 'Les fichiers supportés : MP3, WAV, FLAC, AIFF, OGG, M4A',
  },
  {
    title: '2. Analyse automatique',
    description: 'TrackCue analyse le BPM, la tonalité, l\'énergie et la structure de chaque morceau. Les cue points sont générés automatiquement sur les mesures.',
    icon: <Zap size={28} className="text-purple-400" />,
    tip: 'L\'analyse utilise l\'IA pour détecter intros, drops, breakdowns et outros.',
  },
  {
    title: '3. Édite tes cue points',
    description: 'Clique sur l\'onglet "Cues" à droite pour voir, modifier ou ajouter des cue points. Clique ▶ pour pré-écouter un cue pendant 5 secondes.',
    icon: <Target size={28} className="text-green-400" />,
    tip: 'Les cue points sont synchronisés sur les mesures (4 temps = 1 mesure).',
  },
  {
    title: '4. Score de compatibilité',
    description: 'Sélectionne un morceau et la colonne "Mix" t\'indique la compatibilité harmonique et BPM avec les autres tracks de ta bibliothèque.',
    icon: <Music size={28} className="text-cyan-400" />,
    tip: 'Vert = parfait, Bleu = bon, Orange = possible, Rouge = risqué.',
  },
  {
    title: '5. Exporte vers ton logiciel DJ',
    description: 'Exporte tes morceaux avec les cue points vers Rekordbox (XML), Serato (.crate) ou Traktor (.nml). Tout est prêt pour le live !',
    icon: <Download size={28} className="text-orange-400" />,
    tip: 'Utilise le menu "Exporter" dans la sidebar ou le bouton dans la track list.',
  },
  {
    title: 'C\'est parti !',
    description: 'Tu es prêt à utiliser TrackCue. Commence par importer un morceau pour voir la magie opérer.',
    icon: <Layers size={28} className="text-pink-400" />,
    tip: 'Raccourcis : Espace = Play/Pause, ← → = Skip, 1-8 = Cue points.',
  },
];

const ONBOARDING_KEY = 'trackcue_onboarding_done';

interface OnboardingTourProps {
  forceShow?: boolean;
}

export default function OnboardingTour({ forceShow = false }: OnboardingTourProps) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (forceShow) {
      setVisible(true);
      setStep(0);
      return;
    }
    try {
      const done = window.localStorage?.getItem(ONBOARDING_KEY);
      if (!done) setVisible(true);
    } catch {
      // SSR or privacy mode
    }
  }, [forceShow]);

  const close = useCallback(() => {
    setVisible(false);
    try { window.localStorage?.setItem(ONBOARDING_KEY, '1'); } catch {}
  }, []);

  const next = () => {
    if (step < TOUR_STEPS.length - 1) setStep(s => s + 1);
    else close();
  };

  const prev = () => {
    if (step > 0) setStep(s => s - 1);
  };

  if (!visible) return null;

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;
  const progress = ((step + 1) / TOUR_STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />

      {/* Card */}
      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, var(--bg-card) 0%, var(--bg-primary) 100%)',
          border: '1px solid var(--border-default)',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        }}
      >
        {/* Progress bar */}
        <div className="h-1 bg-[var(--bg-primary)]">
          <div
            className="h-full transition-all duration-500 ease-out rounded-r"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)',
            }}
          />
        </div>

        {/* Close button */}
        <button
          onClick={close}
          className="absolute top-4 right-4 p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors z-10"
        >
          <X size={18} />
        </button>

        {/* Content */}
        <div className="p-8 text-center">
          {/* Icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {current.icon}
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-3">
            {current.title}
          </h2>

          {/* Description */}
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
            {current.description}
          </p>

          {/* Tip */}
          {current.tip && (
            <div className="px-4 py-2.5 rounded-xl mb-6 text-xs text-[var(--text-muted)]"
              style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}
            >
              {current.tip}
            </div>
          )}

          {/* Step dots */}
          <div className="flex justify-center gap-1.5 mb-6">
            {TOUR_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                  i === step ? 'w-6 bg-blue-500' : i < step ? 'bg-blue-500/40' : 'bg-[var(--text-muted)]/20'
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={prev}
                className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              >
                <ChevronLeft size={16} /> Précédent
              </button>
            )}
            <button
              onClick={next}
              className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all cursor-pointer"
              style={{
                background: isLast
                  ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                  : 'linear-gradient(135deg, #3b82f6, #6366f1)',
                boxShadow: isLast
                  ? '0 4px 12px rgba(34,197,94,0.3)'
                  : '0 4px 12px rgba(59,130,246,0.3)',
              }}
            >
              {isLast ? 'C\'est parti !' : 'Suivant'} <ChevronRight size={16} />
            </button>
          </div>

          {/* Skip */}
          {!isLast && (
            <button
              onClick={close}
              className="mt-3 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer bg-transparent border-none"
            >
              Passer le tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
