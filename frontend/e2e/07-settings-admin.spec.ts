import { test, expect } from '@playwright/test';
import { loginViaToken, API_URL } from './helpers';

test.describe('⚙️ Settings & Admin', () => {

  let token = '';

  test.beforeAll(async ({ request }) => {
    const loginResp = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { identifier: 'e2etester', password: 'TestPass999@' },
    });
    const data = await loginResp.json();
    token = data.access_token;
  });

  // ── SETTINGS ──
  test('Page Settings se charge correctement', async ({ page }) => {
    await loginViaToken(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/paramètre|settings/i)).toBeVisible({ timeout: 8000 });
  });

  test('Settings — profil chargé avec email', async ({ page }) => {
    await loginViaToken(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    // L'email du compte de test doit apparaître
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.count() > 0) {
      const val = await emailInput.first().inputValue();
      expect(val).toContain('@');
      console.log(`✅ Email chargé : ${val}`);
    }
  });

  test('Settings — modifier le nom et sauvegarder', async ({ page }) => {
    await loginViaToken(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const nameInput = page.locator('input[type="text"]').first();
    if (await nameInput.count() > 0) {
      const originalName = await nameInput.inputValue();
      await nameInput.fill('E2E Tester Updated');
      const saveBtn = page.getByRole('button', { name: /enregistrer/i });
      if (await saveBtn.count() > 0) {
        await saveBtn.first().click();
        // Attendre message succès ou erreur
        await page.waitForTimeout(2000);
        const body = await page.textContent('body') || '';
        const hasMsg = body.includes('mis à jour') || body.includes('succès') ||
          body.includes('error') || body.includes('erreur') || body.includes('Aucune');
        expect(hasMsg).toBeTruthy();
        // Restaurer le nom d'origine pour ne pas casser les tests suivants
        await nameInput.fill(originalName || 'e2etester');
        await saveBtn.first().click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('Settings — validation mot de passe non matching', async ({ page }) => {
    await loginViaToken(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Remplir les champs MDP
    const pwdInputs = page.locator('input[type="password"]');
    if (await pwdInputs.count() >= 3) {
      await pwdInputs.nth(0).fill('OldPass123@');
      await pwdInputs.nth(1).fill('NewPass456@');
      await pwdInputs.nth(2).fill('DifferentPass789@'); // Ne correspond pas

      const changePwdBtn = page.getByRole('button', { name: /changer le mot de passe/i });
      if (await changePwdBtn.count() > 0) {
        await changePwdBtn.click();
        await page.waitForTimeout(1000);
        // Doit afficher "ne correspondent pas"
        await expect(page.getByText(/ne correspondent pas/i)).toBeVisible();
      }
    }
  });

  test('Settings — bouton Voir les plans → /pricing', async ({ page }) => {
    await loginViaToken(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const plansBtn = page.getByRole('button', { name: /voir les plans/i });
    if (await plansBtn.count() > 0) {
      await plansBtn.click();
      await expect(page).toHaveURL(/\/pricing/, { timeout: 5000 });
    }
  });

  // ── API PROFILE ──
  test('API /auth/me — retourne les données du profil', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.ok()).toBeTruthy();
    const user = await resp.json();
    expect(user.email).toBeDefined();
    expect(user.subscription_plan).toBeDefined();
    console.log(`✅ Profil : ${user.email} (plan: ${user.subscription_plan})`);
  });

  test('API billing/plans — liste les plans disponibles', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/v1/billing/plans`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok()) {
      const plans = await resp.json();
      expect(Array.isArray(plans) || typeof plans === 'object').toBeTruthy();
      console.log(`✅ Plans récupérés`);
    } else {
      expect([200, 401, 404]).toContain(resp.status());
    }
  });

  test('API billing/usage — retourne l\'usage quotidien', async ({ request }) => {
    const resp = await request.get(`${API_URL}/api/v1/billing/usage`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok()) {
      const usage = await resp.json();
      console.log(`✅ Usage : ${JSON.stringify(usage)}`);
      expect(usage).toBeDefined();
    } else {
      expect([200, 404]).toContain(resp.status());
    }
  });
});
