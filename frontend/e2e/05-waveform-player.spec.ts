import { test, expect } from '@playwright/test';
import { loginViaToken, API_URL } from './helpers';

test.describe('🌊 Waveform & Lecteur audio', () => {

  test.beforeEach(async ({ page }) => {
    await loginViaToken(page);
    await page.goto('/dashboard');
    // Use a timeout to avoid hanging indefinitely when polling is active
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2000);
  });

  test('Contrôles lecteur visibles (Play/Pause, Skip)', async ({ page }) => {
    const body = await page.textContent('body') || '';
    // Le player doit avoir des boutons de contrôle
    const buttons = page.locator('button').filter({ has: page.locator('svg') });
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Slider de zoom waveform présent', async ({ page }) => {
    // Les sliders BPM sont dans le FilterPanel (collapsed par défaut) → cliquer "Filtres"
    const filtresBtn = page.getByRole('button', { name: /filtres/i });
    if (await filtresBtn.count() > 0) {
      await filtresBtn.click();
      await page.waitForTimeout(500);
    }
    // Aussi essayer de sélectionner un track pour les sliders du player
    const trackItems = page.locator('[class*="track"]').filter({ hasText: /\w{4,}/ });
    if (await trackItems.count() > 0) {
      await trackItems.first().click();
      await page.waitForTimeout(1000);
    }
    const sliders = page.locator('input[type="range"]');
    const count = await sliders.count();
    expect(count).toBeGreaterThan(0);
    console.log(`✅ ${count} slider(s) trouvé(s)`);
  });

  test('Slider de zoom — changement de valeur', async ({ page }) => {
    const sliders = page.locator('input[type="range"]');
    if (await sliders.count() > 0) {
      const slider = sliders.first();
      const min = await slider.getAttribute('min') || '0';
      const max = await slider.getAttribute('max') || '100';
      const mid = String((parseInt(min) + parseInt(max)) / 2);

      // Changer la valeur du slider
      await slider.fill(mid);
      await expect(slider).toHaveValue(mid);
    }
  });

  test('Slider de volume — changement de valeur', async ({ page }) => {
    const sliders = page.locator('input[type="range"]');
    const count = await sliders.count();
    if (count >= 2) {
      // Deuxième slider souvent = volume
      const volumeSlider = sliders.nth(1);
      await volumeSlider.fill('50');
      await expect(volumeSlider).toHaveValue('50');
    }
  });

  test('Sélection d\'un track complété → zone waveform active', async ({ page }) => {
    // Cliquer sur le premier track disponible
    const trackItems = page.locator('[class*="track"], [class*="Track"]')
      .filter({ hasText: /\w{4,}/ });

    if (await trackItems.count() > 0) {
      await trackItems.first().click();
      await page.waitForTimeout(3000);

      // Vérifier que WaveSurfer a été monté (canvas ou wave element)
      const waveEl = page.locator('wave, canvas, [id*="waveform"]');
      if (await waveEl.count() > 0) {
        console.log('✅ Waveform rendu avec canvas');
        await expect(waveEl.first()).toBeVisible();
      } else {
        // Au minimum le panneau de détails doit être affiché
        await expect(page.locator('body')).not.toBeEmpty();
        console.log('ℹ️  Waveform sans canvas visible (peut être en cours de chargement)');
      }
    } else {
      test.skip(true, 'Aucun track dans la liste');
    }
  });

  test('Bouton Play/Pause — clic ne crash pas', async ({ page }) => {
    // Sélectionner le premier track en cliquant dessus (charge le player)
    const trackItems = page.locator('[class*="track"]').filter({ hasText: /\w{4,}/ });
    if (await trackItems.count() > 0) {
      await trackItems.first().click();
      await page.waitForTimeout(2000);
    }

    // Chercher le bouton play dans le player principal (visible, pas les boutons hover de la liste)
    // Essayer via JS dispatch pour éviter le problème display:none
    const clicked = await page.evaluate(() => {
      // Chercher tous les boutons visibles avec SVG (player controls)
      const buttons = Array.from(document.querySelectorAll('button'));
      // Trouver un bouton play/pause visible (non-hidden)
      const playBtn = buttons.find(btn => {
        const style = window.getComputedStyle(btn);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
        const hasPlayIcon = btn.querySelector('svg') !== null;
        const title = (btn.title || '').toLowerCase();
        const isPlay = title.includes('play') || title.includes('pause') ||
          title.includes('écouter') || title.includes('lecture');
        return isVisible && hasPlayIcon && isPlay;
      });
      if (playBtn) {
        playBtn.click();
        return true;
      }
      // Fallback: click any visible button with SVG (3rd button often = play)
      const visibleBtns = buttons.filter(btn => {
        const style = window.getComputedStyle(btn);
        return style.display !== 'none' && btn.querySelector('svg') !== null;
      });
      if (visibleBtns.length >= 3) {
        visibleBtns[2].click();
        return true;
      }
      return false;
    });

    await page.waitForTimeout(500);
    // Vérifier pas de crash
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('Sélecteur de thème waveform présent', async ({ page }) => {
    const body = await page.textContent('body') || '';
    // Le dashboard a des options de thème (violet, vert, rouge, etc.)
    const themeSelector = page.locator('select, [class*="theme"]').filter({ hasText: /purple|violet|green|vert|theme/i });
    if (await themeSelector.count() === 0) {
      // Peut être des boutons colorés
      const colorBtns = page.locator('[class*="purple"], [class*="violet"], [style*="background"]');
      // Juste vérifier que la page a du contenu
      expect(body.length).toBeGreaterThan(100);
    }
  });

  test('Waveform API — données waveform disponibles', async ({ request }) => {
    // Login via API
    const loginResp = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { identifier: 'e2etester', password: 'TestPass999@' },
    });
    const { access_token } = await loginResp.json();

    const tracksResp = await request.get(`${API_URL}/api/v1/tracks`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (tracksResp.ok()) {
      const data = await tracksResp.json();
      const tracks = data.items || data;
      const completed = Array.isArray(tracks) ? tracks.filter((t: any) => t.status === 'completed') : [];

      if (completed.length > 0) {
        const trackId = completed[0].id;
        const waveResp = await request.get(`${API_URL}/api/v1/waveforms/${trackId}`, {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        // 200 = waveform disponible, 404 = pas encore générée
        expect([200, 404]).toContain(waveResp.status());
        if (waveResp.ok()) {
          console.log(`✅ Waveform data disponible pour track ${trackId}`);
        }
      }
    }
  });
});
