'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
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

export function AppShell({
  mode,
  children,
}: {
  mode: 'office' | 'field';
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const organizationSlug = pathname.split('/')[1] || 'horizon';
  const links = mode === 'office' ? officeLinks : fieldLinks;

  function sync() {
    setSyncing(true);
    window.setTimeout(() => setSyncing(false), 900);
  }

  async function logout() {
    await apiRequest('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/sign-in');
    router.refresh();
  }

  return (
    <div className="app-frame">
      <header className="glass topbar">
        <Link className="brand" href="/">
          FieldPilot
        </Link>
        <button
          className="organization"
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
        >
          {titleize(organizationSlug)} <span>Workspace</span>
        </button>
        {menuOpen && (
          <div className="organization-menu">
            <Link href="/organizations">Switch organization</Link>
            <button type="button" onClick={() => void logout()}>
              Sign out
            </button>
            <button type="button" onClick={() => setMenuOpen(false)}>
              Close
            </button>
          </div>
        )}
        <nav className="mode-switch" aria-label="Workspace mode">
          <Link
            className={mode === 'office' ? 'active' : ''}
            href={`/${organizationSlug}/dashboard`}
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
        <button
          className="sync-button"
          type="button"
          onClick={sync}
          disabled={syncing}
        >
          {syncing ? 'Syncing…' : 'Synced 2m ago'}
        </button>
        <span className="online">Online</span>
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
        <div className="offline-note">
          <strong>Offline-first active</strong>
          <span>All work is available offline</span>
        </div>
      </aside>
      <main className="workspace">
        <OfflineStatus />
        {children}
      </main>
    </div>
  );
}

function titleize(value: string) {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}
