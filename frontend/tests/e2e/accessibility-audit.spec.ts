import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const path of [
  '/',
  '/sign-in',
  '/horizon/dashboard',
  '/horizon/projects',
  '/horizon/forms',
  '/horizon/dispatch',
  '/horizon/assets',
  '/horizon/reports',
  '/field/today',
  '/field/work',
]) {
  test(`${path} has no detectable WCAG 2.2 A/AA violations`, async ({
    page,
  }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.map(({ target }) => target.join(' ')),
      })),
    ).toEqual([]);
  });
}
