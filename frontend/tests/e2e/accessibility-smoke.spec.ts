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

test('office projects screen exposes an accessible creation workflow', async ({
  page,
}) => {
  await page.goto('/horizon/projects');
  await expect(
    page.getByRole('heading', { name: 'Projects', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'All projects' }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Code' }).fill('bad code');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText('Name is required')).toBeVisible();
  await expect(
    page.getByText('Use uppercase letters, numbers, or hyphens'),
  ).toBeVisible();
});

test('form editor adds only approved fields and previews them', async ({
  page,
}) => {
  await page.goto('/horizon/forms');
  await expect(
    page.getByRole('heading', { name: 'Form editor' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add field' }).click();
  await page
    .getByRole('textbox', { name: 'Label' })
    .fill('Concrete temperature');
  await expect(page.getByLabel('Concrete temperature')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled();
});

test('office domain navigation exposes site, work, and assignment workflows', async ({
  page,
}) => {
  await page.goto('/horizon/sites');
  await expect(
    page.getByRole('heading', { name: 'Sites & locations' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Location hierarchy' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New site' })).toBeVisible();

  await page.getByRole('link', { name: 'Work', exact: true }).click();
  await expect(page).toHaveURL(/\/horizon\/work/);
  await expect(
    page.getByRole('heading', { name: 'Work orders' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'New work order' }),
  ).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Photo' })).toBeVisible();

  await page.getByRole('link', { name: 'Assignments', exact: true }).click();
  await expect(page).toHaveURL(/\/horizon\/assignments/);
  await expect(
    page.getByRole('heading', { name: 'Assignments' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Assign work' }),
  ).toBeVisible();
});

test('field shell reloads from the service-worker cache while offline', async ({
  page,
  context,
}) => {
  await page.goto('/field/today');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await expect(
    page.getByRole('heading', { name: 'Today', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'My work' }).click();
  await expect(page.getByRole('heading', { name: 'My Work' })).toBeVisible();
  await context.setOffline(true);
  const startedAt = performance.now();
  await page.reload();
  expect(performance.now() - startedAt).toBeLessThan(1_500);
  await expect(page.getByRole('heading', { name: 'My Work' })).toBeVisible();
  await expect(
    page.getByText('No downloaded work matches this view'),
  ).toBeVisible();
  await context.setOffline(false);
});

test('failed service-worker update keeps the active offline shell', async ({
  page,
  context,
}) => {
  await page.goto('/field/today');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.route('**/sw.js', (route) => route.abort());
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update().catch(() => undefined);
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Today', exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
});

test('mobile landing navigation opens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('link', { name: 'Features' })).toBeVisible();
});
