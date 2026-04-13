'use client';

import React, { useState, useCallback, useRef } from 'react';
import { ChevronRight, ChevronLeft, SkipForward } from 'lucide-react';

type DJLevel = 'beginner' | 'intermediate' | 'pro';

interface OnboardingStep {
  id: number;
  title: string;
  description: string;
}

interface OnboardingState {
  currentStep: number;
  djLevel: DJLevel | null;
  trackUploaded: boolean;
  trackFile: File | null;
  exportFormat: 'serato' | 'rekordbox' | 'traktor' | 'enginedj' | null;
  language: 'en' | 'fr' | 'es' | 'de';
  completed: boolean;
}

const STEPS: OnboardingStep[] = [
  {
    id: 0,
    title: 'Welcome to CueForge',
    description: 'Choose your DJ experience level to get started',
  },
  {
    id: 1,
    title: 'Upload Your First Track',
    description: 'Drag & drop or select an audio file to analyze',
  },
  {
    id: 2,
    title: 'Analysis Complete',
    description: 'See your track insights: BPM, key, and cues',
  },
  {
    id: 3,
    title: 'Quick Setup',
    description: 'Configure your preferences and preferences',
  },
];

const DJ_LEVELS = [
  {
    value: 'beginner' as const,
    label: 'Beginner',
    description: 'Just starting out with DJing',
  },
  {
    value: 'intermediate' as const,
    label: 'Intermediate',
    description: 'I have experience mixing',
  },
  {
    value: 'pro' as const,
    label: 'Professional',
    description: 'I DJ professionally or frequently',
  },
];

const EXPORT_FORMATS = [
  { value: 'serato' as const, label: 'Serato DJ' },
  { value: 'rekordbox' as const, label: 'Rekordbox' },
  { value: 'traktor' as const, label: 'Traktor Pro' },
  { value: 'enginedj' as const, label: 'Engine DJ' },
];

const LANGUAGES = [
  { value: 'en' as const, label: 'English' },
  { value: 'fr' as const, label: 'Français' },
  { value: 'es' as const, label: 'Español' },
  { value: 'de' as const, label: 'Deutsch' },
];

interface AnalysisResult {
  bpm: number;
  key: string;
  cues: Array<{ time: number; label: string }>;
  energy: number;
}

export const OnboardingWizard: React.FC = () => {
  const [state, setState] = useState<OnboardingState>({
    currentStep: 0,
    djLevel: null,
    trackUploaded: false,
    trackFile: null,
    exportFormat: null,
    language: 'en',
    completed: false,
  });

  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragOverRef = useRef<HTMLDivElement>(null);

  // Load progress from localStorage on mount
  React.useEffect(() => {
    const saved = localStorage.getItem('onboarding_progress');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setState(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.warn('Failed to load onboarding progress', e);
      }
    }
  }, []);

  // Save progress to localStorage
  const saveProgress = useCallback((newState: Partial<OnboardingState>) => {
    setState(prev => {
      const updated = { ...prev, ...newState };
      try {
        localStorage.setItem('onboarding_progress', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save onboarding progress', e);
      }
      return updated;
    });
  }, []);

  const handleDJLevelSelect = (level: DJLevel) => {
    saveProgress({ djLevel: level });
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('audio/')) {
      alert('Please upload an audio file');
      return;
    }

    saveProgress({ trackFile: file, trackUploaded: true });

    // Simulate analysis
    setIsAnalyzing(true);
    setTimeout(() => {
      setAnalysisResult({
        bpm: 124,
        key: 'A Minor',
        cues: [
          { time: 0, label: 'Intro' },
          { time: 32, label: 'Verse 1' },
          { time: 64, label: 'Chorus' },
        ],
        energy: 7.2,
      });
      setIsAnalyzing(false);
      handleNextStep();
    }, 2000);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.add('border-blue-500', 'bg-blue-50');
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');

    const files = e.dataTransfer.files;
    if (files[0]) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files?.[0]) {
      handleFileUpload(files[0]);
    }
  };

  const handlePrevStep = () => {
    setState(prev => ({
      ...prev,
      currentStep: Math.max(0, prev.currentStep - 1),
    }));
  };

  const handleNextStep = () => {
    setState(prev => ({
      ...prev,
      currentStep: Math.min(STEPS.length - 1, prev.currentStep + 1),
    }));
  };

  const handleSkip = () => {
    saveProgress({ completed: true });
  };

  const handleComplete = () => {
    saveProgress({ completed: true });
  };

  const progressPercent = ((state.currentStep + 1) / STEPS.length) * 100;

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      {/* Progress Bar */}
      <div className="h-1 bg-slate-700 relative overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-600"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Header */}
      <div className="px-6 py-4 flex justify-between items-center border-b border-slate-700">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {STEPS[state.currentStep].title}
          </h1>
          <p className="text-slate-400 mt-1">
            {STEPS[state.currentStep].description}
          </p>
        </div>
        <button
          onClick={handleSkip}
          className="text-slate-400 hover:text-white transition-colors"
          title="Skip onboarding"
        >
          <SkipForward size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {state.currentStep === 0 && (
          <div
            className="h-full flex flex-col items-center justify-center px-6"
          >
              <div className="max-w-2xl text-center">
                <h2 className="text-4xl font-bold text-white mb-6">
                  What's your DJ experience?
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {DJ_LEVELS.map(level => (
                    <button
                      key={level.value}
                      onClick={() => handleDJLevelSelect(level.value)}
                      className={`p-6 rounded-lg border-2 transition-all hover:scale-105 active:scale-95 ${
                        state.djLevel === level.value
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                      }`}
                    >
                      <h3 className="text-lg font-semibold text-white mb-2">
                        {level.label}
                      </h3>
                      <p className="text-slate-400 text-sm">
                        {level.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {state.currentStep === 1 && (
            <div
              className="h-full flex flex-col items-center justify-center px-6"
            >
              <div className="max-w-2xl w-full">
                <div
                  ref={dragOverRef}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className="border-2 border-dashed border-slate-600 rounded-lg p-12 text-center hover:border-slate-500 transition-colors cursor-pointer bg-slate-800/30"
                >
                  <div className="flex flex-col items-center">
                    <svg
                      className="w-16 h-16 text-slate-500 mb-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                    <h3 className="text-xl font-semibold text-white mb-2">
                      Drag & drop your audio file
                    </h3>
                    <p className="text-slate-400 mb-4">
                      Or click to browse (MP3, WAV, FLAC, M4A)
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      Select File
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {state.currentStep === 2 && (
            <div
              className="h-full flex flex-col items-center justify-center px-6"
            >
              {isAnalyzing ? (
                <div className="text-center">
                  <div
                    className="w-16 h-16 border-4 border-slate-600 border-t-blue-500 rounded-full mx-auto mb-4 animate-spin"
                  />
                  <p className="text-xl text-white">Analyzing your track...</p>
                </div>
              ) : analysisResult ? (
                <div className="max-w-2xl w-full">
                  <div className="bg-slate-800 rounded-lg p-8">
                    <h3 className="text-2xl font-bold text-white mb-6">
                      Analysis Results
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <div className="bg-slate-700/50 rounded p-4">
                        <p className="text-slate-400 text-sm mb-1">BPM</p>
                        <p className="text-3xl font-bold text-blue-400">
                          {analysisResult.bpm}
                        </p>
                      </div>
                      <div className="bg-slate-700/50 rounded p-4">
                        <p className="text-slate-400 text-sm mb-1">Key</p>
                        <p className="text-3xl font-bold text-cyan-400">
                          {analysisResult.key}
                        </p>
                      </div>
                      <div className="bg-slate-700/50 rounded p-4">
                        <p className="text-slate-400 text-sm mb-1">Energy</p>
                        <p className="text-3xl font-bold text-orange-400">
                          {analysisResult.energy}/10
                        </p>
                      </div>
                      <div className="bg-slate-700/50 rounded p-4">
                        <p className="text-slate-400 text-sm mb-1">Cues</p>
                        <p className="text-3xl font-bold text-green-400">
                          {analysisResult.cues.length}
                        </p>
                      </div>
                    </div>
                    <div className="bg-slate-700/30 rounded p-4">
                      <p className="text-slate-400 text-sm mb-3">Detected Cues:</p>
                      <ul className="space-y-2">
                        {analysisResult.cues.map((cue, idx) => (
                          <li key={idx} className="text-slate-300">
                            <span className="text-blue-400">{cue.time}s</span> - {cue.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {state.currentStep === 3 && (
            <div
              className="h-full flex flex-col items-center justify-center px-6"
            >
              <div className="max-w-2xl w-full space-y-8">
                <div>
                  <label className="block text-white font-semibold mb-4">
                    Preferred DJ Software
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {EXPORT_FORMATS.map(format => (
                      <button
                        key={format.value}
                        onClick={() => saveProgress({ exportFormat: format.value })}
                        className={`p-3 rounded-lg border-2 transition-all hover:scale-105 ${
                          state.exportFormat === format.value
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-slate-600 bg-slate-800/50'
                        }`}
                      >
                        <p className="text-sm font-medium text-white">
                          {format.label}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-white font-semibold mb-4">
                    Preferred Language
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {LANGUAGES.map(lang => (
                      <button
                        key={lang.value}
                        onClick={() => saveProgress({ language: lang.value })}
                        className={`p-3 rounded-lg border-2 transition-all hover:scale-105 ${
                          state.language === lang.value
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-slate-600 bg-slate-800/50'
                        }`}
                      >
                        <p className="text-sm font-medium text-white">
                          {lang.label}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="px-6 py-4 border-t border-slate-700 flex justify-between items-center bg-slate-900/50">
        <button
          onClick={handlePrevStep}
          disabled={state.currentStep === 0}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={18} />
          Back
        </button>

        <span className="text-slate-400 text-sm">
          Step {state.currentStep + 1} of {STEPS.length}
        </span>

        {state.currentStep === STEPS.length - 1 ? (
          <button
            onClick={handleComplete}
            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-colors font-semibold"
          >
            Complete
          </button>
        ) : (
          <button
            onClick={handleNextStep}
            disabled={
              (state.currentStep === 0 && !state.djLevel) ||
              (state.currentStep === 1 && !state.trackUploaded)
            }
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
};

export default OnboardingWizard;
