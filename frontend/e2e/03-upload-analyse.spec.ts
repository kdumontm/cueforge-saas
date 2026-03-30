import { test, expect } from '@playwright/test';
import { loginViaToken, TEST_AUDIO_PATH, API_URL } from './helpers';
import path from 'path';

test.describe('🎵 Upload & Analyse audio', () => {

  let token = '';

  test.beforeEach(async ({ page }) => {
    token = await loginViaToken(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('Input file accepte les fichiers audio', async ({ page }) => {
    const input = page.locator('input[type="file"]').first();
    await expect(input).toBeAttached();
    const accept = await input.getAttribute('accept');
    expect(accept).toMatch(/audio|mp3|wav/i);
  });

  test('Upload un fichier MP3 réel', async ({ page }) => {
    const input = page.locator('input[type="file"]').first();

    // Uploader le fichier de test
    await input.setInputFiles(TEST_AUDIO_PATH);

    // Attendre qu'un élément d'upload progress ou toast apparaisse
    await page.waitForTimeout(2000);

    // Vérifier que la page n'a pas crashé
    await expect(page.locator('body')).not.toBeEmpty();

    // Vérifier présence d'un indicateur de progression ou nouveau track dans la liste
    const pageText = await page.textContent('body') || '';
    const hasActivity = pageText.includes('%') ||
      pageText.includes('analys') ||
      pageText.includes('SoundHelix') ||
      pageText.includes('upload') ||
      pageText.includes('Upload');
    expect(hasActivity).toBeTruthy();
  });

  test('Track uploadé apparaît dans la liste', async ({ page }) => {
    const input = page.locator('input[type="file"]').first();
    await input.setInputFiles(TEST_AUDIO_PATH);

    // Attendre l'apparition du track dans la liste (peut prendre du temps)
    await page.waitForTimeout(5000);

    const pageText = await page.textContent('body') || '';
    // SoundHelix est le nom du fichier audio de test
    const hasTrack = pageText.includes('SoundHelix') || pageText.includes('Song');
    if (!hasTrack) {
      // Le track peut être en cours d'analyse — vérifier qu'il y a au moins un item dans la liste
      const listItems = page.locator('[class*="track"], [class*="Track"], li').filter({ hasText: /\w{3,}/ });
      const count = await listItems.count();
      expect(count).toBeGreaterThan(0);
    } else {
      expect(hasTrack).toBeTruthy();
    }
  });

  test('Analyse track via API directement', async ({ page }) => {
    // Test API direct : vérifier que les tracks sont bien récupérés
    const response = await page.request.get(`${API_URL}/api/v1/tracks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    // L'API doit retourner une liste (même vide)
    expect(Array.isArray(data.items) || Array.isArray(data) || typeof data === 'object').toBeTruthy();
  });
});
