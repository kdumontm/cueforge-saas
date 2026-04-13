/**
 * React Performance Utilities (Points 901-960)
 * Helpers for optimizing React components: Suspense, Transitions, Callbacks, Profiling
 */

import React, {
  Suspense,
  ReactNode,
  ComponentType,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  useState,
  useDeferredValue,
  useTransition,
  ErrorInfo,
} from 'react';

// ============================================================================
// withSuspenseBoundary() — HOC that wraps a component in Suspense + ErrorBoundary
// ============================================================================
interface SuspenseBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  errorFallback?: (error: Error) => ReactNode;
}

class SuspenseErrorBoundary extends React.Component<
  SuspenseBoundaryProps,
  { hasError: boolean; error: Error | null }
> {
  constructor(props: SuspenseBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SuspenseErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.errorFallback) {
        return this.props.errorFallback(this.state.error!);
      }
      return React.createElement(
        'div',
        { className: 'p-4 text-red-600' },
        `Error loading component: ${this.state.error?.message}`
      );
    }

    return React.createElement(
      Suspense,
      { fallback: this.props.fallback || React.createElement('div', { className: 'p-4' }, 'Loading...') },
      this.props.children
    );
  }
}

export function withSuspenseBoundary<P extends object>(
  Component: ComponentType<P>,
  fallback?: ReactNode,
  errorFallback?: (error: Error) => ReactNode
): ComponentType<P> {
  return (props: P) =>
    React.createElement(
      SuspenseErrorBoundary,
      { fallback, errorFallback, children: React.createElement(Component, props) }
    );
}

// ============================================================================
// useDeferredSearch() — useDeferredValue + debounce for search queries
// ============================================================================
export function useDeferredSearch(query: string, delayMs: number = 300): string {
  const deferredQuery = useDeferredValue(query);
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(deferredQuery);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [deferredQuery, delayMs]);

  return debouncedQuery;
}

// ============================================================================
// useTransitionAction() — useTransition hook for non-urgent actions
// ============================================================================
export function useTransitionAction() {
  const [isPending, startTransition] = useTransition();

  const executeTransition = useCallback((callback: () => void | Promise<void>) => {
    startTransition(async () => {
      await callback();
    });
  }, []);

  return { isPending, executeTransition };
}

// ============================================================================
// createLazyTab() — Factory for creating lazy-loaded tabs with React.lazy
// ============================================================================
interface LazyTabConfig {
  name: string;
  component: () => Promise<{ default: ComponentType }>;
  fallback?: ReactNode;
}

export function createLazyTab(config: LazyTabConfig) {
  const LazyComponent = React.lazy(config.component);

  return {
    name: config.name,
    component: (props: any) =>
      React.createElement(
        Suspense,
        { fallback: config.fallback || React.createElement('div', { className: 'p-4' }, 'Loading tab...') },
        React.createElement(LazyComponent, props)
      ),
  };
}

// ============================================================================
// useRenderProfiler() — Hook that logs render times (dev mode only)
// ============================================================================
export function useRenderProfiler(componentName: string) {
  const renderStartRef = useRef<number>(0);

  useEffect(() => {
    renderStartRef.current = performance.now();

    return () => {
      if (typeof window !== 'undefined' && (window as any).__DEV__) {
        const renderTime = performance.now() - renderStartRef.current;
        console.log(`[Profiler] ${componentName} rendered in ${renderTime.toFixed(2)}ms`);
      }
    };
  });
}

// ============================================================================
// useStableCallback() — useCallback with stable ref (no deps)
// ============================================================================
export function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback((...args: any[]) => {
    return callbackRef.current(...args);
  }, []) as T;
}

// ============================================================================
// usePreviousValue() — Hook that returns the previous value
// ============================================================================
export function usePreviousValue<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

// ============================================================================
// useIsVisible() — IntersectionObserver hook for lazy rendering
// ============================================================================
export function useIsVisible(ref: React.RefObject<HTMLElement>, threshold: number = 0.1): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold }
    );

    observer.observe(ref.current);

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [ref, threshold]);

  return isVisible;
}

// ============================================================================
// BatchUpdater — Class for batching React state updates
// ============================================================================
export class BatchUpdater {
  private batch: Map<string, any> = new Map();
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;
  private callback: (batch: Record<string, any>) => void;
  private delayMs: number;

  constructor(callback: (batch: Record<string, any>) => void, delayMs: number = 16) {
    this.callback = callback;
    this.delayMs = delayMs;
  }

  add(key: string, value: any) {
    this.batch.set(key, value);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.batchTimeout !== null) return;

    this.batchTimeout = setTimeout(() => {
      this.flush();
    }, this.delayMs);
  }

  flush() {
    if (this.batchTimeout !== null) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    if (this.batch.size > 0) {
      const batchData = Object.fromEntries(this.batch);
      this.batch.clear();
      this.callback(batchData);
    }
  }

  clear() {
    this.batch.clear();
    if (this.batchTimeout !== null) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
  }
}

// ============================================================================
// ErrorBoundaryWithFallback — Error boundary with type-specific fallback UI
// ============================================================================
export interface ErrorBoundaryConfig {
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetOnPropsChange?: string[];
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryWithFallbackProps {
  children: ReactNode;
  config?: ErrorBoundaryConfig;
}

export class ErrorBoundaryWithFallback extends React.Component<
  ErrorBoundaryWithFallbackProps,
  ErrorBoundaryState
> {
  private previousProps: any;

  constructor(props: ErrorBoundaryWithFallbackProps) {
    super(props);
    this.state = { hasError: false, error: null };
    this.previousProps = props;
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.config?.onError?.(error, errorInfo);
    console.error('ErrorBoundaryWithFallback caught:', error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryWithFallbackProps) {
    const { config } = this.props;
    if (!config?.resetOnPropsChange) return;

    const shouldReset = config.resetOnPropsChange.some(
      (key: string) => (prevProps as any)[key] !== (this.props as any)[key]
    );

    if (shouldReset && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      const error = this.state.error;
      const errorType = error?.name || 'Unknown Error';

      return React.createElement(
        'div',
        { className: 'p-6 border border-red-300 bg-red-50 rounded-lg' },
        React.createElement('h2', { className: 'text-lg font-bold text-red-800 mb-2' }, errorType),
        React.createElement('p', { className: 'text-red-700 mb-4' }, error?.message),
        React.createElement(
          'button',
          {
            onClick: () => this.setState({ hasError: false, error: null }),
            className: 'px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700',
          },
          'Try Again'
        )
      );
    }

    return this.props.children;
  }
}

export default {
  withSuspenseBoundary,
  useDeferredSearch,
  useTransitionAction,
  createLazyTab,
  useRenderProfiler,
  useStableCallback,
  usePreviousValue,
  useIsVisible,
  BatchUpdater,
  ErrorBoundaryWithFallback,
};
