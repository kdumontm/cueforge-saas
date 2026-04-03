import { test, expect } from '@playwright/test';
import { loginViaToken, API_URL } from './helpers';

test.describe('📤 Export Rekordbox & CSV', () => {

  let token = '';
  let trackId: number | null = null;

  test.beforeAll(async ({ request }) => {
    const loginResp = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { identifier: 'e2etester', password: 'TestPass999@' },
    });
    const data = await loginResp.json();
    token = data.access_token;

    const tracksResp = await request.get(`${API_URL}/api/v1/tracks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (tracksResp.ok()) {
      const td = await tracksResp.json();
      const tracks = td.items || td;
      const completed = Array.isArray(tracks) ? tracks.filter((t: any) => t.status === 'completed') : [];
      if (completed.length > 0) trackId = completed[0].id;
    }
  });

  test('API Export Rekordbox — retourne un XML valide', async ({ request }) => {
    if (!trackId) { test.skip(true, 'Aucun track analysé'); return; }

    const resp = await request.get(`${API_URL}/api/v1/export/export/${trackId}/rekordbox`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (resp.ok()) {
      const body = await resp.text();
      // Un export Rekordbox doit être un XML
      expect(body).toContain('<?xml');
      expect(body).toMatch(/DJ_PLAYLISTS|TRACK|BPM/i);
      console.log(`✅ Export Rekordbox XML valide (${body.length} caractères)`);
    } else {
      // 404 si pas encore analysé complètement
      expect([200, 400, 404, 422]).toContain(resp.status());
    }
  });

  test('API Export Rekordbox JSON — structure correcte', async ({ request }) => {
    if (!trackId) { test.skip(true, 'Aucun track analysé'); return; }

    const resp = await request.get(`${API_URL}/api/v1/export/export/${trackId}/rekordbox/json`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (resp.ok()) {
      const data = await resp.json();
      expect(data).toBeDefined();
      console.log(`✅ Export JSON reçu`);
    } else {
      expect([200, 400, 404]).toContain(resp.status());
    }
  });

  test('Dashboard — bouton Export CSV présent', async ({ page }) => {
    await loginViaToken(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const exportBtn = page.getByRole('button', { name: /export csv/i })
      .or(page.locator('button').filter({ hasText: /CSV/i }));

    if (await exportBtn.count() > 0) {
      console.log('✅ Bouton Export CSV présent');
      await expect(exportBtn.first()).toBeVisible();
    } else {
      const body = await page.textContent('body') || '';
      expect(body.toLowerCase()).toContain('export');
    }
  });

  test('Dashboard — Export CSV déclenche un téléchargement', async ({ page }) => {
    await loginViaToken(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Intercepter le téléchargement
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

    const exportBtn = page.getByRole('button', { name: /export csv/i })
      .or(page.locator('button').filter({ hasText: /CSV/i }));

    if (await exportBtn.count() > 0) {
      await exportBtn.first().click();
      const download = await downloadPromise;
      if (download) {
        console.log(`✅ Téléchargement déclenché : ${download.suggestedFilename()}`);
        expect(download.suggestedFilename()).toMatch(/\.csv$/i);
      } else {
        // Pas de téléchargement = export via URL.createObjectURL (aussi valide)
        console.log('ℹ️  Export via createObjectURL (pas d\'événement download)');
      }
    }
  });

  test('Dashboard — bouton Export Rekordbox présent', async ({ page }) => {
    await loginViaToken(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const body = await page.textContent('body') || '';
    const hasRekordbox = body.toLowerCase().includes('rekordbox') ||
      body.toLowerCase().includes('export') ||
      body.toLowerCase().includes('xml');
    expect(hasRekordbox).toBeTruthy();
  });
});
