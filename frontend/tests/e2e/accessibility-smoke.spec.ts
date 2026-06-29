import { expect, test } from '@playwright/test';

test('home has basic accessible structure', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/FieldPilot/);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: 'FieldPilot' }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Starter routes' }),
  ).toBeVisible();
});
