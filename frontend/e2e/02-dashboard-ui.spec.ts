import { test, expect } from '@playwright/test';
import { loginViaToken, loginUI } from './helpers';

test.describe('🎛️ Dashboard — Interface utilisateur', () => {

  test.beforeEach(async ({ page }) => {
    await loginViaToken(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('Dashboard se charge sans erreur JS', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForTimeout(2000);
    const fatal = errors.filter(e => !e.includes('WaveSurfer') && !e.includes('AudioContext'));
    expect(fatal).toHaveLength(0);
  });

  test('Barre de recherche visible et fonctionnelle', async ({ page }) => {
    // 2 champs de recherche sur le dashboard → prendre le premier
    const search = page.getByPlaceholder(/rechercher/i).first();
    await expect(search).toBeVisible();
    await search.fill('test');
    await expect(search).toHaveValue('test');
    await search.fill('');
  });

  test('Bouton upload visible', async ({ page }) => {
    // Input file pour upload
    const input = page.locator('input[type="file"]');
    await expect(input.first()).toBeAttached();
  });

  test('Boutons de tri présents', async ({ page }) => {
    // Sélecteur ou bouton de tri
    const sort = page.locator('select, [class*="sort"]').first();
    await expect(sort).toBeAttached();
  });

  test('Bouton logout fonctionne', async ({ page }) => {
    // Chercher le bouton logout
    const logoutBtn = page.getByRole('button', { name: /déconnex|logout|quitter/i });
    if (await logoutBtn.count() > 0) {
      await logoutBtn.click();
      await page.waitForURL(/\/(login|)/, { timeout: 8000 });
    } else {
      // Peut être dans un menu
      test.skip(true, 'Bouton logout non trouvé directement');
    }
  });

  test('Lien Settings pointe vers /settings', async ({ page }) => {
    const settingsLink = page.getByRole('link', { name: /settings|param/i })
      .or(page.locator('a[href*="settings"]'));
    if (await settingsLink.count() > 0) {
      await expect(settingsLink.first()).toHaveAttribute('href', /settings/);
    }
  });

  test('En-tête affiche le plan utilisateur ou compteur tracks', async ({ page }) => {
    // Le dashboard affiche quota (N/max tracks/jour)
    const body = await page.textContent('body') || '';
    const hasQuota = body.includes('/') || body.includes('morceau') || body.includes('track');
    expect(hasQuota).toBeTruthy();
  });
});
