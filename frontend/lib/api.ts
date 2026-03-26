const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

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
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to fetch user');
  return response.json();
}

export async function refreshToken(): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Token refresh failed');
  return response.json();
}

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
  const response = await fetch(`${API_URL}/tracks/upload`, {
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
  const response = await fetch(`${API_URL}/tracks/`, {
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
  const response = await fetch(`${API_URL}/tracks/${trackId}/analyze`, {
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
    const response = await fetch(`${API_URL}/tracks/${trackId}`, {
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
  const response = await fetch(
    `${API_URL}/tracks?page=${page}&limit=${limit}`,
    { headers: { ...authHeaders() } }
  );
  if (!response.ok) throw new Error('Failed to fetch tracks');
  return response.json();
}

export async function getTrack(trackId: number): Promise<Track> {
  const response = await fetch(`${API_URL}/tracks/${trackId}`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to fetch track');
  return response.json();
}

export async function deleteTrack(trackId: number): Promise<void> {
  const response = await fetch(`${API_URL}/tracks/${trackId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to delete track');
}

// ── Export API ───────────────────────────────────────────────────────────────

export async function exportRekordbox(trackId: number): Promise<Blob> {
  const response = await fetch(`${API_URL}/export/${trackId}/rekordbox`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to export Rekordbox');
  return response.blob();
}

export async function exportSerato(trackId: number): Promise<Blob> {
  const response = await fetch(`${API_URL}/export/${trackId}/serato`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to export Serato');
  return response.blob();
}

export async function exportJSON(trackId: number): Promise<Blob> {
  const response = await fetch(`${API_URL}/export/${trackId}/json`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to export JSON');
  return response.blob();
}

export async function exportAllFormats(trackId: number): Promise<Blob> {
  const response = await fetch(`${API_URL}/export/${trackId}/all`, {
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
  const response = await fetch(`${API_URL}/admin/users?skip=${skip}&limit=${limit}`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to list users');
  return response.json();
}

export async function adminGetUser(userId: number): Promise<AdminUser> {
  const response = await fetch(`${API_URL}/admin/users/${userId}`, {
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to get user');
  return response.json();
}

export async function adminCreateUser(payload: CreateUserPayload): Promise<AdminUser> {
  const response = await fetch(`${API_URL}/admin/users`, {
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
  const response = await fetch(`${API_URL}/admin/users/${userId}`, {
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
  const response = await fetch(`${API_URL}/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error('Failed to delete user');
}
