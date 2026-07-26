import { expect, test } from '@playwright/test';

test('landing page exposes the primary navigation and action', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/FieldPilot/);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Keep field work moving, wherever the job takes you.',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Get started' })).toBeVisible();
});

test('protected pages render 404 without a valid session cookie', async ({
  page,
}) => {
  for (const path of ['/organizations', '/horizon/dashboard', '/field/today']) {
    await page.goto(path);
    await expect(
      page.getByRole('heading', { name: 'Page not found' }),
    ).toBeVisible();
  }
});

test('sign-in validates locally before authentication', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Enter a valid email address')).toBeVisible();
  await expect(
    page.getByText('Password must be at least 12 characters'),
  ).toBeVisible();
});

test('mobile landing navigation opens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('link', { name: 'Features' })).toBeVisible();
});
