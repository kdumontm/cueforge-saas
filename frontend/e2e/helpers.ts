import { Page, expect } from '@playwright/test';

export const TEST_USER = {
  username: 'e2etester',
  email: 'e2etester@test.com',
  password: 'TestPass999@',
  name: 'e2etester',
};

// Local backend (dev): no email verification required
// Switch to production URL if needed: https://cueforge-saas-production.up.railway.app
export const API_URL = process.env.E2E_API_URL || 'http://localhost:8000';
export const TEST_AUDIO_PATH = '/sessions/kind-pensive-lovelace/test-audio.mp3';

// Login via UI
export async function loginUI(page: Page) {
  await page.goto('/login');
  // Labels n'ont pas d'attribut "for" → utiliser placeholder
  await page.locator('input[placeholder="ton pseudo"]').fill(TEST_USER.username);
  await page.locator('input[type="password"]').first().fill(TEST_USER.password);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await page.waitForURL('**/dashboard', { timeout: 15000 });
}

// Login via API and set token directly (fast)
export async function loginViaToken(page: Page) {
  const resp = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: TEST_USER.username, password: TEST_USER.password }),
  });
  const data = await resp.json() as { access_token: string };
  await page.goto('/');
  await page.evaluate((token: string) => {
    localStorage.setItem('cueforge_token', token);
  }, data.access_token);
  return data.access_token;
}

// Wait for waveform to load
export async function waitForWaveform(page: Page) {
  await page.waitForSelector('wave, [class*="waveform"], canvas', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);
}
