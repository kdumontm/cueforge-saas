/**
 * Advanced Engine Exports — Lazy Loading
 *
 * This barrel file provides lazy-loaded exports for all advanced engine libraries.
 * Use these exports to reduce initial bundle size by dynamically importing on demand.
 *
 * Example usage:
 * ```typescript
 * const PWAManagerModule = await loadPWAManager();
 * const manager = new PWAManagerModule.PWAManager();
 * ```
 */

// PWA Management — service worker, caching, offline capabilities
export const loadPWAManager = () => import('./pwaManager');

// Web Audio API engine — real-time audio processing, visualization
export const loadWebAudioEngine = () => import('./webAudioEngine');

// Canvas rendering engine — high-performance 2D graphics, waveform rendering
export const loadCanvasRenderer = () => import('./canvasRenderer');

// Global state management — React context, hooks, state coordination
export const loadStateManager = () => import('./stateManager');

// Network optimization — request deduplication, caching, prefetching
export const loadNetworkOptimizer = () => import('./networkOptimizer');

// Internationalization — translations, language switching, localization
export const loadI18n = () => import('./i18n');

// Optional advanced engines
export const loadAudioAnalyzer = () => import('./audioAnalyzer');
export const loadStemAnalyzer = () => import('./stemAnalyzer');
export const loadOfflineStorage = () => import('./offlineStorage');
export const loadReactOptimizations = () => import('./reactOptimizations');
export const loadBundleOptimizations = () => import('./bundleOptimization');
