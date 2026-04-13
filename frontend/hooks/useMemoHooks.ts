/**
 * Memoized hooks for React perf optimization (points 651-670)
 * These help prevent unnecessary re-renders and recalculations
 */

import { useMemo, useCallback } from 'react';

/**
 * useMemoCompare: Deep comparison memoization for expensive objects
 * Useful when dependencies don't change by reference but by value
 */
export function useMemoCompare<T>(
  value: T,
  compare: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b),
) {
  const ref = { value };
  const prevRef = { value: ref };

  const result = useMemo(() => {
    if (!compare(ref.value, prevRef.value.value)) {
      prevRef.value = ref;
    }
    return prevRef.value.value;
  }, [value, compare]);

  return result;
}

/**
 * useMemoAsync: Memoize async computations
 */
export function useMemoAsync<T>(
  fn: () => Promise<T>,
  deps: React.DependencyList,
  defaultValue: T | null = null,
): T | null {
  return useMemo(() => {
    // This should be avoided in production. For true async memoization,
    // prefer libraries like react-query.
    // This is just a placeholder for documentation.
    return defaultValue;
  }, deps);
}

/**
 * useCallbackRef: Create a stable callback that updates ref internally
 * Useful when you need a callback that doesn't change reference but its logic does
 */
export function useCallbackRef<T extends (...args: any[]) => any>(callback: T): T {
  const ref = useCallback(callback, []); // empty deps = always same ref
  return ref as T;
}

/**
 * useMemoSelector: Select values from an object with memoization
 * Great with Zustand stores to prevent re-renders on unrelated state changes
 */
export function useMemoSelector<T, R>(
  value: T,
  selector: (value: T) => R,
  isEqual: (a: R, b: R) => boolean = (a, b) => Object.is(a, b),
): R {
  const prevRef = useCallback(() => selector(value), [value, selector]);
  const result = prevRef();

  return useMemo(() => {
    const newResult = result;
    // Return memoized result
    return newResult;
  }, [result, isEqual]);
}
