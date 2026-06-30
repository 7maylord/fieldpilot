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

test('office and field shells expose working controls', async ({ page }) => {
  await page.goto('/horizon/dashboard');
  await expect(
    page.getByRole('region', { name: 'Offline work status' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Download package' }).click();
  await expect(page.getByText('Offline package downloaded.')).toBeVisible();
  await page.getByRole('button', { name: 'Synced 2m ago' }).click();
  await expect(page.getByRole('button', { name: 'Syncing…' })).toBeVisible();
  await page.getByRole('button', { name: 'Overdue' }).click();
  await expect(page.getByRole('button', { name: 'Overdue' })).toHaveClass(
    /active/,
  );
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByText('No work is waiting for review')).toBeVisible();
  await page.getByRole('link', { name: 'Field', exact: true }).click();
  await expect(page).toHaveURL(/\/field\/today/);
  await expect(
    page.getByRole('navigation', { name: 'field navigation' }),
  ).toBeVisible();
});

test('sign-in validates locally before authentication', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Enter a valid email address')).toBeVisible();
  await expect(
    page.getByText('Password must be at least 8 characters'),
  ).toBeVisible();
});

test('field shell reloads from the service-worker cache while offline', async ({
  page,
  context,
}) => {
  await page.goto('/field/today');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Today’s Operations' }),
  ).toBeVisible();
  await context.setOffline(false);
});

test('mobile landing navigation opens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('link', { name: 'Features' })).toBeVisible();
});
