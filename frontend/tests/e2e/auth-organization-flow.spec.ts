import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const password = 'correct-horse-battery-staple';

test('owner signup, company creation, invite, and member acceptance work through the UI', async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000);
  const stamp = Date.now();
  const ownerEmail = `amina.bello.${stamp}@example.test`;
  const memberEmail = `chinedu.okafor.${stamp}@example.test`;
  const slug = `lagos-mainland-${stamp}`;

  await signUpAndVerify(page, ownerEmail);
  await signIn(page, ownerEmail);

  await page.goto('/unknown-workspace/dashboard');
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
  await page.goto('/organizations');

  await page
    .getByLabel('Company name')
    .fill('Lagos Mainland Infrastructure Ltd');
  await page.getByLabel('Slug').fill(slug);
  await page.getByRole('button', { name: 'Create company' }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/dashboard`));
  await expect(page.getByText('No projects yet')).toBeVisible();
  await expect(
    page.getByText('Unable to load live dashboard data'),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'FieldPilot' }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/dashboard`));

  await page.goto('/');
  await page.getByRole('link', { name: 'Open workspace' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/dashboard`));

  await page.getByRole('link', { name: 'Maps' }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/maps`));
  await expect(
    page.getByRole('heading', { name: 'Maps', exact: true }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Members' }).click();
  await expect(
    page.getByRole('heading', { name: 'Members', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('li').filter({ hasText: ownerEmail }),
  ).toBeVisible();

  const invitePanel = page.locator('section.panel').filter({
    has: page.getByRole('heading', { name: 'Invite member' }),
  });
  await invitePanel.getByLabel('Email').fill(memberEmail);
  await invitePanel.getByLabel('Role').selectOption('coordinator');
  await invitePanel.getByRole('button', { name: 'Send invite' }).click();
  await expect(invitePanel.getByText('Invite queued.')).toBeVisible();

  const invitation = invitationToken(memberEmail);
  expect(invitation).not.toBe('');

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signUpAndVerify(memberPage, memberEmail);
  await signIn(memberPage, memberEmail);
  await memberPage.goto(
    `/accept-invitation?token=${encodeURIComponent(invitation)}`,
  );
  await memberPage.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(memberPage).toHaveURL(new RegExp(`/${slug}/dashboard`));
  await memberContext.close();

  await page.reload();
  const memberRow = page.locator('li').filter({ hasText: memberEmail });
  await expect(memberRow).toBeVisible();
  const roleForm = page.locator('form').filter({
    has: page.getByRole('heading', { name: 'Change role' }),
  });
  await roleForm
    .locator('select[name="membershipId"]')
    .selectOption({ label: memberEmail });
  await roleForm.locator('select[name="role"]').selectOption('viewer');
  await roleForm.getByRole('button', { name: 'Update role' }).click();
  await expect(memberRow.getByText('viewer')).toBeVisible();

  await page.getByLabel('Team name').fill('Lekki Inspectors');
  await page.getByRole('button', { name: 'Create team' }).click();
  const teamRow = page.locator('li').filter({ hasText: 'Lekki Inspectors' });
  await expect(teamRow).toBeVisible();

  const teamMemberForm = page.locator('form').filter({
    has: page.getByRole('heading', { name: 'Add member to team' }),
  });
  await teamMemberForm.locator('select[name="teamId"]').selectOption({
    label: 'Lekki Inspectors',
  });
  await teamMemberForm.locator('select[name="userId"]').selectOption({
    label: memberEmail,
  });
  await teamMemberForm.getByRole('button', { name: 'Add to team' }).click();
  await expect(
    teamMemberForm.getByText('Team membership saved.'),
  ).toBeVisible();
  await expect(teamRow.getByText(memberEmail)).toBeVisible();
});

async function signUpAndVerify(page: Page, email: string) {
  await page.goto('/sign-up');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(`Verification sent to ${email}`)).toBeVisible();
  const token = emailVerificationToken(email);
  expect(token).not.toBe('');
  await page.getByLabel('Verification token').fill(token);
  await page.getByRole('button', { name: 'Verify email' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
}

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/organizations/);
}

function emailVerificationToken(email: string) {
  return postgresValue(
    `SELECT payload->>'verificationToken' FROM identity_outbox_events WHERE payload->>'email' = '${email}' ORDER BY created_at DESC LIMIT 1`,
  );
}

function invitationToken(email: string) {
  return postgresValue(
    `SELECT payload->>'token' FROM outbox_events WHERE event_type = 'membership.invited' AND payload->>'email' = '${email}' ORDER BY created_at DESC LIMIT 1`,
  );
}

function postgresValue(sql: string) {
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'fieldpilot',
      '-d',
      'fieldpilot',
      '-Atc',
      sql,
    ],
    { cwd: path.resolve(process.cwd(), '..'), encoding: 'utf8' },
  ).trim();
}
