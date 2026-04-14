'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Save, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { Slider } from '@/components/ui/Slider';

interface KeyboardShortcut {
  action: string;
  keys: string;
  description: string;
}

interface SettingsPanelProps {
  onSave?: (settings: AppSettings) => void;
  initialSettings?: Partial<AppSettings>;
}

interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  displayDensity: 'compact' | 'normal' | 'comfortable';
  waveformStyle: 'gradient' | 'bars' | 'line';
  language: 'fr' | 'en' | 'es' | 'de' | 'ja';
  autoAnalyzeOnUpload: boolean;
  bpmDetectionMethod: 'fast' | 'accurate' | 'balanced';
  notifyAnalysisDone: boolean;
  notifyExportDone: boolean;
  previewQuality: 'low' | 'medium' | 'high';
  analysisQuality: 'fast' | 'standard' | 'high';
  defaultExportFormat: 'rekordbox' | 'serato' | 'traktor' | 'pioneercdj';
  cueColorPalette: string[];
  keyboardShortcuts: KeyboardShortcut[];
}

const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  { action: 'play_pause', keys: 'Space', description: 'Play / Pause' },
  { action: 'next_track', keys: 'Ctrl + Right', description: 'Next Track' },
  { action: 'prev_track', keys: 'Ctrl + Left', description: 'Previous Track' },
  { action: 'loop_ab', keys: 'L', description: 'Set A/B Loop' },
  { action: 'tap_tempo', keys: 'T', description: 'Tap Tempo' },
  { action: 'cue_hot_1', keys: '1', description: 'Hot Cue 1' },
  { action: 'cue_hot_2', keys: '2', description: 'Hot Cue 2' },
  { action: 'cue_hot_3', keys: '3', description: 'Hot Cue 3' },
  { action: 'increase_tempo', keys: '+', description: 'Increase Tempo' },
  { action: 'decrease_tempo', keys: '-', description: 'Decrease Tempo' },
];

const DEFAULT_CUE_COLORS = [
  '#FF0000', // Red
  '#FF8800', // Orange
  '#FFFF00', // Yellow
  '#00FF00', // Green
  '#0088FF', // Blue
  '#8800FF', // Purple
];

const LANGUAGE_OPTIONS = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ja', label: '日本語' },
];

export default function SettingsPanel({
  onSave = () => {},
  initialSettings = {},
}: SettingsPanelProps) {
  // ========== Settings State ==========
  const [settings, setSettings] = useState<AppSettings>({
    theme: initialSettings.theme ?? 'dark',
    displayDensity: initialSettings.displayDensity ?? 'normal',
    waveformStyle: initialSettings.waveformStyle ?? 'gradient',
    language: initialSettings.language ?? 'en',
    autoAnalyzeOnUpload: initialSettings.autoAnalyzeOnUpload ?? true,
    bpmDetectionMethod: initialSettings.bpmDetectionMethod ?? 'balanced',
    notifyAnalysisDone: initialSettings.notifyAnalysisDone ?? true,
    notifyExportDone: initialSettings.notifyExportDone ?? true,
    previewQuality: initialSettings.previewQuality ?? 'medium',
    analysisQuality: initialSettings.analysisQuality ?? 'standard',
    defaultExportFormat: initialSettings.defaultExportFormat ?? 'rekordbox',
    cueColorPalette: initialSettings.cueColorPalette ?? DEFAULT_CUE_COLORS,
    keyboardShortcuts: initialSettings.keyboardShortcuts ?? DEFAULT_SHORTCUTS,
  });

  // ========== UI State ==========
  const [activeTab, setActiveTab] = useState<
    'theme' | 'display' | 'analysis' | 'shortcuts' | 'export' | 'colors'
  >('theme');
  const [editingShortcut, setEditingShortcut] = useState<number | null>(null);
  const [editingColor, setEditingColor] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // ========== Load from localStorage on mount ==========
  useEffect(() => {
    const saved = localStorage.getItem('trackcue-settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings((prev) => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }
  }, []);

  // ========== Handlers ==========
  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
    // Synchronise immédiatement le thème avec ThemeProvider
    if (key === 'theme' && (value === 'dark' || value === 'light')) {
      localStorage.setItem('trackcue-theme', value as string);
      const root = document.documentElement;
      root.classList.remove('dark', 'light');
      root.classList.add(value as string);
    }
  }, []);

  const saveSettings = useCallback(() => {
    localStorage.setItem('trackcue-settings', JSON.stringify(settings));
    onSave(settings);
    setHasChanges(false);
  }, [settings, onSave]);

  const resetSettings = useCallback(() => {
    const defaults: AppSettings = {
      theme: 'dark',
      displayDensity: 'normal',
      waveformStyle: 'gradient',
      language: 'en',
      autoAnalyzeOnUpload: true,
      bpmDetectionMethod: 'balanced',
      notifyAnalysisDone: true,
      notifyExportDone: true,
      previewQuality: 'medium',
      analysisQuality: 'standard',
      defaultExportFormat: 'rekordbox',
      cueColorPalette: DEFAULT_CUE_COLORS,
      keyboardShortcuts: DEFAULT_SHORTCUTS,
    };
    setSettings(defaults);
    setHasChanges(true);
  }, []);

  const updateShortcut = useCallback((index: number, newKeys: string) => {
    setSettings((prev) => {
      const shortcuts = [...prev.keyboardShortcuts];
      shortcuts[index] = { ...shortcuts[index], keys: newKeys };
      return { ...prev, keyboardShortcuts: shortcuts };
    });
    setEditingShortcut(null);
    setHasChanges(true);
  }, []);

  const updateCueColor = useCallback((index: number, color: string) => {
    setSettings((prev) => {
      const palette = [...prev.cueColorPalette];
      palette[index] = color;
      return { ...prev, cueColorPalette: palette };
    });
    setEditingColor(null);
    setHasChanges(true);
  }, []);

  return (
    <div className="w-full bg-gray-900 text-white p-6 space-y-6">
      {/* ========== Header ========== */}
      <div className="flex items-center justify-between gap-4 border-b border-gray-700 pb-4">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-gray-400">Customize TrackCue to your preference</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={resetSettings}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded flex items-center gap-2 text-sm"
          >
            <RotateCcw size={16} />
            Reset
          </button>
          <button
            onClick={saveSettings}
            disabled={!hasChanges}
            className={`px-4 py-2 rounded flex items-center gap-2 text-sm font-semibold ${
              hasChanges
                ? 'bg-green-600 hover:bg-green-500'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Save size={16} />
            Save
          </button>
        </div>
      </div>

      {/* ========== Tabs ========== */}
      <div className="flex gap-2 border-b border-gray-700 overflow-x-auto">
        {(
          [
            { id: 'theme', label: 'Theme' },
            { id: 'display', label: 'Display' },
            { id: 'analysis', label: 'Analysis' },
            { id: 'export', label: 'Export' },
            { id: 'shortcuts', label: 'Shortcuts' },
            { id: 'colors', label: 'Colors' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-semibold whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-500 text-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========== Theme Tab ========== */}
      {activeTab === 'theme' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-semibold">Color Theme</label>
            <div className="grid grid-cols-3 gap-3">
              {(['dark', 'light', 'system'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => updateSetting('theme', t)}
                  className={`py-3 px-4 rounded font-semibold capitalize ${
                    settings.theme === t
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-gray-700 pt-4">
            <label className="text-sm font-semibold">Language</label>
            <select
              value={settings.language}
              onChange={(e) => updateSetting('language', e.target.value as any)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white"
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ========== Display Tab ========== */}
      {activeTab === 'display' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-semibold">Display Density</label>
            <div className="grid grid-cols-3 gap-3">
              {(['compact', 'normal', 'comfortable'] as const).map((density) => (
                <button
                  key={density}
                  onClick={() => updateSetting('displayDensity', density)}
                  className={`py-3 px-4 rounded font-semibold capitalize ${
                    settings.displayDensity === density
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {density}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-gray-700 pt-4">
            <label className="text-sm font-semibold">Waveform Style</label>
            <div className="grid grid-cols-3 gap-3">
              {(['gradient', 'bars', 'line'] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => updateSetting('waveformStyle', style)}
                  className={`py-3 px-4 rounded font-semibold capitalize ${
                    settings.waveformStyle === style
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========== Analysis Tab ========== */}
      {activeTab === 'analysis' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.autoAnalyzeOnUpload}
                onChange={(e) => updateSetting('autoAnalyzeOnUpload', e.target.checked)}
                className="w-5 h-5"
              />
              <span className="text-sm font-semibold">Auto-analyze on upload</span>
            </label>
            <p className="text-xs text-gray-400 pl-8">
              Automatically analyze BPM, key, and energy when uploading new tracks
            </p>
          </div>

          <div className="space-y-3 border-t border-gray-700 pt-4">
            <label className="text-sm font-semibold">BPM Detection Method</label>
            <div className="grid grid-cols-3 gap-3">
              {(['fast', 'balanced', 'accurate'] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => updateSetting('bpmDetectionMethod', method)}
                  className={`py-3 px-4 rounded font-semibold capitalize ${
                    settings.bpmDetectionMethod === method
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-gray-700 pt-4">
            <label className="text-sm font-semibold">Analysis Quality</label>
            <div className="grid grid-cols-3 gap-3">
              {(['fast', 'standard', 'high'] as const).map((quality) => (
                <button
                  key={quality}
                  onClick={() => updateSetting('analysisQuality', quality)}
                  className={`py-3 px-4 rounded font-semibold capitalize ${
                    settings.analysisQuality === quality
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {quality}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-gray-700 pt-4">
            <label className="text-sm font-semibold">Audio Quality</label>

            <div className="space-y-2">
              <label className="text-xs font-semibold">Preview Quality</label>
              <div className="grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as const).map((quality) => (
                  <button
                    key={quality}
                    onClick={() => updateSetting('previewQuality', quality)}
                    className={`py-2 px-3 rounded text-xs font-semibold capitalize ${
                      settings.previewQuality === quality
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {quality}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-gray-700 pt-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.notifyAnalysisDone}
                onChange={(e) => updateSetting('notifyAnalysisDone', e.target.checked)}
                className="w-5 h-5"
              />
              <span className="text-sm font-semibold">Notify when analysis is done</span>
            </label>
          </div>
        </div>
      )}

      {/* ========== Export Tab ========== */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-semibold">Default Export Format</label>
            <select
              value={settings.defaultExportFormat}
              onChange={(e) => updateSetting('defaultExportFormat', e.target.value as any)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white"
            >
              <option value="rekordbox">Rekordbox</option>
              <option value="serato">Serato DJ Pro</option>
              <option value="traktor">Traktor Pro</option>
              <option value="pioneercdj">Pioneer CDJ</option>
            </select>
          </div>

          <div className="space-y-3 border-t border-gray-700 pt-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.notifyExportDone}
                onChange={(e) => updateSetting('notifyExportDone', e.target.checked)}
                className="w-5 h-5"
              />
              <span className="text-sm font-semibold">Notify when export is done</span>
            </label>
          </div>
        </div>
      )}

      {/* ========== Shortcuts Tab ========== */}
      {activeTab === 'shortcuts' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Click on any shortcut to customize it. Press your desired key combination.
          </p>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {settings.keyboardShortcuts.map((shortcut, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-gray-800 rounded hover:bg-gray-700"
              >
                <div>
                  <div className="text-sm font-semibold">{shortcut.description}</div>
                  <div className="text-xs text-gray-400">{shortcut.action}</div>
                </div>

                {editingShortcut === idx ? (
                  <input
                    autoFocus
                    type="text"
                    value={shortcut.keys}
                    onChange={(e) => updateShortcut(idx, e.target.value)}
                    onBlur={() => setEditingShortcut(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setEditingShortcut(null);
                    }}
                    className="px-3 py-1 bg-gray-900 border border-blue-500 rounded text-white text-xs"
                  />
                ) : (
                  <button
                    onClick={() => setEditingShortcut(idx)}
                    className="px-4 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs font-semibold"
                  >
                    {shortcut.keys}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========== Colors Tab ========== */}
      {activeTab === 'colors' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-3">Cue Point Colors</h3>
            <div className="grid grid-cols-3 gap-3">
              {settings.cueColorPalette.map((color, idx) => (
                <button
                  key={idx}
                  onClick={() => setEditingColor(idx)}
                  className="relative aspect-square rounded border-2 border-gray-700 hover:border-blue-500 overflow-hidden"
                  style={{ backgroundColor: color }}
                >
                  {editingColor === idx && (
                    <input
                      autoFocus
                      type="color"
                      value={color}
                      onChange={(e) => updateCueColor(idx, e.target.value)}
                      onBlur={() => setEditingColor(null)}
                      className="absolute inset-0 w-full h-full cursor-pointer"
                    />
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Click on a color to customize it. Used for hot cues and markers.
            </p>
          </div>
        </div>
      )}

      {/* ========== Unsaved Changes Notice ========== */}
      {hasChanges && (
        <div className="border-t border-gray-700 pt-4">
          <div className="flex items-center justify-between p-3 bg-yellow-900/30 border border-yellow-700 rounded">
            <span className="text-sm">You have unsaved changes</span>
            <button
              onClick={saveSettings}
              className="px-4 py-1 bg-yellow-600 hover:bg-yellow-500 rounded text-sm font-semibold"
            >
              Save Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
