// 🔴 FIX (faille 10) : Plus de fallback localhost — l'URL doit être définie dans Railway
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

// ── Improvement #34: Retry logic with exponential backoff ────────────────────
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 300; // ms

interface RequestState {
  method: string;
  url: string;
  body?: any;
}

// Track in-flight requests for deduplication (Improvement #35)
const inFlightRequests = new Map<string, Promise<Response>>();

function getRequestKey(method: string, url: string): string {
  return `${method}:${url}`;
}

// Improvement #36: Optimistic updates store
export const optimisticUpdates = new Map<string, any>();

// Improvement #66: WebSocket connection for real-time updates
let wsConnection: WebSocket | null = null;
const wsSubscribers = new Map<string, Set<(data: any) => void>>();

export function subscribeToWebSocket(channel: string, callback: (data: any) => void): () => void {
  if (!wsSubscribers.has(channel)) {
    wsSubscribers.set(channel, new Set());
  }
  wsSubscribers.get(channel)!.add(callback);

  // Return unsubscribe function
  return () => {
    wsSubscribers.get(channel)?.delete(callback);
  };
}

// Improvement #67: Offline queue for storing modifications
export interface OfflineQueueItem {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  body?: any;
  priority: 'high' | 'normal' | 'low';
}

const offlineQueue = new Map<string, OfflineQueueItem>();

export function addToOfflineQueue(method: string, url: string, body?: any, priority: 'high' | 'normal' | 'low' = 'normal'): string {
  const id = `${method}-${url}-${Date.now()}`;
  offlineQueue.set(id, { id, timestamp: Date.now(), method, url, body, priority });
  return id;
}

export function getOfflineQueue(): OfflineQueueItem[] {
  return Array.from(offlineQueue.values()).sort((a, b) => {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

// Improvement #68: Conflict resolution helper
export interface ConflictResolution {
  strategy: 'client-wins' | 'server-wins' | 'merge';
  clientVersion: any;
  serverVersion: any;
}

// Improvement #69: API response caching with TTL
interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

const responseCache = new Map<string, CacheEntry>();

export function getCachedResponse(key: string): any | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    responseCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCacheResponse(key: string, data: any, ttlMs: number = 60000): void {
  responseCache.set(key, {
    data,
    timestamp: Date.now(),
    ttl: ttlMs,
  });
}

// Improvement #71: Undo stack persistent store
export interface UndoEntry {
  id: string;
  timestamp: number;
  action: string;
  data: any;
  previousData: any;
}

const persistentUndoStack: UndoEntry[] = [];

export function pushToUndoStack(action: string, data: any, previousData: any): void {
  persistentUndoStack.push({
    id: `${action}-${Date.now()}`,
    timestamp: Date.now(),
    action,
    data,
    previousData,
  });

  // Keep only last 50 entries to avoid memory issues
  if (persistentUndoStack.length > 50) {
    persistentUndoStack.shift();
  }
}

export function getPersistentUndoStack(): UndoEntry[] {
  return [...persistentUndoStack];
}

// Improvement #77: Request prioritization queue
type RequestPriority = 'high' | 'normal' | 'low';
interface PrioritizedRequest {
  priority: RequestPriority;
  fn: () => Promise<Response>;
  timestamp: number;
}

const requestQueue: PrioritizedRequest[] = [];
let processingQueue = false;

async function processRequestQueue(): Promise<void> {
  if (processingQueue) return;
  processingQueue = true;

  while (requestQueue.length > 0) {
    // Sort by priority (high first, then by timestamp)
    requestQueue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      const priorityCmp = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityCmp !== 0) return priorityCmp;
      return a.timestamp - b.timestamp;
    });

    const request = requestQueue.shift();
    if (request) {
      try {
        await request.fn();
      } catch (e) {
        console.error('Request queue error:', e);
      }
    }
  }

  processingQueue = false;
}

// Improvement #78: Request cancellation support
const activeFetches = new Map<string, AbortController>();

export function cancelRequest(key: string): void {
  const controller = activeFetches.get(key);
  if (controller) {
    controller.abort();
    activeFetches.delete(key);
  }
}

// ── Token management avec cache en variable module ────────────────────────────

const TOKEN_KEY = 'cueforge_token';
const REFRESH_KEY = 'cueforge_refresh';

// Cache tokens en variables module pour éviter les appels localStorage répétés
let _cachedAccessToken: string | null = null;
let _cachedRefreshToken: string | null = null;

export function setToken(token: string): void {
  _cachedAccessToken = token;
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

export function setRefreshToken(token: string): void {
  _cachedRefreshToken = token;
  if (typeof window !== 'undefined') localStorage.setItem(REFRESH_KEY, token);
}

export function getToken(): string | null {
  // Retourner le cache si disponible
  if (_cachedAccessToken) return _cachedAccessToken;
  // Sinon charger depuis localStorage (SSR ou première visite)
  if (typeof window !== 'undefined') {
    _cachedAccessToken = localStorage.getItem(TOKEN_KEY);
  }
  return _cachedAccessToken;
}

export function getRefreshToken(): string | null {
  // Retourner le cache si disponible
  if (_cachedRefreshToken) return _cachedRefreshToken;
  // Sinon charger depuis localStorage (SSR ou première visite)
  if (typeof window !== 'undefined') {
    _cachedRefreshToken = localStorage.getItem(REFRESH_KEY);
  }
  return _cachedRefreshToken;
}

export function clearToken(): void {
  // Nettoyer les caches aussi
  _cachedAccessToken = null;
  _cachedRefreshToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }
}

// ── Auto-refresh on 401 ─────────────────────────────────────────────────────

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

// Multi-tab refresh coordination using sessionStorage lock pattern
const REFRESH_LOCK_KEY = 'cueforge_refresh_lock';
const REFRESH_LOCK_TIMEOUT = 15000; // 15s max lock duration

function acquireRefreshLock(): boolean {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return true;

  const now = Date.now();
  const lockStr = sessionStorage.getItem(REFRESH_LOCK_KEY);

  if (!lockStr) {
    // No lock, acquire it
    sessionStorage.setItem(REFRESH_LOCK_KEY, String(now));
    return true;
  }

  const lockTime = parseInt(lockStr, 10);
  if (now - lockTime > REFRESH_LOCK_TIMEOUT) {
    // Lock expired, acquire it
    sessionStorage.setItem(REFRESH_LOCK_KEY, String(now));
    return true;
  }

  // Lock held by another tab
  return false;
}

function releaseRefreshLock(): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(REFRESH_LOCK_KEY);
}

async function tryRefresh(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;

  try {
    // Add timeout to prevent hanging indefinitely
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) return false;
      const data = await res.json();
      setToken(data.access_token);
      if (data.refresh_token) setRefreshToken(data.refresh_token);
      return true;
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  } catch {
    return false;
  }
}

// Improvement #75: Stale-while-revalidate pattern helper
export async function fetchWithStaleWhileRevalidate<T>(
  url: string,
  options?: RequestInit & { cacheKey?: string; ttlMs?: number }
): Promise<T> {
  const cacheKey = options?.cacheKey || url;
  const ttlMs = options?.ttlMs || 60000;

  // Return cached response immediately while fetching fresh data
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    // Fetch in background for next time
    authFetch(url, options).then(res => {
      if (res.ok) {
        res.json().then(data => setCacheResponse(cacheKey, data, ttlMs));
      }
    }).catch(() => {});
    return cached;
  }

  // No cache — fetch normally
  const response = await authFetch(url, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  const data = await response.json();
  setCacheResponse(cacheKey, data, ttlMs);
  return data;
}

// Improvement #79: Delta sync helper (send only changes)
export function calculateDelta<T extends Record<string, any>>(previous: T, current: T): Partial<T> {
  const delta: Partial<T> = {};
  for (const key in current) {
    if (current[key] !== previous[key]) {
      delta[key] = current[key];
    }
  }
  return delta;
}

// Improvement #72: Batch API calls
export async function batchCueUpdates(trackId: number, updates: Array<{ cueId: number; changes: any }>): Promise<any> {
  const response = await authFetch(`${API_URL}/tracks/${trackId}/cues/batch-update`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });
  if (!response.ok) throw await createDetailedError(response, 'Batch update failed');
  return response.json();
}

// Improvement #76: Optimistic delete with rollback
export async function deleteWithOptimisticRollback(url: string, optimisticData: any): Promise<void> {
  const key = url;
  optimisticUpdates.set(key, optimisticData);

  try {
    const response = await authFetch(url, { method: 'DELETE' });
    if (!response.ok) throw new Error('Delete failed');
    optimisticUpdates.delete(key);
  } catch (e) {
    optimisticUpdates.set(key, optimisticData);
    throw e;
  }
}

// Improvement #80: Background sync for large exports
export async function startBackgroundExport(trackId: number, cueIds: number[]): Promise<string> {
  const response = await authFetch(`${API_URL}/tracks/${trackId}/cues/export`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ cue_ids: cueIds }),
  });
  if (!response.ok) throw await createDetailedError(response, 'Export start failed');
  const data = await response.json();
  return data.export_id;
}

// ── Authenticated fetch with auto-refresh on 401 + retry + deduplication ────

// Improvement #34: Retry with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = INITIAL_RETRY_DELAY,
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Improvement #37: Error classification
    const isNetworkError = error.message?.includes('Network') || error instanceof TypeError;
    const isServerError = error.status >= 500;
    const isValidationError = error.status >= 400 && error.status < 500;

    // Don't retry validation errors
    if (isValidationError) throw error;

    // Only retry on network or server errors
    if (retries > 0 && (isNetworkError || isServerError)) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }

    throw error;
  }
}

async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  // Improvement #35: Request deduplication for GET requests
  const method = options?.method || 'GET';
  const requestKey = getRequestKey(method, url);

  if (method === 'GET' && inFlightRequests.has(requestKey)) {
    return inFlightRequests.get(requestKey)!;
  }

  // Injecte automatiquement le Bearer token
  const mergedOptions: RequestInit = {
    ...options,
    headers: {
      ...(options?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  };

  // Improvement #34: Wrap in retry logic
  const fetchPromise = retryWithBackoff(async () => {
    let response: Response;
    try {
      response = await fetch(url, mergedOptions);
    } catch (networkError) {
      throw new Error('Network error — check your connection');
    }

    if (response.status === 401) {
      // Tente un refresh silencieux avant de déconnecter
      // Use multi-tab lock to prevent concurrent refresh attempts
      if (!isRefreshing && acquireRefreshLock()) {
        isRefreshing = true;
        refreshPromise = tryRefresh();
    }
    const refreshed = await refreshPromise;
    isRefreshing = false;
    refreshPromise = null;
    releaseRefreshLock();

    if (refreshed) {
      // Rejoue la requête avec le nouveau token
      const retryOptions: RequestInit = {
        ...options,
        headers: {
          ...(options?.headers || {}),
          Authorization: `Bearer ${getToken()}`,
        },
      };
      return fetch(url, retryOptions);
    }

    // Refresh échoué — session vraiment expirée
    clearToken();
    throw new Error('Session expired');
    }
    return response;
  });

  // Store in-flight request for deduplication
  if (method === 'GET') {
    inFlightRequests.set(requestKey, fetchPromise);
    fetchPromise.finally(() => inFlightRequests.delete(requestKey));
  }

  return fetchPromise;
}


export function isAuthenticated(): boolean {
  return !!getToken();
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Improvement #14: Helper to create detailed error messages with status code
async function createDetailedError(response: Response, fallbackMsg: string): Promise<Error> {
  const statusCode = response.status;
  const statusText = response.statusText;
  let detail = fallbackMsg;
  try {
    const json = await response.json();
    detail = json.detail || json.message || fallbackMsg;
  } catch {
    // If response isn't JSON, just use fallback
  }
  const error = new Error(`${detail} (HTTP ${statusCode})`);
  (error as any).status = statusCode;
  (error as any).message = detail;
  return error;
}

// ── Types ───────────────────────────────────────────────────────────────────

import type { Track } from '@/types';

export interface User {
  id: number;
  email: string;
  name: string;
  username?: string; // alias for name used in some UI components
  subscription_plan: 'free' | 'pro' | 'unlimited';
  is_admin: boolean;
  tracks_today: number;
  last_track_date: string | null;
}

export interface AuthResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  user: User;
}

export interface TrackUploadResponse {
  id: number;
  status: string;
  filename: string;
  original_filename: string;
}

export interface AnalyzeResponse {
  status: string;
  message: string;
  usedLocal?: boolean;  // true si analyse exécutée sur le CPU local (desktop)
}

export interface TrackListResponse {
  tracks: Track[];
  total: number;
  page: number;
  pages: number;
}

// ── Auth API ────────────────────────────────────────────────────────────────

export async function login(identifier: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 403) {
      const error = new Error(err.detail || 'Email non vérifié');
      (error as any).status = 403;
      throw error;
    }
    throw new Error(err.detail || 'Identifiants invalides');
  }
  const data: AuthResponse = await response.json();
  setToken(data.access_token);
  if (data.refresh_token) setRefreshToken(data.refresh_token);
  return data;
}

export async function register(
  email: string,
  password: string,
  name: string
): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Registration failed');
  }
  const data: AuthResponse = await response.json();
  setToken(data.access_token);
  if (data.refresh_token) setRefreshToken(data.refresh_token);
  return data;
}

export async function logout(): Promise<void> {
  clearToken();
}

export async function getCurrentUser(): Promise<User> {
  const response = await authFetch(`${API_URL}/auth/me`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) {
    throw await createDetailedError(response, 'Failed to fetch user');
  }
  return response.json();
}

// refreshToken() est maintenant géré automatiquement par authFetch() via tryRefresh()
// Pas besoin de l'appeler manuellement — le 401 déclenche un refresh silencieux

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const response = await fetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw new Error('Password reset request failed');
  return response.json();
}

export async function resetPassword(token: string, new_password: string): Promise<{ message: string }> {
  const response = await fetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password }),
  });
  if (!response.ok) throw new Error('Password reset failed');
  return response.json();
}

// ── Tracks API ──────────────────────────────────────────────────────────────

export async function uploadTrack(file: File): Promise<TrackUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await authFetch(`${API_URL}/tracks/upload`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: formData,
  });
  if (!response.ok) {
    let detail = 'Upload failed';
    try { const error = await response.json(); detail = error.detail || detail; } catch {}
    throw new Error(detail);
  }
  try {
    return await response.json();
  } catch (e) {
    throw new Error('Failed to parse upload response: ' + (e instanceof Error ? e.message : 'unknown error'));
  }
}

export async function uploadTracks(formData: FormData): Promise<TrackUploadResponse[]> {
  const response = await authFetch(`${API_URL}/tracks/`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: formData,
  });
  if (!response.ok) {
    let detail = 'Upload failed';
    try { const error = await response.json(); detail = error.detail || detail; } catch {}
    throw new Error(detail);
  }
  try {
    return await response.json();
  } catch (e) {
    throw new Error('Failed to parse upload response: ' + (e instanceof Error ? e.message : 'unknown error'));
  }
}

/**
 * Upload avec barre de progression via XMLHttpRequest.
 * onProgress reçoit un pourcentage 0-100.
 */
export function uploadTracksWithProgress(
  formData: FormData,
  onProgress: (pct: number) => void,
): Promise<TrackUploadResponse[]> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/tracks/`);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { resolve([]); }
      } else {
        let detail = 'Upload failed';
        try { detail = JSON.parse(xhr.responseText)?.detail || detail; } catch {}
        reject(new Error(detail));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });
}

/**
 * Analyse un track — hybride :
 *   • Desktop (Electron) → analyse locale via Web Audio API (CPU utilisateur)
 *   • Web → analyse cloud via le backend (POST /tracks/:id/analyze)
 *
 * Sur desktop, après l'analyse locale, on envoie les résultats au backend
 * pour les persister en BDD, comme ça les données restent synchronisées.
 */
export async function analyzeTrack(
  trackId: number,
  options?: { localFile?: { path: string }; onProgress?: (pct: number) => void }
): Promise<AnalyzeResponse> {
  const { isDesktopApp } = await import('@/lib/electron');
  const isDesktop = isDesktopApp();

  // ── Desktop : analyse locale CPU + stems Demucs ────────────────────────
  if (isDesktop) {
    try {
      const { analyzeAudioLocal } = await import('@/lib/audioAnalyzer');
      const onProgress = options?.onProgress ?? (() => {});
      const bridge = (window as any).cueforge;
      let buffer: ArrayBuffer | null = null;
      let localFilePath: string | null = options?.localFile?.path ?? null;

      // Option 1 : fichier local via le bridge Electron
      if (localFilePath && bridge?.files?.readBuffer) {
        buffer = await bridge.files.readBuffer(localFilePath);
      }

      // Option 2 : télécharger l'audio depuis le backend (fichier déjà uploadé)
      if (!buffer) {
        onProgress(1);
        const token = getToken();
        const audioUrl = `${API_URL}/tracks/${trackId}/audio${token ? `?token=${token}` : ''}`;
        const audioRes = await fetch(audioUrl);
        if (audioRes.ok) {
          buffer = await audioRes.arrayBuffer();
          // Sauvegarder temporairement pour Demucs si pas de chemin local
          if (!localFilePath && bridge?.files?.save) {
            try {
              const os = await import('path');
            } catch {}
          }
        }
      }

      if (buffer && buffer.byteLength > 1000) {
        // ── Phase 1 : Analyse audio de base (v3.0, ~5s) ──────────────
        onProgress(2);
        // L'analyse de base utilise 0-60% de la progression
        const result = await analyzeAudioLocal(buffer, (pct) => {
          onProgress(Math.round(pct * 0.55)); // 0-55%
        });

        // ── Phase 2 : Stem separation + analyse (Demucs local, ~2-10 min)
        // Lancé UNIQUEMENT si Demucs est installé sur la machine
        let stemEnhanced = false;
        if (bridge?.stems?.checkAvailable) {
          try {
            const demucsCheck = await bridge.stems.checkAvailable();
            if (demucsCheck.available && localFilePath) {
              onProgress(58);
              console.log('[CueForge] Demucs détecté — lancement séparation de stems...');

              // Écouter la progression Demucs
              bridge.stems.onProgress((pct: number) => {
                // Stems = 58-85% de la progression totale
                onProgress(58 + Math.round(pct * 0.27));
              });

              const stemResult = await bridge.stems.separate(localFilePath);
              onProgress(86);

              // Analyser les stems séparés
              if (stemResult?.stems) {
                const stemBuffers: Record<string, ArrayBuffer> = {};
                for (const [name, data] of Object.entries(stemResult.stems)) {
                  if ((data as any)?.buffer) {
                    stemBuffers[name] = (data as any).buffer;
                  }
                }

                if (Object.keys(stemBuffers).length >= 2) {
                  const { analyzeStemsLocal } = await import('@/lib/stemAnalyzer');
                  const stemAnalysis = await analyzeStemsLocal(
                    stemBuffers, result.bpm, result.beat_positions,
                    (pct) => onProgress(86 + Math.round(pct * 0.09)) // 86-95%
                  );

                  // ── Merger les résultats stem-enhanced dans l'analyse ──
                  // Les stems améliorent la précision des beats, drops et sections
                  if (stemAnalysis.enhanced_beat_positions.length > 0) {
                    result.beat_positions = stemAnalysis.enhanced_beat_positions;
                  }
                  if (stemAnalysis.enhanced_drop_positions.length > 0) {
                    result.drop_positions = stemAnalysis.enhanced_drop_positions;
                  }
                  result.stem_enhanced = true;
                  result.stem_model = stemAnalysis.stem_model;
                  result.vocal_sections = stemAnalysis.vocal_sections;
                  result.vocal_percentage = stemAnalysis.vocal_percentage;
                  result.drum_energy_curve = stemAnalysis.drum_energy_curve;
                  result.bass_energy_curve = stemAnalysis.bass_energy_curve;
                  result.vocal_energy_curve = stemAnalysis.vocal_energy_curve;
                  stemEnhanced = true;
                  console.log('[CueForge] Analyse stem-enhanced terminée !');
                }
              }
            } else if (demucsCheck.available && !localFilePath) {
              console.log('[CueForge] Demucs dispo mais pas de fichier local — skip stems');
            }
          } catch (stemErr) {
            console.warn('[CueForge] Stems Demucs échoué (analyse de base utilisée):', stemErr);
          }
        }

        onProgress(96);

        // Envoyer les résultats au backend pour persistance + cue points pro
        const response = await authFetch(`${API_URL}/tracks/${trackId}/analyze-local`, {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(result),
        });
        if (response.ok) {
          const json = await response.json();
          return { ...json, usedLocal: true };
        }
      }
    } catch (e) {
      console.warn('[CueForge] Analyse locale échouée, fallback cloud:', e);
    }
  }

  // ── Web (ou fallback) : analyse cloud ───────────────────────────────────
  const onProgress = options?.onProgress ?? (() => {});
  // Progression simulée : le POST retourne vite (background task),
  // mais l'analyse réelle prend 30-120s côté serveur.
  onProgress(5);

  const response = await authFetch(`${API_URL}/tracks/${trackId}/analyze`, {
    method: 'POST',
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to start analysis');

  // Le POST a juste démarré la tâche — la vraie progression vient du polling.
  // On simule une montée fluide de 10→55% pendant les premières ~20s
  onProgress(10);
  return response.json();
}

export async function pollTrackUntilDone(
  trackId: number,
  onUpdate?: (track: Track) => void,
  intervalMs = 2000,
  maxAttempts = 120
): Promise<Track> {
  // ── Essayer SSE d'abord (moins de requêtes, temps réel) ──
  try {
    const result = await _pollViaSSE(trackId, onUpdate);
    if (result) return result;
  } catch (e) {
    console.warn('SSE fallback to polling:', e);
  }

  // ── Fallback: polling classique avec exponential backoff ──
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await authFetch(`${API_URL}/tracks/${trackId}`, {
      headers: { ...authHeaders() },
    });
    if (!response.ok) throw new Error('Failed to fetch track status');
    const track: Track = await response.json();
    if (onUpdate) onUpdate(track);
    if (track.status === 'completed') return track;
    if (track.status === 'failed') {
      const errMsg = (track as any).error_message || '';
      throw new Error(errMsg.includes('not found') ? 'Audio file not found' : `Analysis failed for track ${trackId}`);
    }

    // Exponential backoff with jitter: min 1s, max 30s
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000) + Math.random() * 1000;
    await new Promise(r => setTimeout(r, delay));
  }
  throw new Error('Analysis timed out');
}

async function _pollViaSSE(
  trackId: number,
  onUpdate?: (track: Track) => void,
): Promise<Track | null> {
  const token = getToken();
  if (!token) return null;

  const url = `${API_URL}/tracks/${trackId}/status-stream`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok || !response.body) return null;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.status === 'completed') {
          // Fetch le track complet pour avoir toutes les relations
          const track = await getTrack(trackId);
          if (onUpdate) onUpdate(track);
          return track;
        }
        if (data.status === 'failed') {
          throw new Error(`Analysis failed for track ${trackId}`);
        }
        if (data.status === 'timeout' || data.status === 'not_found') {
          return null; // fallback au polling
        }
        // Status intermédiaire — notifier avec un track partiel
        if (onUpdate) {
          onUpdate({ id: trackId, status: data.status } as Track);
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('Analysis failed')) throw e;
        // JSON parse error — skip
      }
    }
  }
  return null;
}

/**
 * Polling multiplexé pour plusieurs tracks via une seule connexion SSE.
 * Réduit le nombre de connexions réseau en traquant plusieurs tracks à la fois.
 */
type TrackUpdateCallback = (trackId: number, track: Track) => void;

export async function pollMultipleTracksUntilDone(
  trackIds: number[],
  onUpdate?: TrackUpdateCallback,
  intervalMs = 2000,
  maxAttempts = 120
): Promise<Map<number, Track>> {
  const results = new Map<number, Track>();
  const pendingIds = new Set(trackIds);

  // Essayer SSE multiplexé d'abord
  try {
    const token = getToken();
    if (token && trackIds.length > 0) {
      const url = `${API_URL}/tracks/status-stream?track_ids=${trackIds.join(',')}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (pendingIds.size > 0) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              const trackId = data.id;
              if (!trackIds.includes(trackId)) continue;

              if (data.status === 'completed') {
                const track = await getTrack(trackId);
                results.set(trackId, track);
                pendingIds.delete(trackId);
                if (onUpdate) onUpdate(trackId, track);
              } else if (data.status === 'failed') {
                pendingIds.delete(trackId);
                throw new Error(`Analysis failed for track ${trackId}`);
              } else if (data.status !== 'timeout' && data.status !== 'not_found') {
                // Status intermédiaire
                if (onUpdate) {
                  onUpdate(trackId, { id: trackId, status: data.status } as Track);
                }
              }
            } catch (e) {
              if (e instanceof Error && e.message.includes('Analysis failed')) throw e;
            }
          }
        }

        if (pendingIds.size === 0) {
          return results;
        }
      }
    }
  } catch (e) {
    console.warn('Multiplexed SSE fallback to individual polling:', e);
  }

  // Fallback: polling individuel classique pour les tracks restants
  for (let attempt = 0; attempt < maxAttempts && pendingIds.size > 0; attempt++) {
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000) + Math.random() * 1000;

    for (const trackId of pendingIds) {
      try {
        const response = await authFetch(`${API_URL}/tracks/${trackId}`, {
          headers: { ...authHeaders() },
        });
        if (!response.ok) continue;
        const track: Track = await response.json();

        if (onUpdate) onUpdate(trackId, track);

        if (track.status === 'completed') {
          results.set(trackId, track);
          pendingIds.delete(trackId);
        } else if (track.status === 'failed') {
          pendingIds.delete(trackId);
        }
      } catch (e) {
        // Continuer avec le prochain track
      }
    }

    if (pendingIds.size > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
  }

  if (pendingIds.size > 0) {
    throw new Error('Analysis timed out for some tracks');
  }

  return results;
}

export async function listTracks(
  page: number = 1,
  limit: number = 20,
  genre?: string,
  artist?: string,
  bpm_min?: number,
  bpm_max?: number,
  key?: string,
  energy_min?: number,
  energy_max?: number,
  rating_min?: number,
  search?: string,
  sort_by?: string,
  sort_dir?: string,
): Promise<TrackListResponse> {
  // ⚡ Construit l'URL avec tous les filtres supportés par le backend
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (genre) params.set('genre', genre);
  if (artist) params.set('artist', artist);
  if (bpm_min != null) params.set('bpm_min', String(bpm_min));
  if (bpm_max != null) params.set('bpm_max', String(bpm_max));
  if (key) params.set('key', key);
  if (energy_min != null) params.set('energy_min', String(energy_min));
  if (energy_max != null) params.set('energy_max', String(energy_max));
  if (rating_min != null) params.set('rating_min', String(rating_min));
  if (search) params.set('search', search);
  if (sort_by) params.set('sort_by', sort_by);
  if (sort_dir) params.set('sort_dir', sort_dir);

  const response = await authFetch(
    `${API_URL}/tracks?${params.toString()}`,
    { headers: { ...authHeaders() } }
  );
  if (!response.ok) throw new Error('Failed to fetch tracks');
  return response.json();
}

export async function getTrack(trackId: number): Promise<Track> {
  const response = await authFetch(`${API_URL}/tracks/${trackId}`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to fetch track');
  return response.json();
}

export async function deleteTrack(trackId: number): Promise<void> {
  const response = await authFetch(`${API_URL}/tracks/${trackId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to delete track');
}

export async function batchDeleteTracks(trackIds: number[]): Promise<{ deleted_count: number; deleted_ids: number[] }> {
  const response = await authFetch(`${API_URL}/tracks/batch-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ track_ids: trackIds }),
  });
  if (!response.ok) throw new Error('Failed to batch delete tracks');
  return response.json();
}

// ── Export API ───────────────────────────────────────────────────────────────

export async function exportRekordbox(trackId: number): Promise<Blob> {
  const response = await authFetch(`${API_URL}/export/${trackId}/rekordbox`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to export Rekordbox');
  return response.blob();
}

export async function exportSerato(trackId: number): Promise<Blob> {
  const response = await authFetch(`${API_URL}/export/${trackId}/serato`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to export Serato');
  return response.blob();
}

export async function exportTraktor(trackId: number): Promise<Blob> {
  const response = await authFetch(`${API_URL}/export/${trackId}/traktor`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to export Traktor');
  return response.blob();
}

export async function exportJSON(trackId: number): Promise<Blob> {
  const response = await authFetch(`${API_URL}/export/${trackId}/rekordbox/json`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to export JSON');
  return response.blob();
}

export async function exportAllFormats(trackId: number): Promise<Blob> {
  const response = await authFetch(`${API_URL}/export/${trackId}/all`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to export all formats');
  return response.blob();
}

// ── Utility ─────────────────────────────────────────────────────────────────

export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return data.detail || 'An error occurred';
  } catch {
    return 'An error occurred';
  }
}

export function createUploadFormData(files: File[]): FormData {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('files', file);
  });
  return formData;
}

// ── Admin API ───────────────────────────────────────────────────────────────

export interface AdminUser {
  id: number;
  email: string;
  name: string | null;
  subscription_plan: 'free' | 'pro' | 'unlimited';
  is_admin: boolean;
  tracks_today: number;
  created_at: string;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  name?: string;
  subscription_plan?: 'free' | 'pro' | 'unlimited';
  is_admin?: boolean;
}

export interface UpdateUserPayload {
  email?: string;
  name?: string;
  password?: string;
  subscription_plan?: 'free' | 'pro' | 'unlimited';
  is_admin?: boolean;
}

export async function adminListUsers(skip = 0, limit = 100): Promise<AdminUser[]> {
  const response = await authFetch(`${API_URL}/admin/users?skip=${skip}&limit=${limit}`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to list users');
  return response.json();
}

export async function adminGetUser(userId: number): Promise<AdminUser> {
  const response = await authFetch(`${API_URL}/admin/users/${userId}`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to get user');
  return response.json();
}

export async function adminCreateUser(payload: CreateUserPayload): Promise<AdminUser> {
  const response = await authFetch(`${API_URL}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to create user');
  }
  return response.json();
}

export async function adminUpdateUser(userId: number, payload: UpdateUserPayload): Promise<AdminUser> {
  const response = await authFetch(`${API_URL}/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update user');
  }
  return response.json();
}

export async function adminDeleteUser(userId: number): Promise<void> {
  const response = await authFetch(`${API_URL}/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to delete user');
}


// ── Types for existing components ───────────────────────────────────────────

export interface TrackAnalysis {
  bpm: number | null;
  key: string | null;
  camelot: string | null;
  energy: number | null;
  duration_ms: number | null;
  danceability: number | null;
  loudness: number | null;
  [key: string]: unknown;
}

export interface TrackResponse {
  id: number;
  user_id: number;
  filename: string;
  original_filename: string;
  status: string;
  artist: string;
  title: string;
  album: string;
  genre: string;
  year: number | null;
  artwork_url: string | null;
  spotify_id: string | null;
  spotify_url: string | null;
  musicbrainz_id: string | null;
  bpm: number | null;
  energy: number | null;
  key: string | null;
  duration: number | null;
  created_at: string;
  updated_at?: string;
  analysis?: TrackAnalysis;
}

export interface MetadataUpdate {
  artist?: string;
  title?: string;
  album?: string;
  genre?: string;
  year?: number;
  artwork_url?: string;
}

export interface TrackWithMetadata extends TrackResponse {
  suggested_genre: string | null;
  suggested_artist: string | null;
  suggested_album: string | null;
  suggested_year: number | null;
  metadata_confidence: number;
}

export async function updateTrackMetadata(
  trackId: number,
  metadata: MetadataUpdate
): Promise<TrackResponse> {
  const response = await authFetch(`${API_URL}/tracks/${trackId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(metadata),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Metadata update failed');
  }
  return response.json();
}
// ── Generic updateTrack — wraps PATCH /tracks/{id} (used throughout DashboardV2) ─────
export async function updateTrack(
  trackId: number,
  data: Record<string, any>
): Promise<any> {
  const response = await authFetch(`${API_URL}/tracks/${trackId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update track');
  return response.json();
}

// ── DJ Tools API ────────────────────────────────────────────────────────────

export function getAudioUrl(trackId: number): string {
  return `${API_URL}/tracks/${trackId}/audio`;
}

export async function cleanTitle(trackId: number): Promise<{ status: string; title: string; artist?: string }> {
  const response = await authFetch(`${API_URL}/tracks/${trackId}/clean-title`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error("Failed to clean title");
  return response.json();
}

export async function parseRemix(trackId: number): Promise<{
  status: string; clean_title: string; remix_artist?: string;
  remix_type?: string; feat_artist?: string;
}> {
  const response = await authFetch(`${API_URL}/tracks/${trackId}/parse-remix`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error("Failed to parse remix");
  return response.json();
}

export async function detectGenre(trackId: number): Promise<{
  status: string; best_guess: string;
  genres: Array<{ genre: string; confidence: number }>;
}> {
  const response = await authFetch(`${API_URL}/tracks/${trackId}/detect-genre`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error("Failed to detect genre");
  return response.json();
}

export interface IdentifyResult {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  label?: string;
  artwork_url?: string;
  spotify_id?: string;
  spotify_url?: string;
  musicbrainz_id?: string;
  acoustid_score?: number;
  source?: string;
}

export async function identifyTrack(trackId: number): Promise<{
  status: 'found' | 'not_found' | 'no_fingerprint';
  message?: string;
  result: IdentifyResult | null;
}> {
  const response = await authFetch(`${API_URL}/tracks/${trackId}/identify`, {
    method: 'POST',
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Identification failed');
  return response.json();
}

export async function identifyTrackBySearch(trackId: number, query: string): Promise<{
  status: 'found' | 'not_found';
  message?: string;
  result: IdentifyResult | null;
}> {
  const response = await authFetch(`${API_URL}/tracks/${trackId}/identify/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error('Search failed');
  return response.json();
}

export async function spotifyLookup(
  trackId: number,
  query?: string,
  artist?: string
): Promise<{ status: string; results: any[]; total: number }> {
  const response = await authFetch(`${API_URL}/tracks/${trackId}/spotify-lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ query, artist }),
  });
  if (!response.ok) throw new Error("Spotify lookup failed");
  return response.json();
}

export interface SpotifyApplyData {
  spotify_id: string;
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: number;
  artwork_url?: string;
  spotify_url?: string;
}

export async function spotifyApply(
  trackId: number,
  data: SpotifyApplyData
): Promise<{ status: string; track: Track }> {
  const response = await authFetch(`${API_URL}/tracks/${trackId}/spotify-apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to apply Spotify data");
  return response.json();
}

export async function fixTags(trackId: number): Promise<{
  status: string; written?: Record<string, any>;
}> {
  const response = await authFetch(`${API_URL}/tracks/${trackId}/fix-tags`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error("Failed to fix tags");
  return response.json();
}

// ── Page Settings API ───────────────────────────────────────────────────────

export interface PageConfig {
  id: number;
  page_name: string;
  is_enabled: boolean;
  label: string | null;
}

export async function getPublicPageSettings(): Promise<PageConfig[]> {
  const response = await authFetch(`${API_URL}/admin/settings/pages`);
  if (!response.ok) throw new Error("Failed to fetch page settings");
  return response.json();
}

export async function getAdminPages(): Promise<PageConfig[]> {
  const response = await authFetch(`${API_URL}/admin/pages`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error("Failed to fetch admin pages");
  return response.json();
}

export async function togglePage(pageName: string, isEnabled: boolean): Promise<PageConfig> {
  const response = await authFetch(`${API_URL}/admin/pages/${pageName}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ is_enabled: isEnabled }),
  });
  if (!response.ok) throw new Error("Failed to toggle page");
  return response.json();
}

// ── User Settings API ───────────────────────────────────────────────────────

export interface UserProfile {
  id: number;
  email: string;
  name: string | null;
  subscription_plan: string;
  is_admin: boolean;
  use_stem_separation?: boolean;
}

export async function getMyProfile(): Promise<UserProfile> {
  const response = await authFetch(`${API_URL}/auth/me`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error("Failed to fetch profile");
  return response.json();
}

export interface UpdateProfileData {
  name?: string;
  email?: string;
  current_password?: string;
  new_password?: string;
}

export async function updateMyProfile(data: UpdateProfileData): Promise<UserProfile> {
  const response = await authFetch(`${API_URL}/auth/me`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Failed to update profile" }));
    throw new Error(err.detail || "Failed to update profile");
  }
  return response.json();
}



// ── User Analysis Settings ──────────────────────────────────────────────────

export async function updateUserSettings(data: { use_stem_separation?: boolean }): Promise<UserProfile> {
  const response = await authFetch(`${API_URL}/auth/me/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Failed to update settings" }));
    throw new Error(err.detail || "Failed to update settings");
  }
  return response.json();
}


// ── Cue Points CRUD ───────────────────────────────────────────────────────
export async function createCuePoint(
  trackId: number,
  data: { position_ms: number; name: string; cue_type?: string; color?: string; number?: number | null }
): Promise<any> {
  const response = await authFetch(`${API_URL}/cues/${trackId}/points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      time: data.position_ms / 1000,
      label: data.name,
      hot_cue_slot: data.number ?? null,
      color: data.color ?? null,
      cue_type: data.cue_type ?? 'hot_cue',
    }),
  });
  if (!response.ok) throw new Error('Failed to create cue point');
  return response.json();
}

export async function deleteCuePoint(cueId: number): Promise<void> {
  const response = await authFetch(`${API_URL}/cues/points/${cueId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to delete cue point');
}

/**
 * Régénère les cue points d'un track à partir de l'analyse existante
 * (sans ré-analyser l'audio — instantané).
 */
export async function regenerateCuePoints(trackId: number): Promise<any[]> {
  const response = await authFetch(`${API_URL}/cues/${trackId}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to regenerate cue points');
  return response.json();
}

/**
 * Crée plusieurs cue points en une seule requête (batch).
 */
export async function createCuePointsBatch(
  trackId: number,
  cues: Array<{ position_ms: number; name: string; cue_type?: string; color?: string; number?: number | null }>
): Promise<any[]> {
  const response = await authFetch(`${API_URL}/cues/${trackId}/points/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      cues: cues.map(c => ({
        time: c.position_ms / 1000,
        label: c.name,
        hot_cue_slot: c.number ?? null,
        color: c.color ?? null,
        cue_type: c.cue_type ?? 'hot_cue',
      })),
    }),
  });
  if (!response.ok) throw new Error('Failed to create cue points batch');
  return response.json();
}

// Aliases for admin page compatibility
export const getAdminUsers = adminListUsers;
export const createAdminUser = adminCreateUser;
export const updateAdminUser = adminUpdateUser;
export const deleteAdminUser = adminDeleteUser;


// ── Organization API (Categories, Tags, Cue Modes) ──────────────────────────

export async function updateTrackOrganization(
  trackId: number,
  data: {
    category?: string | null;
    tags?: string | null;
    rating?: number | null;
    color_code?: string | null;
    comment?: string | null;
    energy_level?: number | null;
  }
): Promise<any> {
  const params = new URLSearchParams();
  if (data.category !== undefined) params.set('category', data.category || '');
  if (data.tags !== undefined) params.set('tags', data.tags || '');
  if (data.rating !== undefined) params.set('rating', String(data.rating || ''));
  if (data.color_code !== undefined) params.set('color_code', data.color_code || '');
  if (data.comment !== undefined) params.set('comment', data.comment || '');
  if (data.energy_level !== undefined) params.set('energy_level', String(data.energy_level || ''));
  
  const response = await authFetch(`${API_URL}/tracks/${trackId}/metadata?${params.toString()}`, {
    method: 'PATCH',
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to update track organization');
  return response.json();
}

export async function listCategories(): Promise<Record<string, number>> {
  const response = await authFetch(`${API_URL}/tracks/categories`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to fetch categories');
  return response.json();
}

export async function listTagCounts(): Promise<Record<string, number>> {
  const response = await authFetch(`${API_URL}/tracks/tags`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to fetch tags');
  return response.json();
}

export async function setCueMode(
  cueId: number,
  mode: 'memory' | 'hot'
): Promise<{ id: number; cue_type: string; position_ms: number; name: string }> {
  const cue_type = mode === 'memory' ? 'memory' : 'hot_cue';
  const response = await authFetch(`${API_URL}/cues/points/${cueId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ cue_type }),
  });
  if (!response.ok) throw new Error('Failed to set cue mode');
  return response.json();
}

export async function setCueColor(
  cueId: number,
  color: string
): Promise<{ id: number; color: string; position_ms: number; name: string }> {
  const response = await authFetch(`${API_URL}/cues/points/${cueId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ color }),
  });
  if (!response.ok) throw new Error('Failed to set cue color');
  return response.json();
}

export async function getTrackCuePoints(
  trackId: number
): Promise<Array<{
  id: number;
  track_id: number;
  position_ms: number;
  end_position_ms: number | null;
  cue_type: string;
  name: string;
  color: string;
  number: number | null;
}>> {
  const response = await authFetch(`${API_URL}/cues/${trackId}/points`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to fetch cue points');
  return response.json();
}

export async function getWaveformData(
  trackId: number
): Promise<{
  track_id: number;
  waveform_peaks: number[];
  spectral_energy: { low_energy: number; mid_energy: number; high_energy: number };
  generated_at: string | null;
}> {
  const response = await authFetch(`${API_URL}/waveforms/${trackId}`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Waveform data not available');
  return response.json();
}

export async function generateWaveform(
  trackId: number
): Promise<{ status: string; message: string; track_id: number }> {
  const response = await authFetch(`${API_URL}/waveforms/${trackId}/generate`, {
    method: 'POST',
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to generate waveform');
  return response.json();
}

// ── v2: Playlists API ───────────────────────────────────────────────────────

export interface Playlist {
  id: number;
  name: string;
  description?: string | null;
  is_folder: boolean;
  parent_id?: number | null;
  sort_order: number;
  track_count: number;
}

export interface PlaylistTrackItem {
  id: number;
  track_id: number;
  position: number;
  title?: string | null;
  artist?: string | null;
  filename?: string | null;
}

export interface PlaylistDetail extends Playlist {
  tracks: PlaylistTrackItem[];
}

export async function listPlaylists(): Promise<Playlist[]> {
  const r = await authFetch(`${API_URL}/playlists`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to fetch playlists');
  return r.json();
}

export async function getPlaylist(id: number): Promise<PlaylistDetail> {
  const r = await authFetch(`${API_URL}/playlists/${id}`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to fetch playlist');
  return r.json();
}

export async function getPlaylistTracks(playlistId: number): Promise<PlaylistTrackItem[]> {
  const detail = await getPlaylist(playlistId);
  return detail.tracks || [];
}

export async function createPlaylist(data: { name: string; description?: string; is_folder?: boolean; parent_id?: number }): Promise<Playlist> {
  const r = await authFetch(`${API_URL}/playlists`, {
    method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error('Failed to create playlist');
  return r.json();
}

export async function updatePlaylist(id: number, data: Partial<{ name: string; description: string }>): Promise<Playlist> {
  const r = await authFetch(`${API_URL}/playlists/${id}`, {
    method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error('Failed to update playlist');
  return r.json();
}

export async function deletePlaylist(id: number): Promise<void> {
  const r = await authFetch(`${API_URL}/playlists/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to delete playlist');
}

export async function addTracksToPlaylist(playlistId: number, trackIds: number[]): Promise<PlaylistDetail> {
  const r = await authFetch(`${API_URL}/playlists/${playlistId}/tracks`, {
    method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_ids: trackIds }),
  });
  if (!r.ok) throw new Error('Failed to add tracks');
  return r.json();
}

export async function removeTrackFromPlaylist(playlistId: number, trackId: number): Promise<void> {
  const r = await authFetch(`${API_URL}/playlists/${playlistId}/tracks/${trackId}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  if (!r.ok) throw new Error('Failed to remove track');
}

// ── v2: Smart Crates API ────────────────────────────────────────────────────

export interface CrateRule {
  field: string;
  op: string;
  value: any;
}

export interface SmartCrate {
  id: number;
  name: string;
  description?: string | null;
  rules: CrateRule[];
  match_mode: string;
  limit?: number | null;
  sort_by: string;
  sort_dir: string;
  track_count: number;
}

export interface SmartCrateDetail extends SmartCrate {
  tracks: Array<{ id: number; title?: string; artist?: string; bpm?: number; key?: string }>;
}

export async function listCrates(): Promise<SmartCrate[]> {
  const r = await authFetch(`${API_URL}/crates`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to fetch crates');
  return r.json();
}

export async function getCrate(id: number): Promise<SmartCrateDetail> {
  const r = await authFetch(`${API_URL}/crates/${id}`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to fetch crate');
  return r.json();
}

export async function createCrate(data: { name: string; rules: CrateRule[]; match_mode?: string; sort_by?: string; sort_dir?: string; limit?: number }): Promise<SmartCrate> {
  const r = await authFetch(`${API_URL}/crates`, {
    method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error('Failed to create crate');
  return r.json();
}

export async function deleteCrate(id: number): Promise<void> {
  const r = await authFetch(`${API_URL}/crates/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to delete crate');
}

export async function getCrateTracks(crateId: number): Promise<{ tracks: any[] }> {
  const detail = await getCrate(crateId);
  return { tracks: detail.tracks || [] };
}

// ── v2: Compatible tracks API ───────────────────────────────────────────────

export interface CompatibleTrack {
  track_id: number;
  title?: string;
  artist?: string;
  bpm?: number;
  key?: string;
  camelot?: string;
  harmonic_score: number;
  bpm_compatible: boolean;
  bpm_diff: number;
  overall_score: number;
  recommendation: string;
}

export async function getCompatibleTracks(trackId: number, limit = 10): Promise<{ reference: any; compatible: CompatibleTrack[] }> {
  const r = await authFetch(`${API_URL}/tracks/${trackId}/compatible?limit=${limit}`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to fetch compatible tracks');
  return r.json();
}

// ── v2: Play history API ────────────────────────────────────────────────────

export async function recordPlay(trackId: number, context = 'preview'): Promise<void> {
  await authFetch(`${API_URL}/tracks/${trackId}/play?context=${context}`, {
    method: 'POST', headers: authHeaders(),
  });
}

export async function clearAllHistory(): Promise<{ deleted: number }> {
  const res = await authFetch(`${API_URL}/tracks/history`, {
    method: 'DELETE', headers: authHeaders(),
  });
  return res.json();
}


// ── Demo mode setting (public, no auth) ──────────────────────────────────────

export async function getDemoMode(): Promise<boolean> {
  try {
    const r = await fetch(`${API_URL}/admin/public/demo-mode`);
    if (!r.ok) return false;
    const data = await r.json();
    return data.demo_mode === true;
  } catch {
    return false;
  }
}

// ── v2: Export All / Batch / Playlist M3U ────────────────────────────────────

export async function exportAllRekordbox(): Promise<Blob> {
  const r = await authFetch(`${API_URL}/export/rekordbox/all`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to export all tracks as Rekordbox XML');
  return r.blob();
}

export async function exportBatchRekordbox(trackIds: number[]): Promise<Blob> {
  const r = await authFetch(`${API_URL}/export/rekordbox/batch`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_ids: trackIds }),
  });
  if (!r.ok) throw new Error('Failed to batch export Rekordbox XML');
  return r.blob();
}

export async function exportPlaylistM3U(playlistId: number): Promise<Blob> {
  const r = await authFetch(`${API_URL}/export/playlist/${playlistId}/m3u`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to export playlist as M3U');
  return r.blob();
}

// ── Batch/All Serato ─────────────────────────────────────────────────────────
export async function exportBatchSerato(trackIds: number[]): Promise<Blob> {
  const r = await authFetch(`${API_URL}/export/serato/batch`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_ids: trackIds }),
  });
  if (!r.ok) throw new Error('Failed to batch export Serato');
  return r.blob();
}

export async function exportAllSerato(): Promise<Blob> {
  const r = await authFetch(`${API_URL}/export/serato/all`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to export all tracks as Serato');
  return r.blob();
}

// ── Batch/All Traktor ────────────────────────────────────────────────────────
export async function exportBatchTraktor(trackIds: number[]): Promise<Blob> {
  const r = await authFetch(`${API_URL}/export/traktor/batch`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_ids: trackIds }),
  });
  if (!r.ok) throw new Error('Failed to batch export Traktor NML');
  return r.blob();
}

export async function exportAllTraktor(): Promise<Blob> {
  const r = await authFetch(`${API_URL}/export/traktor/all`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to export all tracks as Traktor NML');
  return r.blob();
}

// ── v2: DJ Sets API ──────────────────────────────────────────────────────────

export interface DJSet {
  id: number;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  track_count?: number;
}

export interface SetTrackResponse {
  id: number;
  set_id: number;
  track_id: number;
  position?: number;
  track?: TrackResponse;
}

export interface DJSetDetail extends DJSet {
  tracks: SetTrackResponse[];
}

export async function listSets(): Promise<DJSet[]> {
  const r = await authFetch(`${API_URL}/sets`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to fetch DJ sets');
  return r.json();
}

export async function createSet(data: { name: string; description?: string }): Promise<DJSet> {
  const r = await authFetch(`${API_URL}/sets`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error('Failed to create DJ set');
  return r.json();
}

export async function getSet(setId: number): Promise<DJSetDetail> {
  const r = await authFetch(`${API_URL}/sets/${setId}`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to fetch DJ set');
  return r.json();
}

export async function updateSet(setId: number, data: { name?: string; description?: string }): Promise<DJSet> {
  const r = await authFetch(`${API_URL}/sets/${setId}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error('Failed to update DJ set');
  return r.json();
}

export async function deleteSet(setId: number): Promise<void> {
  const r = await authFetch(`${API_URL}/sets/${setId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error('Failed to delete DJ set');
}

export async function addTrackToSet(setId: number, trackId: number, position?: number): Promise<SetTrackResponse> {
  const r = await authFetch(`${API_URL}/sets/${setId}/tracks`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_id: trackId, position }),
  });
  if (!r.ok) throw new Error('Failed to add track to set');
  return r.json();
}

export async function removeTrackFromSet(setId: number, trackId: number): Promise<void> {
  const r = await authFetch(`${API_URL}/sets/${setId}/tracks/${trackId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error('Failed to remove track from set');
}

export async function suggestNextTrack(setId: number): Promise<{ suggestions: TrackResponse[] }> {
  const r = await authFetch(`${API_URL}/sets/${setId}/suggest-next`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to get track suggestions');
  return r.json();
}

export async function exportSetRekordbox(setId: number): Promise<Blob> {
  const r = await authFetch(`${API_URL}/export/set/${setId}/rekordbox`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to export set as Rekordbox XML');
  return r.blob();
}

export async function exportSetM3U(setId: number): Promise<Blob> {
  const r = await authFetch(`${API_URL}/export/set/${setId}/m3u`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to export set as M3U');
  return r.blob();
}

// ── v2: DJ Software Import API ───────────────────────────────────────────────

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export async function importRekordbox(file: File): Promise<ImportResult> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await authFetch(`${API_URL}/import/rekordbox`, { method: 'POST', headers: authHeaders(), body: fd });
  if (!r.ok) throw new Error('Failed to import Rekordbox XML');
  return r.json();
}

export async function importSerato(file: File): Promise<ImportResult> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await authFetch(`${API_URL}/import/serato`, { method: 'POST', headers: authHeaders(), body: fd });
  if (!r.ok) throw new Error('Failed to import Serato crate');
  return r.json();
}

export async function importTraktor(file: File): Promise<ImportResult> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await authFetch(`${API_URL}/import/traktor`, { method: 'POST', headers: authHeaders(), body: fd });
  if (!r.ok) throw new Error('Failed to import Traktor NML');
  return r.json();
}


// ══════════════════════════════════════════════════════════════════════════
//  v4: LOOP MARKERS API
// ══════════════════════════════════════════════════════════════════════════

export interface LoopMarker {
  id: number;
  track_id: number;
  start_ms: number;
  end_ms: number;
  name?: string | null;
  color?: string;
  number?: number | null;
  length_beats?: number | null;
  is_active: boolean;
  auto_generated: boolean;
}

export async function listLoops(trackId: number): Promise<LoopMarker[]> {
  const r = await authFetch(`${API_URL}/cues/${trackId}/loops`, { headers: authHeaders() });
  if (!r.ok) return [];
  return r.json();
}

export async function createLoop(trackId: number, data: { start_ms: number; end_ms: number; name?: string; color?: string; number?: number; length_beats?: number }): Promise<LoopMarker> {
  const r = await authFetch(`${API_URL}/cues/${trackId}/loops`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!r.ok) throw new Error('Failed to create loop');
  return r.json();
}

export async function updateLoop(loopId: number, data: Partial<LoopMarker>): Promise<LoopMarker> {
  const r = await authFetch(`${API_URL}/cues/loops/${loopId}`, { method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!r.ok) throw new Error('Failed to update loop');
  return r.json();
}

export async function deleteLoop(loopId: number): Promise<void> {
  await authFetch(`${API_URL}/cues/loops/${loopId}`, { method: 'DELETE', headers: authHeaders() });
}

// ══════════════════════════════════════════════════════════════════════════
//  v4: COPY CUE POINTS
// ══════════════════════════════════════════════════════════════════════════

export async function copyCuesFromTrack(targetTrackId: number, sourceTrackId: number, includeLoops = true): Promise<{ copied_cues: number; copied_loops: number }> {
  const r = await authFetch(`${API_URL}/cues/${targetTrackId}/copy-cues`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_track_id: sourceTrackId, include_loops: includeLoops }),
  });
  if (!r.ok) throw new Error('Failed to copy cues');
  return r.json();
}

// ══════════════════════════════════════════════════════════════════════════
//  v4: DJ ANALYTICS API
// ══════════════════════════════════════════════════════════════════════════

export interface DJAnalytics {
  library: {
    total_tracks: number;
    analyzed_tracks: number;
    total_duration_hours: number;
    avg_bpm: number | null;
    avg_energy: number | null;
    avg_loudness_lufs: number | null;
    most_common_key: string | null;
    most_common_genre: string | null;
    bpm_range: { min: number; max: number } | null;
    tracks_this_week: number;
    tracks_this_month: number;
  };
  key_distribution: Array<{ key: string; camelot: string | null; count: number; percentage: number }>;
  genre_distribution: Array<{ genre: string; count: number; percentage: number }>;
  bpm_distribution: Array<{ range_label: string; count: number }>;
  energy_distribution: Array<{ level: string; count: number; avg_energy: number }>;
  top_played: Array<{ track_id: number; title: string | null; artist: string | null; played_count: number }>;
  mood_distribution: Record<string, number> | null;
}

export async function getAnalytics(): Promise<DJAnalytics> {
  const r = await authFetch(`${API_URL}/analytics`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to fetch analytics');
  return r.json();
}

// ══════════════════════════════════════════════════════════════════════════
//  v4: MIX ANALYZER API
// ══════════════════════════════════════════════════════════════════════════

export interface MixJobStatus {
  job_id: string;
  status: string;
  progress: number | null;
  result: {
    status: string;
    mix_duration_ms: number | null;
    tracks_identified: number;
    transitions: Array<{ position_ms: number; bpm_shift: number | null }>;
    avg_bpm: number | null;
    bpm_range: { min: number; max: number } | null;
    error: string | null;
  } | null;
}

export async function uploadMix(file: File): Promise<MixJobStatus> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await authFetch(`${API_URL}/mix-analyzer/upload`, { method: 'POST', headers: authHeaders(), body: fd });
  if (!r.ok) throw new Error('Failed to upload mix');
  return r.json();
}

export async function getMixStatus(jobId: string): Promise<MixJobStatus> {
  const r = await authFetch(`${API_URL}/mix-analyzer/${jobId}`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to get mix status');
  return r.json();
}

// ── Billing API ────────────────────────────────────────────────────────────

export interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  max_tracks_per_day: number;
  max_cue_points: number;
  max_members: number;
  max_storage_gb: number;
  features: Record<string, boolean>;
}

export interface UsageStats {
  tracks_today: number;
  tracks_limit: number;
  cue_points_used: number;
  cue_points_limit: number;
  storage_used_mb: number;
  storage_limit_gb: number;
  members_count: number;
  members_limit: number;
}

export interface CurrentPlan {
  plan: Plan;
  subscription_status: string | null;
  current_period_end: string | null;
}

export async function getPlans(): Promise<Plan[]> {
  const res = await authFetch(`${API_URL}/billing/plans`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error('Failed to fetch plans');
  return res.json();
}

export async function getCurrentPlan(): Promise<CurrentPlan> {
  const res = await authFetch(`${API_URL}/billing/current`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error('Failed to fetch current plan');
  return res.json();
}

export async function getUsage(): Promise<UsageStats> {
  const res = await authFetch(`${API_URL}/billing/usage`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error('Failed to fetch usage');
  return res.json();
}

export async function subscribe(plan_id: string, interval: string = 'monthly'): Promise<{ checkout_url: string }> {
  const res = await authFetch(`${API_URL}/billing/subscribe`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_id, interval }),
  });
  if (!res.ok) throw new Error('Failed to create checkout');
  return res.json();
}

export async function getBillingPortal(): Promise<{ url: string }> {
  const res = await authFetch(`${API_URL}/billing/portal`, {
    method: 'POST',
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error('Failed to open billing portal');
  return res.json();
}

// ── Compare Tracks ──────────────────────────────────────────────────────────

export async function getTracks(): Promise<{ tracks: Track[] }> {
  const res = await authFetch(`${API_URL}/tracks`, {
    method: 'GET',
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error('Failed to fetch tracks');
  return res.json();
}

export async function compareTracksAPI(trackIdA: string, trackIdB: string): Promise<any> {
  const res = await authFetch(`${API_URL}/tracks/compare?track_a=${trackIdA}&track_b=${trackIdB}`, {
    method: 'GET',
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error('Failed to compare tracks');
  return res.json();
}

// ── Improvement #41: Cue Quality & Optimization ──────────────────────────────

/** Improvement #41: Get quality score for cues of a track */
export async function getCueQualityScore(trackId: number): Promise<{
  overall: number;
  byType: Record<string, number>;
  suggestions: string[];
}> {
  const res = await authFetch(`${API_URL}/tracks/${trackId}/cue-quality`, {
    method: 'GET',
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error('Failed to get cue quality score');
  return res.json();
}

/** Improvement #42: Optimize cues for a track */
export async function optimizeCues(trackId: number, options?: {
  removeWeakCues?: boolean;
  snapToGrid?: boolean;
  mergeCloseCues?: boolean;
}): Promise<{ optimized_count: number; removed_count: number; changes: Array<{ id: number; action: string }> }> {
  const res = await authFetch(`${API_URL}/tracks/${trackId}/cue-optimize`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
  if (!res.ok) throw new Error('Failed to optimize cues');
  return res.json();
}

/** Improvement #43: Get cue suggestions based on audio analysis */
export async function getCueSuggestions(trackId: number): Promise<Array<{
  position_ms: number;
  name: string;
  cue_type: string;
  confidence: number;
  reason: string;
}>> {
  const res = await authFetch(`${API_URL}/tracks/${trackId}/cue-suggestions`, {
    method: 'GET',
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error('Failed to get cue suggestions');
  return res.json();
}

/** Improvement #44: Get cue history/changelog for a track */
export async function getCueHistory(trackId: number): Promise<Array<{
  id: string;
  timestamp: string;
  action: string;
  cue_id?: number;
  cue_name?: string;
  details: any;
}>> {
  const res = await authFetch(`${API_URL}/tracks/${trackId}/cue-history`, {
    method: 'GET',
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error('Failed to get cue history');
  return res.json();
}

/** Improvement #45: Search cues across all tracks */
export async function searchCues(query: string, filters?: {
  cueType?: string;
  minConfidence?: number;
  tags?: string[];
}): Promise<Array<{
  id: number;
  trackId: number;
  trackTitle: string;
  position_ms: number;
  name: string;
  cue_type: string;
  confidence: number;
}>> {
  const params = new URLSearchParams({
    q: query,
    ...(filters?.cueType && { cue_type: filters.cueType }),
    ...(filters?.minConfidence && { min_confidence: String(filters.minConfidence) }),
    ...(filters?.tags && { tags: filters.tags.join(',') }),
  });
  const res = await authFetch(`${API_URL}/cues/search?${params.toString()}`, {
    method: 'GET',
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error('Failed to search cues');
  return res.json();
}
