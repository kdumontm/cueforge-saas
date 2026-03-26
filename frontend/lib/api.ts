const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://cueforge-saas-production.up.railway.app';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('cueforge_token');
}

export function setToken(token: string): void {
  localStorage.setItem('cueforge_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('cueforge_token');
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      message = err.detail || JSON.stringify(err);
    } catch {}
    throw new Error(message);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return res.blob() as unknown as T;
}

// Auth
export async function login(email: string, password: string) {
  const body = new URLSearchParams({ username: email, password });
  const data = await request<{ access_token: string; token_type: string }>(
    '/api/v1/auth/login',
    { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  setToken(data.access_token);
  return data;
}

export async function register(email: string, password: string) {
  return request('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe() {
  return request('/api/v1/auth/me');
}

// Tracks
export async function uploadTrack(file: File) {
  const form = new FormData();
  form.append('file', file);
  return request<{ id: number; status: string; filename: string }>('/api/v1/tracks/upload', {
    method: 'POST',
    body: form,
  });
}

export async function analyzeTrack(trackId: number) {
  return request<{ status: string; message: string }>(`/api/v1/tracks/${trackId}/analyze`, {
    method: 'POST',
  });
}

export async function getTrack(trackId: number) {
  return request<import('@/types').Track>(`/api/v1/tracks/${trackId}`);
}

export async function listTracks(page = 1, limit = 20) {
  return request<{ tracks: import('@/types').Track[]; total: number; page: number; pages: number }>(
    `/api/v1/tracks?page=${page}&limit=${limit}`
  );
}

export async function deleteTrack(trackId: number) {
  return request(`/api/v1/tracks/${trackId}`, { method: 'DELETE' });
}

// Export
export async function exportRekordbox(trackId: number): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/v1/export/${trackId}/rekordbox`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res.blob();
}

// Polling helper
export async function pollTrackUntilDone(
  trackId: number,
  onUpdate: (track: import('@/types').Track) => void,
  intervalMs = 2000,
  maxAttempts = 60
): Promise<import('@/types').Track> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        reject(new Error('Analysis timed out'));
        return;
      }
      try {
        const track = await getTrack(trackId);
        onUpdate(track);
        if (track.status === 'completed' || track.status === 'failed') {
          clearInterval(interval);
          resolve(track);
        }
      } catch (e) {
        clearInterval(interval);
        reject(e);
      }
    }, intervalMs);
  });
}

