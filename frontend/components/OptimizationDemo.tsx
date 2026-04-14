/**
 * Optimization demo component (points 551-700)
 * Shows usage of all new optimization features
 * This is for reference/testing — can be removed in production
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useDebounce, useThrottle, useRaf, useReducedMotion } from '@/hooks/usePerformance';
import { usePlayerStore, useStemsStore, useWaveformCache } from '@/lib/store';
import { announce, announceBPM, createKeyboardNavigation } from '@/lib/accessibility';
import { getCanvasPool, DoubleBuffer, DirtyRegion } from '@/lib/canvasPool';
import { getAudioBufferPool } from '@/lib/audioBufferPool';

/**
 * Demo showing debounce optimization
 */
function DebounceDemo() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<string[]>([]);

  const debouncedSearch = useDebounce((term: string) => {
    console.log('[DEMO] Searching for:', term);
    setResults([`Result 1 for "${term}"`, `Result 2 for "${term}"`]);
  }, 300);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setSearchTerm(val);
      debouncedSearch(val);
    },
    [debouncedSearch],
  );

  return (
    <div className="p-4 border rounded">
      <h3 className="font-bold mb-2">Debounce Demo (300ms delay)</h3>
      <input
        type="text"
        value={searchTerm}
        onChange={handleChange}
        placeholder="Type something..."
        className="border px-2 py-1 w-full text-black"
      />
      <div className="mt-2">
        {results.map((r, i) => (
          <div key={i} className="text-sm">
            {r}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Demo showing Zustand store usage
 */
function StoreDemo() {
  const { volume, setVolume, isPlaying, setIsPlaying } = usePlayerStore();
  const { mutedStems, toggleMuteStem } = useStemsStore();

  return (
    <div className="p-4 border rounded">
      <h3 className="font-bold mb-2">Zustand Store Demo</h3>
      <div className="space-y-2 text-sm">
        <div>
          <label>Volume: {Math.round(volume * 100)}%</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
          />
        </div>
        <div>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="bg-blue-600 px-3 py-1 rounded"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
        </div>
        <div>
          <button
            onClick={() => toggleMuteStem('vocals_url')}
            className={`px-3 py-1 rounded ${
              mutedStems.has('vocals_url') ? 'bg-red-600' : 'bg-gray-600'
            }`}
          >
            Toggle Vocals Mute
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Demo showing accessibility features
 */
function AccessibilityDemo() {
  const prefersReducedMotion = useReducedMotion();

  const handleAnnounce = useCallback(() => {
    announce('This is an announcement for screen readers', 'polite');
  }, []);

  const handleAnnounceBPM = useCallback(() => {
    announceBPM(120);
  }, []);

  return (
    <div className="p-4 border rounded">
      <h3 className="font-bold mb-2">Accessibility Demo</h3>
      <div className="space-y-2 text-sm">
        <div>
          Prefers reduced motion: <span className="font-mono">{String(prefersReducedMotion)}</span>
        </div>
        <button onClick={handleAnnounce} className="bg-green-600 px-3 py-1 rounded mr-2">
          Announce Message
        </button>
        <button onClick={handleAnnounceBPM} className="bg-green-600 px-3 py-1 rounded">
          Announce BPM
        </button>
        <div aria-live="polite" aria-atomic="true" id="a11y-announcement-region" />
      </div>
    </div>
  );
}

/**
 * Demo showing canvas pool
 */
function CanvasPoolDemo() {
  const handleGetCanvas = useCallback(() => {
    const pool = getCanvasPool();
    const canvas = pool.getCanvas(200, 100);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgb(75, 192, 192)';
    ctx.fillRect(10, 10, 100, 50);
    console.log('[DEMO] Canvas from pool:', canvas);
    // Return after use
    pool.returnCanvas(canvas);
  }, []);

  return (
    <div className="p-4 border rounded">
      <h3 className="font-bold mb-2">Canvas Pool Demo</h3>
      <button onClick={handleGetCanvas} className="bg-purple-600 px-3 py-1 rounded">
        Get Canvas from Pool
      </button>
      <p className="text-xs mt-2">Check console for details</p>
    </div>
  );
}

/**
 * Demo showing audio buffer pool
 */
function AudioBufferPoolDemo() {
  const handleGetBuffer = useCallback(() => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const pool = getAudioBufferPool(audioContext);
    const buffer = pool.getBuffer(44100, 2, 2); // 2 seconds, stereo
    console.log('[DEMO] AudioBuffer from pool:', buffer);
    const stats = pool.getStats();
    console.log('[DEMO] Pool stats:', stats);
  }, []);

  return (
    <div className="p-4 border rounded">
      <h3 className="font-bold mb-2">AudioBuffer Pool Demo</h3>
      <button onClick={handleGetBuffer} className="bg-pink-600 px-3 py-1 rounded">
        Get AudioBuffer from Pool
      </button>
      <p className="text-xs mt-2">Check console for details</p>
    </div>
  );
}

/**
 * Demo showing RAF hook
 */
function RAFDemo() {
  const [frameCount, setFrameCount] = useState(0);

  useRaf(
    (deltaMs) => {
      setFrameCount((c) => (c + 1) % 60); // Show 0-59
    },
    true,
  );

  return (
    <div className="p-4 border rounded">
      <h3 className="font-bold mb-2">RAF Demo</h3>
      <div className="text-3xl font-mono">{frameCount}</div>
      <p className="text-xs text-gray-400">Frame counter using requestAnimationFrame</p>
    </div>
  );
}

export function OptimizationDemo() {
  return (
    <div className="p-6 space-y-4 bg-gray-900 min-h-screen text-white">
      <h1 className="text-2xl font-bold">TrackCue Optimization Features Demo</h1>
      <p className="text-gray-400 text-sm">
        This component demonstrates optimizations for points 551-700
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DebounceDemo />
        <StoreDemo />
        <AccessibilityDemo />
        <CanvasPoolDemo />
        <AudioBufferPoolDemo />
        <RAFDemo />
      </div>

      <div className="p-4 bg-blue-900/20 border border-blue-600 rounded text-sm">
        <h3 className="font-bold mb-2">What's Optimized:</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-300">
          <li>551-560: Web Workers for waveform computation</li>
          <li>561-570: Canvas rendering, batching, double buffering, dirty regions</li>
          <li>571-580: Audio playback optimizations, buffer pool, decode workers</li>
          <li>581-590: Optimized cue display with SVG, hitbox, drag handling</li>
          <li>591-600: Beatgrid display with LOD, phase indicator, confidence colors</li>
          <li>601-610: Stems UI with waveforms, VU meters, volume faders, pan knobs</li>
          <li>621-640: Camelot wheel SVG, interactive, energy matching, BPM viz</li>
          <li>651-670: React.memo, useCallback, lazy Suspense tabs, Zustand stores</li>
          <li>671-690: API compression, ETag caching, batch endpoints, Service Worker</li>
          <li>691-700: Accessibility — screen reader, keyboard nav, ARIA, focus management</li>
        </ul>
      </div>
    </div>
  );
}

export default OptimizationDemo;
