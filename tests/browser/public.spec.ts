import { expect, test } from '@playwright/test';

test('landing page opens without an application error', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TrustVault', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Unable to open your account')).toHaveCount(0);
});

test('login offers signup and password recovery', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(page.getByLabel('Display Name')).toBeVisible();
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
});

test('recovery page requires matching new passwords', async ({ page }) => {
  await page.goto('/reset-password');
  await page.getByLabel('New password', { exact: true }).fill('example-password-one');
  await page.getByLabel('Confirm password').fill('example-password-two');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('status')).toHaveText('Passwords must match.');
});

test('anonymous dashboard access redirects to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('anonymous API requests cannot access protected resources', async ({ request }) => {
  for (const path of ['/api/documents', '/api/admin/users', '/api/admin/stats', '/api/admin/settings', '/api/audit']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(401);
  }
});
