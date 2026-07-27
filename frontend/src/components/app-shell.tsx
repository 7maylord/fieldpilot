'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { apiRequest } from '../lib/api';
import { OfflineStatus } from './offline-status';

const officeLinks = [
  'Overview',
  'Projects',
  'Sites',
  'Work',
  'Assignments',
  'Dispatch',
  'Assets',
  'Members',
  'Maps',
  'Forms',
  'Reports',
  'Notifications',
];
const fieldLinks = ['Today', 'My work', 'Downloads', 'Conflicts'];
type CurrentUser = { email: string };
type Organization = { id: string; slug: string };

export function AppShell({
  mode,
  children,
}: {
  mode: 'office' | 'field';
  children: ReactNode;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const pathSlug = mode === 'office' ? pathname.split('/')[1] : '';
  const organizations = useQuery({
    queryKey: ['organizations'],
    queryFn: () => apiRequest<Organization[]>('/organizations'),
    retry: false,
  });
  const organization =
    mode === 'office'
      ? organizations.data?.find(({ slug }) => slug === pathSlug)
      : organizations.data?.[0];
  const organizationSlug = organization?.slug ?? pathSlug;
  const brandHref =
    mode === 'field'
      ? '/field/today'
      : organizationSlug
        ? `/${organizationSlug}/dashboard`
        : '/organizations';
  const links = mode === 'office' ? officeLinks : fieldLinks;
  const profile = useQuery({
    queryKey: ['current-user'],
    queryFn: () => apiRequest<CurrentUser>('/auth/me'),
    retry: false,
  });

  async function logout() {
    await apiRequest('/auth/logout', { method: 'POST' }).catch(() => undefined);
    toast.success('Signed out.');
    router.push('/sign-in');
    router.refresh();
  }

  return (
    <div className="app-frame">
      <header className="glass topbar">
        <Link className="brand" href={brandHref}>
          FieldPilot
        </Link>
        <nav className="mode-switch" aria-label="Workspace mode">
          <Link
            className={mode === 'office' ? 'active' : ''}
            href={
              organizationSlug
                ? `/${organizationSlug}/dashboard`
                : '/organizations'
            }
          >
            Office
          </Link>
          <Link
            className={mode === 'field' ? 'active' : ''}
            href="/field/today"
          >
            Field
          </Link>
        </nav>
        <div className="profile-area">
          <button
            className="profile-button"
            type="button"
            aria-label="Profile menu"
            aria-haspopup="dialog"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen(!profileOpen)}
          >
            <span className="profile-avatar" aria-hidden="true">
              {initials(profile.data?.email)}
            </span>
            <span>{profile.data?.email ?? 'Profile'}</span>
          </button>
          {profileOpen && (
            <div className="profile-menu" role="dialog" aria-label="Profile">
              <strong>Signed in</strong>
              <span>{profile.data?.email ?? 'Current account'}</span>
              <Link href="/organizations">Switch organization</Link>
              <button type="button" onClick={() => void logout()}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <aside className="glass sidebar">
        <nav aria-label={`${mode} navigation`}>
          {links.map((label) => {
            const href =
              mode === 'field'
                ? label === 'Today'
                  ? '/field/today'
                  : label === 'My work'
                    ? '/field/work'
                    : '#'
                : label === 'Overview'
                  ? `/${organizationSlug}/dashboard`
                  : label === 'Projects'
                    ? `/${organizationSlug}/projects`
                    : label === 'Sites'
                      ? `/${organizationSlug}/sites`
                      : label === 'Work'
                        ? `/${organizationSlug}/work`
                        : label === 'Assignments'
                          ? `/${organizationSlug}/assignments`
                          : label === 'Dispatch'
                            ? `/${organizationSlug}/dispatch`
                            : label === 'Assets'
                              ? `/${organizationSlug}/assets`
                              : label === 'Members'
                                ? `/${organizationSlug}/members`
                                : label === 'Maps'
                                  ? `/${organizationSlug}/maps`
                                  : label === 'Forms'
                                    ? `/${organizationSlug}/forms`
                                    : label === 'Reports'
                                      ? `/${organizationSlug}/reports`
                                      : label === 'Notifications'
                                        ? `/${organizationSlug}/notifications`
                                        : '#';
            return (
              <Link
                className={pathname === href ? 'active' : ''}
                href={href}
                key={label}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="workspace">
        <OfflineStatus organizationId={organization?.id} />
        {children}
      </main>
    </div>
  );
}

function initials(email?: string) {
  return (email?.trim()[0] ?? 'P').toUpperCase();
}
