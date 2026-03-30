/**
 * Tests for lib/api.ts — Token management, auth, tracks, exports
 */

import {
  setToken,
  getToken,
  clearToken,
  isAuthenticated,
  login,
  register,
  logout,
  getCurrentUser,
  listTracks,
  deleteTrack,
  uploadTrack,
  createUploadFormData,
  parseErrorResponse,
  forgotPassword,
  resetPassword,
  exportRekordbox,
  createCuePoint,
  deleteCuePoint,
  updateTrackMetadata,
  updateTrackOrganization,
} from '@/lib/api';

// ── Mock fetch globally ──────────────────────────────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  localStorage.clear();
});

// ── Token management ─────────────────────────────────────────────────────────

describe('Token management', () => {
  test('setToken stores and getToken retrieves', () => {
    setToken('abc123');
    expect(getToken()).toBe('abc123');
  });

  test('clearToken removes the token', () => {
    setToken('abc123');
    clearToken();
    expect(getToken()).toBeNull();
  });

  test('isAuthenticated returns true when token exists', () => {
    setToken('xyz');
    expect(isAuthenticated()).toBe(true);
  });

  test('isAuthenticated returns false when no token', () => {
    expect(isAuthenticated()).toBe(false);
  });
});

// ── Auth API ─────────────────────────────────────────────────────────────────

describe('login', () => {
  test('successful login stores token and returns user', async () => {
    const mockResponse = {
      access_token: 'jwt-token-123',
      token_type: 'bearer',
      user: { id: 1, email: 'dj@test.com', name: 'DJ Test', subscription_plan: 'free', is_admin: false, tracks_today: 0 },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await login('djtest', 'password123');
    expect(result.access_token).toBe('jwt-token-123');
    expect(getToken()).toBe('jwt-token-123');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('failed login throws error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(login('bad', 'creds')).rejects.toThrow('Invalid username or password');
  });
});

describe('register', () => {
  test('successful registration stores token', async () => {
    const mockResponse = {
      access_token: 'new-token',
      token_type: 'bearer',
      user: { id: 2, email: 'new@dj.com', name: 'NewDJ', subscription_plan: 'free', is_admin: false, tracks_today: 0 },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await register('new@dj.com', 'secure123', 'NewDJ');
    expect(result.access_token).toBe('new-token');
    expect(getToken()).toBe('new-token');
  });

  test('registration with existing email throws error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Email already registered' }),
    });
    await expect(register('dup@dj.com', 'pass1234', 'Dup')).rejects.toThrow('Email already registered');
  });
});

describe('logout', () => {
  test('clears the token', async () => {
    setToken('active-token');
    await logout();
    expect(getToken()).toBeNull();
  });
});

describe('getCurrentUser', () => {
  test('fetches user with auth header', async () => {
    setToken('my-token');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 1, email: 'dj@test.com', name: 'DJ', subscription_plan: 'pro', is_admin: false, tracks_today: 3, last_track_date: null }),
    });

    const user = await getCurrentUser();
    expect(user.email).toBe('dj@test.com');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/me'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer my-token' }),
      })
    );
  });
});

// ── Password reset ───────────────────────────────────────────────────────────

describe('forgotPassword', () => {
  test('sends forgot password request', async () => {
    setToken('t');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: 'Reset email sent' }),
    });

    const result = await forgotPassword('dj@test.com');
    expect(result.message).toBe('Reset email sent');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/forgot-password'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('resetPassword', () => {
  test('sends reset password request with token', async () => {
    setToken('t');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: 'Password updated' }),
    });

    const result = await resetPassword('reset-tok', 'newpass123');
    expect(result.message).toBe('Password updated');
  });
});

// ── Tracks API ───────────────────────────────────────────────────────────────

describe('listTracks', () => {
  test('fetches paginated tracks', async () => {
    setToken('t');
    const mockData = {
      tracks: [{ id: 1, filename: 'track.mp3', status: 'completed' }],
      total: 1,
      page: 1,
      pages: 1,
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    const result = await listTracks(1, 20);
    expect(result.tracks).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/tracks?page=1&limit=20'),
      expect.anything()
    );
  });
});

describe('deleteTrack', () => {
  test('sends DELETE request', async () => {
    setToken('t');
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    await deleteTrack(42);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/tracks/42'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  test('throws on failure', async () => {
    setToken('t');
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(deleteTrack(999)).rejects.toThrow('Failed to delete track');
  });
});

// ── Export API ───────────────────────────────────────────────────────────────

describe('exportRekordbox', () => {
  test('returns a blob', async () => {
    setToken('t');
    const mockBlob = new Blob(['<xml>'], { type: 'application/xml' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: async () => mockBlob,
    });

    const result = await exportRekordbox(1);
    expect(result).toBeInstanceOf(Blob);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/export/1/rekordbox'),
      expect.anything()
    );
  });
});

// ── Cue points ───────────────────────────────────────────────────────────────

describe('createCuePoint', () => {
  test('creates a cue point', async () => {
    setToken('t');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 10, track_id: 1, position_ms: 5000, name: 'Drop', cue_type: 'hot_cue' }),
    });

    const result = await createCuePoint(1, { position_ms: 5000, name: 'Drop' });
    expect(result.name).toBe('Drop');
  });
});

describe('deleteCuePoint', () => {
  test('deletes a cue point', async () => {
    setToken('t');
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    await deleteCuePoint(10);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/cues/cues/points/10'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

// ── Metadata & Organization ──────────────────────────────────────────────────

describe('updateTrackMetadata', () => {
  test('sends PATCH with metadata', async () => {
    setToken('t');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 1, artist: 'Daft Punk', title: 'One More Time' }),
    });

    const result = await updateTrackMetadata(1, { artist: 'Daft Punk', title: 'One More Time' });
    expect(result.artist).toBe('Daft Punk');
  });
});

describe('updateTrackOrganization', () => {
  test('sends organization data as query params', async () => {
    setToken('t');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 1, category: 'Peak Time', rating: 5 }),
    });

    await updateTrackOrganization(1, { category: 'Peak Time', rating: 5, energy_level: 8 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('category=Peak'),
      expect.anything()
    );
  });
});

// ── Utility ──────────────────────────────────────────────────────────────────

describe('createUploadFormData', () => {
  test('creates FormData with files', () => {
    const file1 = new File(['audio'], 'track1.mp3', { type: 'audio/mpeg' });
    const file2 = new File(['audio'], 'track2.wav', { type: 'audio/wav' });
    const formData = createUploadFormData([file1, file2]);
    expect(formData.getAll('files')).toHaveLength(2);
  });
});

describe('parseErrorResponse', () => {
  test('extracts detail from JSON response', async () => {
    const response = {
      json: async () => ({ detail: 'Not found' }),
    } as any;
    const msg = await parseErrorResponse(response);
    expect(msg).toBe('Not found');
  });

  test('returns fallback on non-JSON response', async () => {
    const response = {
      json: async () => { throw new Error('not json'); },
    } as any;
    const msg = await parseErrorResponse(response);
    expect(msg).toBe('An error occurred');
  });
});

// ── Auto-logout on 401 ──────────────────────────────────────────────────────

describe('auto-logout on 401', () => {
  test('clears token on 401', async () => {
    setToken('expired-token');

    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    await expect(getCurrentUser()).rejects.toThrow('Session expired');
    expect(getToken()).toBeNull();
  });
});
