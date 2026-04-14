/**
 * Bundle and network optimization (points 671-690)
 * Dynamic imports, compression, caching, lazy loading
 */

/**
 * Dynamic component import with Suspense fallback (point 671-690)
 * Usage:
 *   const LazyStems = dynamicImport(() => import('@/components/tabs/StemsTab'))
 *   <Suspense fallback={<Skeleton />}><LazyStems /></Suspense>
 */
export function dynamicImport<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
) {
  return React.lazy(importFn) as unknown as T;
}

/**
 * API compression setup (Brotli)
 * Client requests compressed responses from backend
 */
export function setupApiCompression() {
  // Set Accept-Encoding header for all requests
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const [url, options] = args;
    const fetchOptions = (options || {}) as RequestInit;

    // Add compression headers
    if (!fetchOptions.headers) {
      fetchOptions.headers = {};
    }

    const headers = fetchOptions.headers as Record<string, string>;
    headers['Accept-Encoding'] = 'br, gzip, deflate';

    return originalFetch.apply(this, [url, fetchOptions]);
  };
}

/**
 * ETag caching for API responses
 * Store ETags to avoid downloading identical responses
 */
interface CachedResponse {
  data: any;
  etag: string;
  timestamp: number;
}

const etagCache = new Map<string, CachedResponse>();

export function getCachedResponse(url: string): any | null {
  const cached = etagCache.get(url);
  if (!cached) return null;

  // Invalidate after 1 hour
  if (Date.now() - cached.timestamp > 3600000) {
    etagCache.delete(url);
    return null;
  }

  return cached.data;
}

export function setCachedResponse(url: string, data: any, etag: string) {
  etagCache.set(url, {
    data,
    etag,
    timestamp: Date.now(),
  });
}

export function getEtagHeader(url: string): string | null {
  return etagCache.get(url)?.etag || null;
}

/**
 * Batch API requests to reduce network calls
 * Groups requests and sends in single call
 */
interface BatchRequest {
  url: string;
  method: string;
  body?: any;
}

export function createBatchRequest(requests: BatchRequest[]) {
  return {
    batch: requests.map((r) => ({
      method: r.method,
      url: r.url,
      body: r.body,
    })),
  };
}

/**
 * Service Worker registration for offline support
 */
export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      console.log('[SW] Registered', reg);
      return reg;
    } catch (err) {
      console.error('[SW] Registration failed:', err);
    }
  }
}

// CSS purging config (for Tailwind)
// Already done via tailwind.config.js — content globs cover app/ and components/
// This prevents unused CSS from being bundled

/**
 * Bundle size analysis logging
 * Logs estimated bundle sizes (requires build-time plugin)
 */
export function logBundleMetrics() {
  if (typeof window === 'undefined') return;

  const perfData = (window as any).performance?.timing;
  if (!perfData) return;

  const loadTime = perfData.loadEventEnd - perfData.navigationStart;
  const contentDownload = perfData.responseEnd - perfData.responseStart;
  const domParse = perfData.domInteractive - perfData.domLoading;

  console.log('[METRICS] Page load time:', loadTime, 'ms');
  console.log('[METRICS] Content download:', contentDownload, 'ms');
  console.log('[METRICS] DOM parse:', domParse, 'ms');
}

/**
 * Image lazy loading setup
 * Use native loading="lazy" or IntersectionObserver
 */
export function setupImageLazyLoading() {
  if (typeof IntersectionObserver === 'undefined') {
    // Fallback: load all images immediately
    const images = document.querySelectorAll<HTMLImageElement>('img[data-src]');
    images.forEach((img) => {
      img.src = img.getAttribute('data-src') || '';
    });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target as HTMLImageElement;
        img.src = img.getAttribute('data-src') || '';
        observer.unobserve(img);
      }
    });
  });

  const images = document.querySelectorAll<HTMLImageElement>('img[data-src]');
  images.forEach((img) => observer.observe(img));
}

/**
 * CSS purge configuration for CSS-in-JS (like tailwindcss)
 * Include all possible class patterns
 */
export const cssConfig = {
  content: [
    './frontend/**/*.{js,ts,jsx,tsx}',
    // Make sure to include dynamic class names
    // e.g., 'bg-red-500', 'text-blue-400'
  ],
  theme: {
    extend: {
      animation: {
        'cue-pulse': 'cue-pulse 0.5s ease-out',
        'beat-flash': 'beat-flash 0.4s ease-out',
      },
    },
  },
  safelist: [
    // Add classes that are dynamically generated or less obvious
    { pattern: /^bg-(red|blue|green|yellow|purple|pink)-(400|500)/ },
    { pattern: /^text-(red|blue|green|yellow|purple)/ },
    { pattern: /^border-(red|blue|green|yellow)/ },
  ],
};

import React from 'react';
