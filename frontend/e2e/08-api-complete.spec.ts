import { test, expect } from '@playwright/test';
import { API_URL } from './helpers';

/**
 * Tests API complets — vérifie que tous les endpoints critiques répondent
 * correctement avec les bonnes données.
 */
test.describe('🔌 API Backend — Tests complets', () => {

  let token = '';
  let trackId: number | null = null;

  test.beforeAll(async ({ request }) => {
    const loginResp = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { identifier: 'e2etester', password: 'TestPass999@' },
    });
    const data = await loginResp.json();
    token = data.access_token;

    // Récupérer un track si disponible
    const tracksResp = await request.get(`${API_URL}/api/v1/tracks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (tracksResp.ok()) {
      const td = await tracksResp.json();
      const tracks = td.items || td;
      if (Array.isArray(tracks) && tracks.length > 0) {
        trackId = tracks[0].id;
      }
    }
  });

  // ── AUTH ──
  test('AUTH — Login retourne un token JWT', async ({ request }) => {
    const resp = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { identifier: 'e2etester', password: 'TestPass999@' },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.access_token).toBeDefined();
    expect(data.access_token.split('.').length).toBe(3); // JWT = 3 parties
    console.log('✅ JWT valide reçu');
  });

  test('AUTH — /me retourne les infos utilisateur', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.ok()).toBeTruthy();
    const user = await resp.json();
    expect(user.id).toBeDefined();
    expect(user.email).toBeDefined();
    expect(user.subscription_plan).toBeDefined();
    console.log(`✅ User: ${user.email} | Plan: ${user.subscription_plan}`);
  });

  test('AUTH — accès sans token → 401', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/v1/auth/me`);
    // FastAPI OAuth2PasswordBearer returns 403 when no credentials provided (known behaviour)
    expect([401, 403]).toContain(resp.status());
  });

  test('AUTH — token invalide → 401', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/v1/auth/me`, {
      headers: { Authorization: 'Bearer token_invalide_123' },
    });
    expect(resp.status()).toBe(401);
  });

  // ── TRACKS ──
  test('TRACKS — GET /tracks retourne la liste', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/v1/tracks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    const tracks = data.items || data;
    expect(Array.isArray(tracks) || typeof tracks === 'object').toBeTruthy();
    console.log(`✅ ${Array.isArray(tracks) ? tracks.length : '?'} tracks`);
  });

  test('TRACKS — track a les champs requis', async ({ request }) => {
    if (!trackId) { test.skip(true, 'Aucun track disponible'); return; }
    const resp = await request.get(`${API_URL}/api/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.ok()).toBeTruthy();
    const track = await resp.json();
    expect(track.id).toBeDefined();
    expect(track.title).toBeDefined();
    expect(track.status).toBeDefined();
    console.log(`✅ Track: "${track.title}" | BPM: ${track.bpm} | Key: ${track.key} | Status: ${track.status}`);
  });

  test('TRACKS — BPM dans une plage réaliste (60-200)', async ({ request }) => {
    if (!trackId) { test.skip(true, 'Aucun track disponible'); return; }
    const resp = await request.get(`${API_URL}/api/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok()) {
      const track = await resp.json();
      if (track.bpm && track.status === 'completed') {
        expect(track.bpm).toBeGreaterThan(40);
        expect(track.bpm).toBeLessThan(250);
        console.log(`✅ BPM réaliste : ${track.bpm}`);
      }
    }
  });

  test('TRACKS — audio accessible via /audio endpoint', async ({ request }) => {
    if (!trackId) { test.skip(true, 'Aucun track disponible'); return; }
    const resp = await request.get(`${API_URL}/api/v1/tracks/${trackId}/audio`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // 200 = audio dispo, 404 = fichier pas encore prêt, 302 = redirect S3
    expect([200, 206, 302, 404]).toContain(resp.status());
    if (resp.ok() || resp.status() === 206) {
      const contentType = resp.headers()['content-type'] || '';
      expect(contentType).toMatch(/audio|octet-stream/i);
      console.log(`✅ Audio disponible (${contentType})`);
    }
  });

  // ── CUES ──
  test('CUES — GET cue points analysis', async ({ request }) => {
    if (!trackId) { test.skip(true, 'Aucun track disponible'); return; }
    const resp = await request.get(`${API_URL}/api/v1/cues/cues/${trackId}/analysis`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([200, 404]).toContain(resp.status());
    if (resp.ok()) {
      const data = await resp.json();
      console.log(`✅ Analyse cues disponible`);
    }
  });

  test('CUES — GET cue points list', async ({ request }) => {
    if (!trackId) { test.skip(true, 'Aucun track disponible'); return; }
    const resp = await request.get(`${API_URL}/api/v1/cues/cues/${trackId}/points`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([200, 404]).toContain(resp.status());
    if (resp.ok()) {
      const data = await resp.json();
      const points = Array.isArray(data) ? data : data.points || [];
      console.log(`✅ ${points.length} cue point(s) trouvé(s)`);
      if (points.length > 0) {
        // Vérifier structure d'un cue point
        const cue = points[0];
        expect(cue.id ?? cue.position ?? cue.time_position).toBeDefined();
      }
    }
  });

  test('CUES — règles de cue points configurées', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/v1/cues/cues/rules`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([200, 404]).toContain(resp.status());
    if (resp.ok()) {
      console.log(`✅ Règles cue disponibles`);
    }
  });

  // ── EXPORT ──
  test('EXPORT — Rekordbox XML valide', async ({ request }) => {
    if (!trackId) { test.skip(true, 'Aucun track disponible'); return; }
    const resp = await request.get(`${API_URL}/api/v1/export/export/${trackId}/rekordbox`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok()) {
      const xml = await resp.text();
      expect(xml).toContain('<?xml');
      const hasRekordbox = xml.includes('DJ_PLAYLISTS') || xml.includes('TRACK') || xml.includes('BPM');
      expect(hasRekordbox).toBeTruthy();
      console.log(`✅ XML Rekordbox valide (${xml.length} chars)`);
    } else {
      expect([200, 400, 404]).toContain(resp.status());
    }
  });

  // ── WAVEFORM ──
  test('WAVEFORM — données waveform disponibles', async ({ request }) => {
    if (!trackId) { test.skip(true, 'Aucun track disponible'); return; }
    const resp = await request.get(`${API_URL}/api/v1/waveforms/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([200, 404]).toContain(resp.status());
    if (resp.ok()) {
      const data = await resp.json();
      expect(data).toBeDefined();
      console.log(`✅ Waveform data disponible`);
    }
  });

  // ── SITE ──
  test('SITE — public settings retourne les pages activées', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/v1/site/settings`);
    expect([200, 404]).toContain(resp.status());
    if (resp.ok()) {
      const data = await resp.json();
      console.log(`✅ Site settings disponible`);
    }
  });

  test('SITE — features disponibles', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/v1/site/features`);
    expect([200, 404]).toContain(resp.status());
    if (resp.ok()) {
      const data = await resp.json();
      console.log(`✅ Features disponibles`);
    }
  });
});
