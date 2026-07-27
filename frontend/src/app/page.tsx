import { cookies } from 'next/headers';
import { LandingPage } from '../components/landing-page';
import { apiBase } from '../lib/api';

export default async function HomePage() {
  return <LandingPage workspaceHref={await workspaceHref()} />;
}

async function workspaceHref() {
  const cookie = (await cookies()).toString();
  if (!cookie.includes('fieldpilot_session=')) return undefined;
  try {
    const response = await fetch(`${apiBase}/organizations`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!response.ok) return undefined;
    const organizations = (await response.json()) as { slug: string }[];
    return organizations[0]?.slug
      ? `/${organizations[0].slug}/dashboard`
      : '/organizations';
  } catch {
    return undefined;
  }
}
