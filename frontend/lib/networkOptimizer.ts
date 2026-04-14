/**
 * Network Optimizer - Points 1181-1220
 * Advanced network optimization, request deduplication, caching, and offline support
 */

// Type definitions (React Query types)
interface QueryClientConfig {
  defaultOptions?: {
    queries?: {
      staleTime?: number;
      gcTime?: number;
      retry?: number | ((count: number) => boolean);
      retryDelay?: (attemptIndex: number) => number;
      refetchOnWindowFocus?: boolean;
      refetchOnReconnect?: boolean;
      refetchOnMount?: boolean;
    };
    mutations?: {
      retry?: number;
      retryDelay?: (attemptIndex: number) => number;
    };
  };
}

class QueryClient {
  constructor(config?: QueryClientConfig) {}
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export interface PrefetchConfig {
  delay?: number;
  staleTime?: number;
}

export interface BatchRequest {
  url: string;
  method: string;
  data?: unknown;
}

export interface BatchResponse {
  url: string;
  status: number;
  data: unknown;
}

/**
 * Main NetworkManager class for optimized data fetching
 */
export class NetworkManager {
  private queryClient: QueryClient | null = null;
  private requestCache = new Map<string, CacheEntry<unknown>>();
  private inflightRequests = new Map<string, Promise<unknown>>();
  private indexedDBStore: IDBDatabase | null = null;
  private offlineChanges: Map<string, unknown> = new Map();
  private wsConnection: WebSocket | null = null;
  private wsReconnectAttempts = 0;
  private wsMaxReconnectAttempts = 5;
  private wsReconnectDelay = 1000;

  constructor() {
    this.initializeIndexedDB();
  }

  /**
   * Create optimized React Query client with sensible defaults
   */
  createQueryClient(): QueryClient {
    const config: QueryClientConfig = {
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60 * 5,
          gcTime: 1000 * 60 * 10,
          retry: 3,
          retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
          refetchOnWindowFocus: false,
          refetchOnReconnect: true,
          refetchOnMount: false,
        },
        mutations: {
          retry: 2,
          retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
        },
      },
    };

    this.queryClient = new QueryClient(config);
    return this.queryClient;
  }

  /**
   * Deduplicate identical in-flight requests
   */
  async deduplicateRequests<T>(
    key: string,
    requestFn: () => Promise<T>
  ): Promise<T> {
    // Check if request is already in flight
    if (this.inflightRequests.has(key)) {
      return (await this.inflightRequests.get(key)) as T;
    }

    // Start new request
    const promise = requestFn()
      .then((result) => {
        this.inflightRequests.delete(key);
        return result;
      })
      .catch((error) => {
        this.inflightRequests.delete(key);
        throw error;
      });

    this.inflightRequests.set(key, promise);
    return promise as Promise<T>;
  }

  /**
   * Prefetch data on element hover
   */
  prefetchOnHover(
    element: HTMLElement,
    prefetchFn: () => Promise<unknown>,
    config: PrefetchConfig = {}
  ): void {
    const { delay = 200 } = config;
    let timeoutId: ReturnType<typeof setTimeout>;

    const handleMouseEnter = () => {
      timeoutId = setTimeout(async () => {
        try {
          await prefetchFn();
        } catch (error) {
          console.error('Prefetch failed:', error);
        }
      }, delay);
    };

    const handleMouseLeave = () => {
      clearTimeout(timeoutId);
    };

    element.addEventListener('mouseenter', handleMouseEnter);
    element.addEventListener('mouseleave', handleMouseLeave);
  }

  /**
   * Load multiple independent resources in parallel
   */
  async loadInParallel<T extends Record<string, unknown>>(
    loaders: Record<keyof T, () => Promise<T[keyof T]>>
  ): Promise<T> {
    const results = await Promise.all(
      Object.entries(loaders).map(async ([key, loader]) => [
        key,
        await loader(),
      ])
    );

    return Object.fromEntries(results) as T;
  }

  /**
   * Parse streaming JSON responses
   */
  async parseStreamingJSON<T>(response: Response): Promise<T> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No readable stream');

    let buffer = '';
    const decoder = new TextDecoder();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Try to parse complete JSON objects
      const lines = buffer.split('\n');
      buffer = lines[lines.length - 1]; // Keep incomplete line in buffer

      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].trim()) {
          try {
            return JSON.parse(lines[i]) as T;
          } catch {
            // Continue if not valid JSON yet
          }
        }
      }
    }

    // Parse remaining buffer
    return JSON.parse(buffer) as T;
  }

  /**
   * Reconnect WebSocket with exponential backoff
   */
  async reconnectWebSocket(url: string, maxAttempts = 5): Promise<WebSocket> {
    const delay = Math.min(1000 * Math.pow(2, this.wsReconnectAttempts), 30000);

    return new Promise((resolve, reject) => {
      const attemptConnection = () => {
        try {
          const ws = new WebSocket(url);

          ws.onopen = () => {
            this.wsReconnectAttempts = 0;
            this.wsConnection = ws;
            resolve(ws);
          };

          ws.onerror = () => {
            if (this.wsReconnectAttempts < maxAttempts) {
              this.wsReconnectAttempts++;
              setTimeout(attemptConnection, delay);
            } else {
              reject(new Error(`Failed to connect after ${maxAttempts} attempts`));
            }
          };
        } catch (error) {
          reject(error);
        }
      };

      attemptConnection();
    });
  }

  /**
   * Multiplex multiple SSE (Server-Sent Events) event types
   */
  multiplexSSE(url: string): Map<string, ((data: unknown) => void)[]> {
    const subscribers = new Map<string, ((data: unknown) => void)[]>();
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { type, payload } = data;

        if (subscribers.has(type)) {
          subscribers.get(type)?.forEach((callback) => {
            callback(payload);
          });
        }
      } catch (error) {
        console.error('SSE parse error:', error);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return subscribers;
  }

  /**
   * Cache in IndexedDB for offline support
   */
  private async initializeIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('TrackCueCache', 1);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        this.indexedDBStore = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Store data in IndexedDB
   */
  async cacheInIndexedDB<T>(key: string, data: T, ttl?: number): Promise<void> {
    if (!this.indexedDBStore) return;

    return new Promise((resolve, reject) => {
      const tx = this.indexedDBStore!.transaction(['cache'], 'readwrite');
      const store = tx.objectStore('cache');

      const entry = {
        key,
        data,
        timestamp: Date.now(),
        expiresAt: ttl ? Date.now() + ttl : Infinity,
      };

      const request = store.put(entry);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  /**
   * Retrieve data from IndexedDB
   */
  async getFromIndexedDB<T>(key: string): Promise<T | null> {
    if (!this.indexedDBStore) return null;

    return new Promise((resolve, reject) => {
      const tx = this.indexedDBStore!.transaction(['cache'], 'readonly');
      const store = tx.objectStore('cache');
      const request = store.get(key);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        const entry = request.result;
        if (!entry) {
          resolve(null);
          return;
        }

        // Check if expired
        if (entry.expiresAt < Date.now()) {
          // Cleanup expired entry
          const delTx = this.indexedDBStore!.transaction(['cache'], 'readwrite');
          delTx.objectStore('cache').delete(key);
          resolve(null);
        } else {
          resolve(entry.data as T);
        }
      };
    });
  }

  /**
   * Sync offline changes with server
   */
  async syncOfflineChanges(syncFn: (changes: Map<string, unknown>) => Promise<void>): Promise<void> {
    try {
      await syncFn(this.offlineChanges);
      this.offlineChanges.clear();
    } catch (error) {
      console.error('Sync failed, keeping changes for retry:', error);
    }
  }

  /**
   * Track offline change
   */
  trackOfflineChange(key: string, data: unknown): void {
    this.offlineChanges.set(key, data);
  }

  /**
   * Batch multiple API requests into a single request
   */
  async batchAPIRequests(
    baseUrl: string,
    requests: BatchRequest[]
  ): Promise<BatchResponse[]> {
    const response = await fetch(`${baseUrl}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    });

    if (!response.ok) {
      throw new Error(`Batch request failed: ${response.statusText}`);
    }

    return response.json() as Promise<BatchResponse[]>;
  }

  /**
   * Get request from memory cache
   */
  getFromMemoryCache<T>(key: string): T | null {
    const entry = this.requestCache.get(key) as CacheEntry<T> | undefined;

    if (!entry) return null;

    // Check if expired
    if (entry.expiresAt < Date.now()) {
      this.requestCache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Store request in memory cache
   */
  setMemoryCache<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
    this.requestCache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Clear memory cache
   */
  clearMemoryCache(): void {
    this.requestCache.clear();
  }

  /**
   * Get in-flight request count
   */
  getInflightRequestCount(): number {
    return this.inflightRequests.size;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.inflightRequests.clear();
    this.requestCache.clear();
    this.offlineChanges.clear();

    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }

    if (this.indexedDBStore) {
      this.indexedDBStore.close();
    }
  }
}

export default NetworkManager;
