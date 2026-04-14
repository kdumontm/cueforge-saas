/**
 * PWA Manager for TrackCue
 * Handles service worker registration, offline support, push notifications,
 * background sync, adaptive loading, battery optimization, and resumable uploads.
 */

import { useEffect, useCallback, useRef } from 'react';

/**
 * Cache strategy types
 */
export type CacheStrategy = 'network-first' | 'cache-first' | 'stale-while-revalidate';

/**
 * Network type detection result
 */
export interface NetworkInfo {
  type: string;
  effectiveType: '4g' | '3g' | '2g' | 'slow-4g';
  downlink: number; // Mbps
  rtt: number; // milliseconds
  saveData: boolean;
}

/**
 * Background sync configuration
 */
export interface BackgroundSyncConfig {
  minInterval: number;
  maxInterval: number;
  maxRetries: number;
  retryDelay: number;
}

/**
 * Push notification options
 */
export interface PushNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, any>;
}

/**
 * Resumable upload state
 */
export interface ResumableUploadState {
  fileId: string;
  fileName: string;
  fileSize: number;
  uploadedBytes: number;
  chunkSize: number;
  totalChunks: number;
  currentChunk: number;
}

/**
 * PWA Manager Class
 * Central hub for PWA functionality
 */
export class PWAManager {
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  private backgroundSyncTag = 'trackcue-sync';
  private cacheStrategy: Map<string, CacheStrategy> = new Map();
  private resumableUploads: Map<string, ResumableUploadState> = new Map();
  private isOnline: boolean = navigator.onLine;
  private networkInfo: NetworkInfo | null = null;

  constructor() {
    this.initializeNetworkDetection();
  }

  /**
   * Register service worker
   */
  async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Workers are not supported');
      return null;
    }

    try {
      this.serviceWorkerRegistration = await navigator.serviceWorker.register(
        '/sw.js',
        { scope: '/' }
      );

      console.log('Service Worker registered successfully');

      // Listen for updates
      this.serviceWorkerRegistration.addEventListener('updatefound', () => {
        const newWorker = this.serviceWorkerRegistration!.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available, notify user
              this.notifyAppUpdate();
            }
          });
        }
      });

      // Handle controller change
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('Service Worker controller changed');
      });

      return this.serviceWorkerRegistration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return null;
    }
  }

  /**
   * Configure cache strategy for specific paths
   */
  configureCacheStrategy(
    pathPattern: string,
    strategy: CacheStrategy
  ): void {
    this.cacheStrategy.set(pathPattern, strategy);

    // Send configuration to service worker
    if (this.serviceWorkerRegistration?.active) {
      this.serviceWorkerRegistration.active.postMessage({
        type: 'CONFIGURE_CACHE_STRATEGY',
        pathPattern,
        strategy,
      });
    }
  }

  /**
   * Enable background sync for offline analysis results
   */
  async enableBackgroundSync(config: Partial<BackgroundSyncConfig> = {}): Promise<void> {
    if (!('backgroundSync' in ServiceWorkerRegistration.prototype)) {
      console.warn('Background Sync API not supported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration.sync) {
        await registration.sync.register(this.backgroundSyncTag);
        console.log('Background sync enabled');
      }
    } catch (error) {
      console.error('Background sync registration failed:', error);
    }
  }

  /**
   * Setup push notifications for analysis completion
   */
  async setupPushNotifications(): Promise<void> {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('Notification permission denied');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
        ),
      });

      // Send subscription to backend
      await this.sendSubscriptionToBackend(subscription);
      console.log('Push notifications setup complete');
    } catch (error) {
      console.error('Push notification setup failed:', error);
    }
  }

  /**
   * Send a push notification
   */
  async sendPushNotification(options: PushNotificationOptions): Promise<void> {
    if (Notification.permission === 'granted') {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(options.title, {
        body: options.body,
        icon: options.icon || '/icons/icon-192x192.png',
        badge: options.badge || '/icons/badge-72x72.png',
        tag: options.tag,
        data: options.data,
      });
    }
  }

  /**
   * Configure offline storage with IndexedDB
   */
  async configureOfflineStorage(): Promise<void> {
    if (!('indexedDB' in window)) {
      console.warn('IndexedDB not supported');
      return;
    }

    try {
      const dbRequest = indexedDB.open('trackcue', 1);

      dbRequest.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores
        if (!db.objectStoreNames.contains('analyses')) {
          db.createObjectStore('analyses', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('queue')) {
          db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'url' });
        }
      };

      dbRequest.onerror = () => {
        console.error('IndexedDB initialization failed');
      };
    } catch (error) {
      console.error('Offline storage configuration failed:', error);
    }
  }

  /**
   * Detect network type and quality
   */
  private initializeNetworkDetection(): void {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      this.updateNetworkInfo(connection);

      connection.addEventListener('change', () => {
        this.updateNetworkInfo(connection);
      });
    }

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncOfflineData();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  /**
   * Update network information
   */
  private updateNetworkInfo(connection: any): void {
    this.networkInfo = {
      type: connection.type || 'unknown',
      effectiveType: connection.effectiveType || '4g',
      downlink: connection.downlink || 0,
      rtt: connection.rtt || 0,
      saveData: connection.saveData || false,
    };

    this.adaptQualityToNetwork();
  }

  /**
   * Get current network information
   */
  getNetworkInfo(): NetworkInfo | null {
    return this.networkInfo;
  }

  /**
   * Detect if connection is slow
   */
  isSlowConnection(): boolean {
    if (!this.networkInfo) return false;
    return (
      this.networkInfo.effectiveType === '2g' ||
      this.networkInfo.effectiveType === '3g' ||
      this.networkInfo.effectiveType === 'slow-4g' ||
      (this.networkInfo.downlink && this.networkInfo.downlink < 1)
    );
  }

  /**
   * Adapt quality and loading strategy based on network
   */
  private adaptQualityToNetwork(): void {
    const quality = this.isSlowConnection() ? 'low' : 'high';

    // Send to service worker
    if (this.serviceWorkerRegistration?.active) {
      this.serviceWorkerRegistration.active.postMessage({
        type: 'ADAPT_QUALITY',
        quality,
        networkInfo: this.networkInfo,
      });
    }

    // Also available for components
    window.dispatchEvent(
      new CustomEvent('networkQualityChange', { detail: { quality } })
    );
  }

  /**
   * Optimize for battery saving
   */
  optimizeForBattery(): void {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        const updateBatteryStatus = () => {
          const isLowBattery = battery.level < 0.2;
          const isCharging = battery.charging;

          // Disable animations and heavy processing if low battery
          if (isLowBattery && !isCharging) {
            document.documentElement.style.setProperty('--disable-animations', '1');
            this.reduceProcessingLoad();
          } else {
            document.documentElement.style.removeProperty('--disable-animations');
          }
        };

        updateBatteryStatus();
        battery.addEventListener('levelchange', updateBatteryStatus);
        battery.addEventListener('chargingchange', updateBatteryStatus);
      });
    }
  }

  /**
   * Reduce processing load
   */
  private reduceProcessingLoad(): void {
    if (this.serviceWorkerRegistration?.active) {
      this.serviceWorkerRegistration.active.postMessage({
        type: 'REDUCE_PROCESSING',
      });
    }
  }

  /**
   * Handle app install prompt
   */
  async handleAppInstall(): Promise<void> {
    let deferredPrompt: BeforeInstallPromptEvent | null = null;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;

      // Show install button
      this.showInstallPrompt(deferredPrompt);
    });

    window.addEventListener('appinstalled', () => {
      console.log('App installed');
      deferredPrompt = null;
    });
  }

  /**
   * Show install prompt
   */
  private showInstallPrompt(prompt: BeforeInstallPromptEvent): void {
    // Dispatch event for React components to handle
    window.dispatchEvent(
      new CustomEvent('showInstallPrompt', { detail: { prompt } })
    );
  }

  /**
   * Configure responsive audio handling for mobile
   */
  configureResponsiveAudio(): void {
    // Handle audio interruptions
    if ('mediaSession' in navigator) {
      const mediaSession = navigator.mediaSession;

      mediaSession.setActionHandler('play', () => {
        window.dispatchEvent(new CustomEvent('audioPlay'));
      });

      mediaSession.setActionHandler('pause', () => {
        window.dispatchEvent(new CustomEvent('audioPause'));
      });

      mediaSession.setActionHandler('stop', () => {
        window.dispatchEvent(new CustomEvent('audioStop'));
      });
    }

    // Handle route changes for audio context
    window.addEventListener('popstate', () => {
      window.dispatchEvent(new CustomEvent('routeChange'));
    });
  }

  /**
   * Enable resumable upload for large files
   */
  async enableResumableUpload(file: File, uploadUrl: string): Promise<void> {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    const fileId = `${file.name}-${file.size}-${Date.now()}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    this.resumableUploads.set(fileId, {
      fileId,
      fileName: file.name,
      fileSize: file.size,
      uploadedBytes: 0,
      chunkSize: CHUNK_SIZE,
      totalChunks,
      currentChunk: 0,
    });

    try {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        await this.uploadChunk(fileId, chunk, i, totalChunks, uploadUrl);

        // Update progress
        const uploadState = this.resumableUploads.get(fileId);
        if (uploadState) {
          uploadState.uploadedBytes = end;
          uploadState.currentChunk = i + 1;
        }
      }

      this.resumableUploads.delete(fileId);
      console.log('File upload complete');
    } catch (error) {
      console.error('Resume upload failed:', error);
    }
  }

  /**
   * Upload a single chunk
   */
  private async uploadChunk(
    fileId: string,
    chunk: Blob,
    chunkIndex: number,
    totalChunks: number,
    uploadUrl: string
  ): Promise<void> {
    const formData = new FormData();
    formData.append('file_id', fileId);
    formData.append('chunk_index', chunkIndex.toString());
    formData.append('total_chunks', totalChunks.toString());
    formData.append('chunk', chunk);

    const response = await fetch(`${uploadUrl}?chunk=${chunkIndex}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
  }

  /**
   * Configure touch optimizations for mobile
   */
  configureTouchOptimizations(): void {
    // Ensure touch targets are at least 44x44px
    const style = document.createElement('style');
    style.textContent = `
      @media (hover: none) and (pointer: coarse) {
        button, a, [role="button"] {
          min-height: 44px;
          min-width: 44px;
          padding: 12px 16px;
        }
      }
    `;
    document.head.appendChild(style);

    // Enable swipe gesture detection
    this.enableSwipeGestures();
  }

  /**
   * Enable swipe gesture detection
   */
  private enableSwipeGestures(): void {
    let touchStartX = 0;
    let touchEndX = 0;

    document.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    });

    document.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      this.handleSwipe(touchStartX, touchEndX);
    });
  }

  /**
   * Handle swipe gestures
   */
  private handleSwipe(startX: number, endX: number): void {
    const threshold = 50;
    const diff = startX - endX;

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        // Swiped left
        window.dispatchEvent(new CustomEvent('swipeLeft'));
      } else {
        // Swiped right
        window.dispatchEvent(new CustomEvent('swipeRight'));
      }
    }
  }

  /**
   * Sync offline data when back online
   */
  private async syncOfflineData(): Promise<void> {
    if (!('indexedDB' in window)) return;

    try {
      const dbRequest = indexedDB.open('trackcue', 1);
      dbRequest.onsuccess = async (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction('queue', 'readonly');
        const store = transaction.objectStore('queue');
        const allRecords = await new Promise<any[]>((resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        // Sync each queued item
        for (const record of allRecords) {
          try {
            await this.syncQueuedItem(record);
          } catch (error) {
            console.error('Failed to sync item:', error);
          }
        }
      };
    } catch (error) {
      console.error('Offline sync failed:', error);
    }
  }

  /**
   * Sync a single queued item
   */
  private async syncQueuedItem(item: any): Promise<void> {
    // Implementation depends on your API structure
    const response = await fetch(item.url, {
      method: item.method || 'POST',
      body: JSON.stringify(item.data),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.statusText}`);
    }
  }

  /**
   * Send subscription to backend
   */
  private async sendSubscriptionToBackend(
    subscription: PushSubscription
  ): Promise<void> {
    await fetch('/api/v1/push-subscriptions', {
      method: 'POST',
      body: JSON.stringify(subscription),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Convert VAPID key
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  /**
   * Notify user of app update
   */
  private notifyAppUpdate(): void {
    window.dispatchEvent(
      new CustomEvent('appUpdate', {
        detail: {
          message: 'New version available. Please refresh.',
        },
      })
    );
  }

  /**
   * Get resumable upload progress
   */
  getUploadProgress(fileId: string): ResumableUploadState | undefined {
    return this.resumableUploads.get(fileId);
  }

  /**
   * Check if app is online
   */
  isAppOnline(): boolean {
    return this.isOnline;
  }
}

/**
 * React hook for PWA Manager
 */
export function usePWAManager() {
  const pwaManagerRef = useRef<PWAManager | null>(null);

  useEffect(() => {
    if (!pwaManagerRef.current) {
      pwaManagerRef.current = new PWAManager();

      // Initialize all PWA features
      const initializePWA = async () => {
        await pwaManagerRef.current!.registerServiceWorker();
        pwaManagerRef.current!.configureCacheStrategy('/api/*', 'network-first');
        pwaManagerRef.current!.configureCacheStrategy('/static/*', 'cache-first');
        await pwaManagerRef.current!.configureOfflineStorage();
        await pwaManagerRef.current!.enableBackgroundSync();
        await pwaManagerRef.current!.setupPushNotifications();
        pwaManagerRef.current!.configureResponsiveAudio();
        pwaManagerRef.current!.configureTouchOptimizations();
        pwaManagerRef.current!.optimizeForBattery();
        await pwaManagerRef.current!.handleAppInstall();
      };

      initializePWA().catch(console.error);
    }

    return () => {
      // Cleanup if needed
    };
  }, []);

  return pwaManagerRef.current;
}

/**
 * Initialize PWA globally
 */
export function initializePWA() {
  const pwaManager = new PWAManager();
  (window as any).__PWA_MANAGER__ = pwaManager;
  return pwaManager;
}

export default PWAManager;
