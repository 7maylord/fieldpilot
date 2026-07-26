import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { apiBase } from './api';

export async function requireSession() {
  const store = await cookies();
  if (!store.has('fieldpilot_session')) notFound();
  const response = await fetch(`${apiBase}/auth/me`, {
    headers: { cookie: store.toString() },
    cache: 'no-store',
  });
  if (!response.ok) notFound();
}
