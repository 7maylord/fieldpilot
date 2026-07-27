import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { apiBase } from './api';

export async function requireSession() {
  const store = await cookies();
  if (!store.has('fieldpilot_session')) notFound();
  const cookie = store.toString();
  const response = await fetch(`${apiBase}/auth/me`, {
    headers: { cookie },
    cache: 'no-store',
  });
  if (!response.ok) notFound();
  return cookie;
}

export async function requireOrganizationAccess(slug: string) {
  const cookie = await requireSession();
  const response = await fetch(`${apiBase}/organizations`, {
    headers: { cookie },
    cache: 'no-store',
  });
  if (!response.ok) notFound();
  const organizations = (await response.json()) as { slug: string }[];
  if (!organizations.some((organization) => organization.slug === slug))
    notFound();
}
