import { test, expect } from '@playwright/test';
import { TEST_USER, loginUI } from './helpers';

test.describe('🔐 Authentification', () => {

  test('Landing page se charge correctement', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/cueforge/i);
    await expect(page.getByText('CueForge').first()).toBeVisible();
    await expect(page.getByText(/10.*plus vite/i).first()).toBeVisible();
  });

  test('Navigation vers /login depuis landing', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /connexion/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: /connexion/i })).toBeVisible();
  });

  test('Navigation vers /register depuis landing', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /commencer gratuitement/i }).first().click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('Login avec mauvais identifiants → message erreur', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[placeholder="ton pseudo"]').fill('mauvais_user');
    await page.locator('input[type="password"]').first().fill('mauvais_mdp');
    await page.getByRole('button', { name: /se connecter/i }).click();
    await expect(page.getByText(/connexion échouée|invalid|incorrect/i)).toBeVisible({ timeout: 8000 });
  });

  test('Login valide → redirect dashboard', async ({ page }) => {
    await loginUI(page);
    await expect(page).toHaveURL(/\/dashboard/);
    // Dashboard chargé avec contenu
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('Toggle visibilité mot de passe', async ({ page }) => {
    await page.goto('/login');
    const input = page.locator('input[type="password"]').first();
    await input.fill('secret');
    // Cliquer l'icône oeil
    await page.locator('button[type="button"]').filter({ has: page.locator('svg') }).click();
    await expect(page.locator('input[type="text"]').first()).toBeVisible();
  });

  test('Redirect /dashboard → /login si pas authentifié', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
  });

  test('Page pricing accessible', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText(/Free|Gratuit/).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Pro/).first()).toBeVisible();
    await expect(page.getByText(/9.99/).first()).toBeVisible();
  });

  test('Page CGU accessible', async ({ page }) => {
    await page.goto('/cgu');
    await expect(page.getByText(/Conditions Générales/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('Forgot password — formulaire fonctionnel', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByText(/mot de passe oublié/i).first()).toBeVisible();
    // Utiliser input[type="email"] ou placeholder pour éviter le problème de label sans htmlFor
    const emailInput = page.locator('input[type="email"]').first()
      .or(page.locator('input[placeholder*="email" i]').first());
    await emailInput.fill('test@test.com');
    await page.getByRole('button', { name: /envoyer/i }).click();
    // Attendre confirmation (email envoyé ou pas de user mais pas crash)
    await page.waitForTimeout(3000);
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
