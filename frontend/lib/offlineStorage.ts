/**
 * Offline Storage Library
 * IndexedDB wrapper for caching tracks and managing offline actions
 */

export interface CachedTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  bpm?: number;
  key?: string;
  energy?: number;
  danceability?: number;
  genre?: string;
  created_at: string;
}

export interface PendingAction {
  id: string;
  type: "upload" | "edit" | "delete" | "create_cue" | "create_playlist";
  data: any;
  timestamp: number;
  status: "pending" | "failed";
  retries: number;
}

class OfflineStorage {
  private dbName = "trackcue-offline";
  private version = 1;
  private db: IDBDatabase | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.initNetworkListeners();
    }
  }

  /**
   * Initialize IndexedDB database
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is not supported"));
        return;
      }

      const request = window.indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create tracks store
        if (!db.objectStoreNames.contains("tracks")) {
          const tracksStore = db.createObjectStore("tracks", { keyPath: "id" });
          tracksStore.createIndex("created_at", "created_at", { unique: false });
        }

        // Create playlists store
        if (!db.objectStoreNames.contains("playlists")) {
          db.createObjectStore("playlists", { keyPath: "id" });
        }

        // Create pending actions store
        if (!db.objectStoreNames.contains("pendingActions")) {
          const actionsStore = db.createObjectStore("pendingActions", { keyPath: "id" });
          actionsStore.createIndex("timestamp", "timestamp", { unique: false });
          actionsStore.createIndex("status", "status", { unique: false });
        }
      };
    });
  }

  /**
   * Cache a track
   */
  async cacheTrack(track: CachedTrack): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["tracks"], "readwrite");
      const store = transaction.objectStore("tracks");
      const request = store.put(track);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Get a cached track by ID
   */
  async getCachedTrack(id: string): Promise<CachedTrack | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["tracks"], "readonly");
      const store = transaction.objectStore("tracks");
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  /**
   * Get all cached tracks
   */
  async getCachedTracks(): Promise<CachedTrack[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["tracks"], "readonly");
      const store = transaction.objectStore("tracks");
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  /**
   * Add a pending action
   */
  async addPendingAction(
    type: PendingAction["type"],
    data: any
  ): Promise<string> {
    if (!this.db) await this.init();

    const actionId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const action: PendingAction = {
      id: actionId,
      type,
      data,
      timestamp: Date.now(),
      status: "pending",
      retries: 0,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["pendingActions"], "readwrite");
      const store = transaction.objectStore("pendingActions");
      const request = store.put(action);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(actionId);
    });
  }

  /**
   * Get all pending actions
   */
  async getPendingActions(): Promise<PendingAction[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["pendingActions"], "readonly");
      const store = transaction.objectStore("pendingActions");
      const index = store.index("status");
      const request = index.getAll("pending");

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  /**
   * Mark an action as completed
   */
  async completePendingAction(actionId: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["pendingActions"], "readwrite");
      const store = transaction.objectStore("pendingActions");
      const request = store.delete(actionId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Mark an action as failed
   */
  async failPendingAction(actionId: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["pendingActions"], "readwrite");
      const store = transaction.objectStore("pendingActions");
      const getRequest = store.get(actionId);

      getRequest.onsuccess = () => {
        const action = getRequest.result;
        if (action) {
          action.status = "failed";
          action.retries += 1;
          const updateRequest = store.put(action);
          updateRequest.onerror = () => reject(updateRequest.error);
          updateRequest.onsuccess = () => resolve();
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Clear all pending actions
   */
  async clearPendingActions(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(["pendingActions"], "readwrite");
      const store = transaction.objectStore("pendingActions");
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Sync pending actions with server
   */
  async syncWithServer(token: string): Promise<void> {
    const actions = await this.getPendingActions();

    for (const action of actions) {
      try {
        // Retry the action
        const response = await this.executeAction(action, token);

        if (response.ok) {
          await this.completePendingAction(action.id);
        } else {
          await this.failPendingAction(action.id);
        }
      } catch (error) {
        console.error(`Error syncing action ${action.id}:`, error);
        await this.failPendingAction(action.id);
      }
    }
  }

  /**
   * Execute a pending action against the server
   */
  private async executeAction(
    action: PendingAction,
    token: string
  ): Promise<Response> {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    switch (action.type) {
      case "upload":
        return fetch("/api/v1/tracks/upload", {
          method: "POST",
          headers,
          body: JSON.stringify(action.data),
        });

      case "edit":
        return fetch(`/api/v1/tracks/${action.data.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(action.data),
        });

      case "delete":
        return fetch(`/api/v1/tracks/${action.data.id}`, {
          method: "DELETE",
          headers,
        });

      case "create_cue":
        return fetch("/api/v1/cues", {
          method: "POST",
          headers,
          body: JSON.stringify(action.data),
        });

      case "create_playlist":
        return fetch("/api/v1/playlists", {
          method: "POST",
          headers,
          body: JSON.stringify(action.data),
        });

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Initialize network status listeners
   */
  private initNetworkListeners(): void {
    window.addEventListener("online", async () => {
      const token = localStorage.getItem("token");
      if (token) {
        try {
          await this.syncWithServer(token);
          // Dispatch custom event for sync completion
          window.dispatchEvent(new Event("offline-sync-complete"));
        } catch (error) {
          console.error("Error during offline sync:", error);
        }
      }
    });

    window.addEventListener("offline", () => {
      window.dispatchEvent(new Event("offline-mode-enabled"));
    });
  }

  /**
   * Get current online status
   */
  isOnline(): boolean {
    return typeof navigator !== "undefined" && navigator.onLine;
  }
}

// Export singleton instance
export const offlineDb = new OfflineStorage();

// Auto-init on first import (client-side only)
if (typeof window !== "undefined") {
  offlineDb.init().catch((error) => {
    console.warn("Failed to initialize offline storage:", error);
  });
}
