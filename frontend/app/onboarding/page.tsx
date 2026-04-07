'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useLang } from '@/components/LangProvider';
import { tr } from '@/lib/i18n';

const DJ_STYLES = ['Club', 'Mariage', 'Radio', 'Festival', 'Autre'];
const DJ_SOFTWARE = ['Rekordbox', 'Serato', 'Traktor', 'VirtualDJ', 'Autre'];

type OnboardingStep = 'style' | 'software' | 'upload' | 'complete';

export default function OnboardingPage() {
  const { lang } = useLang();
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>('style');
  const [djStyle, setDjStyle] = useState('');
  const [djSoftware, setDjSoftware] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const steps: OnboardingStep[] = ['style', 'software', 'upload', 'complete'];
  const currentStepIndex = steps.indexOf(step);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const handleNext = async () => {
    if (step === 'style' && !djStyle) {
      setError('Veuillez sélectionner un style DJ');
      return;
    }
    if (step === 'software' && !djSoftware) {
      setError('Veuillez sélectionner un logiciel DJ');
      return;
    }

    setError('');

    if (step === 'upload') {
      // Save preferences and complete
      await completeOnboarding();
      return;
    }

    // Move to next step
    const nextIndex = currentStepIndex + 1;
    setStep(steps[nextIndex]);
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setStep(steps[currentStepIndex - 1]);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      await fetch('/api/v1/profile/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          dj_style: djStyle || null,
          dj_software: djSoftware || null,
          onboarding_completed: true,
        }),
      });
      router.push('/dashboard');
    } catch (err) {
      setError('Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  const completeOnboarding = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      await fetch('/api/v1/profile/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          dj_style: djStyle,
          dj_software: djSoftware,
          onboarding_completed: true,
        }),
      });
      router.push('/dashboard');
    } catch (err) {
      setError('Erreur lors de la sauvegarde');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex flex-col items-center justify-center p-4">
      {/* Progress bar */}
      <div className="w-full max-w-2xl mb-8">
        <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Card container */}
      <div className="w-full max-w-2xl bg-gray-800 rounded-lg shadow-2xl p-8">
        {/* Step 1: DJ Style */}
        {step === 'style' && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-white">
              Bienvenue sur CueForge!
            </h1>
            <p className="text-gray-400 text-lg">
              Quel est ton style DJ principal?
            </p>
            <div className="grid grid-cols-2 gap-3">
              {DJ_STYLES.map((style) => (
                <button
                  key={style}
                  onClick={() => setDjStyle(style)}
                  className={`p-4 rounded-lg font-semibold transition-all ${
                    djStyle === style
                      ? 'bg-purple-600 text-white border-2 border-purple-400'
                      : 'bg-gray-700 text-gray-200 border-2 border-transparent hover:bg-gray-600'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
          </div>
        )}

        {/* Step 2: DJ Software */}
        {step === 'software' && (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-white">
              Ton logiciel DJ
            </h2>
            <p className="text-gray-400 text-lg">
              Lequel utilises-tu?
            </p>
            <div className="grid grid-cols-2 gap-3">
              {DJ_SOFTWARE.map((software) => (
                <button
                  key={software}
                  onClick={() => setDjSoftware(software)}
                  className={`p-4 rounded-lg font-semibold transition-all ${
                    djSoftware === software
                      ? 'bg-purple-600 text-white border-2 border-purple-400'
                      : 'bg-gray-700 text-gray-200 border-2 border-transparent hover:bg-gray-600'
                  }`}
                >
                  {software}
                </button>
              ))}
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
          </div>
        )}

        {/* Step 3: Upload First Track */}
        {step === 'upload' && (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-white">
              Upload ton premier morceau
            </h2>
            <p className="text-gray-400 text-lg">
              Prêt à commencer l'analyse?
            </p>
            <div className="border-2 border-dashed border-purple-500 rounded-lg p-8 text-center hover:border-purple-400 transition-colors cursor-pointer">
              <p className="text-gray-300 mb-2">Glisse tes fichiers audio ici</p>
              <p className="text-sm text-gray-500">ou clique pour parcourir</p>
            </div>
            <p className="text-gray-500 text-sm">
              Formats supportés: MP3, WAV, FLAC, AIFF, OGG, M4A
            </p>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 'complete' && (
          <div className="space-y-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-purple-600 rounded-full p-4">
                <Check className="w-12 h-12 text-white" />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-white">
              Tu es prêt!
            </h2>
            <p className="text-gray-400 text-lg">
              Ton profil est configuré. Place au plaisir de l'analyse!
            </p>
            <div className="pt-4 space-y-2 text-sm text-gray-500">
              <p>Style DJ: <span className="text-purple-400">{djStyle}</span></p>
              <p>Logiciel: <span className="text-purple-400">{djSoftware}</span></p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && step !== 'style' && step !== 'software' && (
          <p className="text-red-500 text-sm mt-4">{error}</p>
        )}

        {/* Navigation buttons */}
        <div className="flex gap-3 mt-8 justify-between">
          <button
            onClick={handlePrev}
            disabled={currentStepIndex === 0}
            className="flex items-center gap-2 px-6 py-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Précédent
          </button>

          <button
            onClick={handleSkip}
            disabled={loading}
            className="px-6 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            Passer
          </button>

          {step === 'complete' ? (
            <button
              onClick={completeOnboarding}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors font-semibold"
            >
              C'est parti!
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors font-semibold"
            >
              Suivant
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
