/**
 * Bundle Optimization Utilities (Points 961-1010)
 * Dynamic imports, preloading, prefetching, CSS/Font/Image optimization, Service Worker
 */

// ============================================================================
// dynamicImport() — Wrapper for import() with retry and fallback
// ============================================================================
export async function dynamicImport<T = any>(
  importFn: () => Promise<T>,
  options: {
    maxRetries?: number;
    retryDelayMs?: number;
    fallback?: T;
  } = {}
): Promise<T> {
  const { maxRetries = 3, retryDelayMs = 1000, fallback } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await importFn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * Math.pow(2, attempt)));
      }
    }
  }

  if (fallback !== undefined) {
    console.warn(`Dynamic import failed after ${maxRetries} retries, using fallback:`, lastError);
    return fallback;
  }

  throw lastError || new Error('Dynamic import failed');
}

// ============================================================================
// preloadModule() — Preload a JavaScript module
// ============================================================================
export function preloadModule(modulePath: string): void {
  if (typeof window === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'script';
  link.href = modulePath;
  document.head.appendChild(link);
}

// ============================================================================
// prefetchRoute() — Prefetch a Next.js route
// ============================================================================
export function prefetchRoute(href: string): void {
  if (typeof window === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = href;
  link.as = 'document';
  document.head.appendChild(link);
}

// ============================================================================
// measureBundleSize() — Measure the size of loaded chunks
// ============================================================================
export function measureBundleSize(): {
  totalSize: number;
  chunks: Array<{ name: string; size: number }>;
} {
  if (typeof window === 'undefined' || !performance.getEntriesByType) {
    return { totalSize: 0, chunks: [] };
  }

  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const scriptResources = resources.filter((r) => r.name.endsWith('.js'));

  const chunks = scriptResources.map((r) => ({
    name: new URL(r.name).pathname.split('/').pop() || 'unknown',
    size: r.transferSize || 0,
  }));

  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);

  return { totalSize, chunks };
}

// ============================================================================
// CriticalCSS — Extraction and inline of critical CSS
// ============================================================================
export class CriticalCSS {
  private inlinedStyles: Set<string> = new Set();

  /**
   * Inline critical CSS into the document head
   */
  inlineCriticalCSS(cssContent: string): void {
    if (typeof document === 'undefined') return;

    const hash = this.hash(cssContent);
    if (this.inlinedStyles.has(hash)) return;

    const style = document.createElement('style');
    style.textContent = cssContent;
    style.setAttribute('data-critical', 'true');
    document.head.insertBefore(style, document.head.firstChild);

    this.inlinedStyles.add(hash);
  }

  /**
   * Defer non-critical CSS by loading it asynchronously
   */
  deferNonCriticalCSS(href: string): void {
    if (typeof document === 'undefined') return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.media = 'print';
    link.onload = () => {
      link.media = 'all';
    };
    document.head.appendChild(link);
  }

  private hash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}

// ============================================================================
// FontOptimizer — Font optimization: font-display, preload, subsetting
// ============================================================================
export class FontOptimizer {
  /**
   * Preload fonts with optimal display strategy
   */
  preloadFont(
    src: string,
    options: {
      fontFamily: string;
      fontDisplay?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
      unicodeRange?: string;
    }
  ): void {
    if (typeof document === 'undefined') return;

    const { fontFamily, fontDisplay = 'swap', unicodeRange } = options;

    // Preload link
    const preloadLink = document.createElement('link');
    preloadLink.rel = 'preload';
    preloadLink.as = 'font';
    preloadLink.type = 'font/woff2';
    preloadLink.href = src;
    if (unicodeRange) {
      preloadLink.setAttribute('unicode-range', unicodeRange);
    }
    preloadLink.crossOrigin = 'anonymous';
    document.head.appendChild(preloadLink);

    // Font-face declaration with font-display
    const style = document.createElement('style');
    const unicodeRangeStr = unicodeRange ? `unicode-range: ${unicodeRange};` : '';
    style.textContent = `
      @font-face {
        font-family: '${fontFamily}';
        src: url('${src}') format('woff2');
        font-display: ${fontDisplay};
        ${unicodeRangeStr}
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Load variable fonts for better performance
   */
  loadVariableFont(src: string, fontFamily: string): void {
    this.preloadFont(src, {
      fontFamily,
      fontDisplay: 'swap',
    });
  }
}

// ============================================================================
// ImageOptimizer — Responsive images with AVIF/WebP fallback
// ============================================================================
export class ImageOptimizer {
  /**
   * Generate responsive image srcset with modern formats
   */
  generateSrcSet(
    basePath: string,
    sizes: number[] = [320, 640, 1024, 1920]
  ): {
    avif: string;
    webp: string;
    jpg: string;
  }[] {
    return sizes.map((size) => ({
      avif: `${basePath}?w=${size}&fmt=avif`,
      webp: `${basePath}?w=${size}&fmt=webp`,
      jpg: `${basePath}?w=${size}&fmt=jpg`,
    }));
  }

  /**
   * Create optimized img element with fallbacks
   */
  createOptimizedImage(
    src: string,
    alt: string,
    options: {
      sizes?: string;
      width?: number;
      height?: number;
      loading?: 'lazy' | 'eager';
    } = {}
  ): string {
    const { sizes = '100vw', width, height, loading = 'lazy' } = options;
    const srcSet = this.generateSrcSet(src);

    return `
      <picture>
        <source type="image/avif" srcset="${srcSet.map((s) => `${s.avif} ${s.avif.split('?')[1]}`).join(', ')}" sizes="${sizes}" />
        <source type="image/webp" srcset="${srcSet.map((s) => `${s.webp} ${s.webp.split('?')[1]}`).join(', ')}" sizes="${sizes}" />
        <img
          src="${srcSet[srcSet.length - 1].jpg}"
          alt="${alt}"
          loading="${loading}"
          ${width ? `width="${width}"` : ''}
          ${height ? `height="${height}"` : ''}
          sizes="${sizes}"
        />
      </picture>
    `.trim();
  }
}

// ============================================================================
// ServiceWorkerManager — Service worker registration and updates
// ============================================================================
export class ServiceWorkerManager {
  private swPath: string;
  private registration: ServiceWorkerRegistration | null = null;

  constructor(swPath: string = '/sw.js') {
    this.swPath = swPath;
  }

  /**
   * Register the service worker
   */
  async register(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.warn('Service workers not supported');
      return null;
    }

    try {
      this.registration = await navigator.serviceWorker.register(this.swPath);
      console.log('Service worker registered:', this.swPath);
      return this.registration;
    } catch (error) {
      console.error('Service worker registration failed:', error);
      return null;
    }
  }

  /**
   * Check for service worker updates
   */
  async checkForUpdates(): Promise<boolean> {
    if (!this.registration) {
      return false;
    }

    try {
      await this.registration.update();
      return this.registration.waiting !== null;
    } catch (error) {
      console.error('Service worker update check failed:', error);
      return false;
    }
  }

  /**
   * Activate waiting service worker
   */
  activateWaitingWorker(): void {
    if (!this.registration?.waiting) {
      return;
    }

    this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });

    // Listen for the new service worker becoming active
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.oncontrollerchange = () => {
        window.location.reload();
      };
    }
  }

  /**
   * Unregister the service worker
   */
  async unregister(): Promise<boolean> {
    if (!this.registration) {
      return false;
    }

    try {
      const success = await this.registration.unregister();
      this.registration = null;
      console.log('Service worker unregistered');
      return success;
    } catch (error) {
      console.error('Service worker unregistration failed:', error);
      return false;
    }
  }

  /**
   * Clear cache storage
   */
  async clearCaches(cacheNames?: string[]): Promise<void> {
    if (typeof caches === 'undefined') return;

    try {
      const allCacheNames = await caches.keys();
      const namesToDelete = cacheNames || allCacheNames;

      await Promise.all(
        namesToDelete.map((name) => {
          if (allCacheNames.includes(name)) {
            return caches.delete(name);
          }
          return Promise.resolve();
        })
      );

      console.log('Caches cleared');
    } catch (error) {
      console.error('Cache clearing failed:', error);
    }
  }
}

export default {
  dynamicImport,
  preloadModule,
  prefetchRoute,
  measureBundleSize,
  CriticalCSS,
  FontOptimizer,
  ImageOptimizer,
  ServiceWorkerManager,
};
