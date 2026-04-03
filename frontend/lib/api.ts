// 🔴 FIX (faille 10) : Plus de fallback localhost — l'URL doit être définie dans Railway
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://cueforge-saas-production.up.railway.app/api/v1';

// ── Token management ────────────────────────────────────────────────────────

const TOKEN_KEY = 'cueforge_token';

export function setToken(token: string): void {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  if (typeof window !== 'undefined') return localStorage.getItem(TOKEN_KEY);
  return null;
}

export function clearToken(): void {
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}

// ── Authenticated fetch with auto-logout on 401 ───────────────────────────────

async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (networkError) {
    throw new Error('Network error — check your connection');
  }

  if (response.status === 401) {
    clearToken();
    // Don't do a hard redirect — let the layout/router handle it gracefully
    throw new Error('Session expired');
  }
  return response;
}


export function isAuthenticated(): boolean {
  return !!getToken();
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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
}

export interface TrackListResponse {
  tracks: Track[];
  total: number;
  page: number;
  pages: number;
}

// ── Auth API ────────────────────────────────────────────────────────────────

export async function login(username: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error('Invalid username or password');
  const data: AuthResponse = await response.json();
  setToken(data.access_token);
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
  return data;
}

export async function logout(): Promise<void> {
  clearToken();
}

export async function getCurrentUser(): Promise<User> {
  const response = await authFetch(`${API_URL}/auth/me`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to fetch user');
  return response.json();
}

export async function refreshToken(): Promise<AuthResponse> {
  const response = await authFetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Token refresh failed');
  return response.json();
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const response = await authFetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw new Error('Password reset request failed');
  return response.json();
}

export async function resetPassword(token: string, new_password: string): Promise<{ message: string }> {
  const response = await authFetch(`${API_URL}/auth/reset-password`, {
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
    const error = await response.json();
    throw new Error(error.detail || 'Upload failed');
  }
  return response.json();
}

export async function uploadTracks(formData: FormData): Promise<TrackUploadResponse[]> {
  const response = await authFetch(`${API_URL}/tracks/`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Upload failed');
  }
  return response.json();
}

export async function analyzeTrack(trackId: number): Promise<AnalyzeResponse> {
  const response = await authFetch(`${API_URL}/tracks/${trackId}/analyze`, {
    method: 'POST',
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to start analysis');
  return response.json();
}

export async function pollTrackUntilDone(
  trackId: number,
  onUpdate?: (track: Track) => void,
  intervalMs = 2000,
  maxAttempts = 120
): Promise<Track> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await authFetch(`${API_URL}/tracks/${trackId}`, {
      headers: { ...authHeaders() },
    });
    if (!response.ok) throw new Error('Failed to fetch track status');
    const track: Track = await response.json();
    if (onUpdate) onUpdate(track);
    if (track.status === 'completed' || track.status === 'failed') return track;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('Analysis timed out');
}

export async function listTracks(
  page: number = 1,
  limit: number = 20
): Promise<TrackListResponse> {
  const response = await authFetch(
    `${API_URL}/tracks?page=${page}&limit=${limit}`,
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

export async function exportJSON(trackId: number): Promise<Blob> {
  const response = await authFetch(`${API_URL}/export/${trackId}/json`, {
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
  const r = await authFetch(`${API_URL}/sets/`, { headers: authHeaders() });
  if (!r.ok) throw new Error('Failed to fetch DJ sets');
  return r.json();
}

export async function createSet(data: { name: string; description?: string }): Promise<DJSet> {
  const r = await authFetch(`${API_URL}/sets/`, {
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
