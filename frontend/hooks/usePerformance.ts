/**
 * Performance optimization hooks (points 651-690)
 * useDebounce, useThrottle, useIntersectionObserver, useRaf
 */

import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Debounce hook — delays execution until N ms have passed with no calls
 * Perfect for: search input, resize, etc.
 */
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delayMs: number,
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback(
    ((...args) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delayMs);
    }) as T,
    [callback, delayMs],
  );
}

/**
 * Throttle hook — executes at most once every N ms
 * Perfect for: scroll, mousemove, volume/EQ sliders
 */
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delayMs: number,
): T {
  const lastRunRef = useRef(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback(
    ((...args) => {
      const now = Date.now();
      if (now - lastRunRef.current >= delayMs) {
        lastRunRef.current = now;
        callback(...args);
      } else {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        const remaining = delayMs - (now - lastRunRef.current);
        timeoutRef.current = setTimeout(() => {
          lastRunRef.current = Date.now();
          callback(...args);
        }, remaining);
      }
    }) as T,
    [callback, delayMs],
  );
}

/**
 * Intersection Observer hook (points 651-690)
 * Triggers callback when element enters viewport
 * Great for: lazy loading, virtual scrolling
 */
export function useIntersectionObserver(
  options: IntersectionObserverInit = { threshold: 0.1 },
): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    }, options);

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [options]);

  return [ref, isVisible];
}

/**
 * RequestAnimationFrame hook
 * Used for: smooth animations, waveform rendering, playhead updates
 */
export function useRaf(callback: (deltaMs: number) => void, enabled = true) {
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return;

    const loop = () => {
      const now = Date.now();
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;
      callback(delta);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [callback, enabled]);
}

/**
 * RequestIdleCallback hook (points 561-570)
 * Used for: non-urgent computations, cache cleanup
 * Falls back to setTimeout if not supported
 */
export function useIdleCallback(callback: () => void, timeout = 1000) {
  useEffect(() => {
    const hasIdleCallback = typeof requestIdleCallback !== 'undefined';

    if (hasIdleCallback) {
      const id = requestIdleCallback(callback, { timeout });
      return () => cancelIdleCallback(id);
    } else {
      // Fallback: setTimeout at lowest priority
      const id = setTimeout(callback, timeout);
      return () => clearTimeout(id);
    }
  }, [callback, timeout]);
}

/**
 * Browser Page Visibility hook
 * Pause animations/updates when tab is not visible
 */
export function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return isVisible;
}

/**
 * ReducedMotion hook (accessibility — point 691-700)
 * Returns true if user prefers reduced motion
 */
export function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return prefersReducedMotion;
}
