'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { apiRequest } from '../../../lib/api';

type Organization = { id: string; slug: string };

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvitationForm />
    </Suspense>
  );
}

function AcceptInvitationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [message, setMessage] = useState('');

  async function accept() {
    setMessage('');
    const membership = await apiRequest<{ organizationId: string }>(
      '/invitations/accept',
      { method: 'POST', body: JSON.stringify({ token }) },
    );
    const organizations = await apiRequest<Organization[]>('/organizations');
    const organization = organizations.find(
      ({ id }) => id === membership.organizationId,
    );
    router.push(
      organization ? `/${organization.slug}/dashboard` : '/organizations',
    );
  }

  return (
    <main className="centered-state">
      <section className="auth-card">
        <h1>Accept invitation</h1>
        <p>Sign in with the invited email first, then accept the token.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void accept().catch((caught) =>
              setMessage(
                caught instanceof Error
                  ? caught.message
                  : 'Invitation could not be accepted',
              ),
            );
          }}
        >
          <label>
            Invitation token
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <button type="submit">Accept invitation</button>
        </form>
        {message && (
          <p className="field-error" role="alert">
            {message}
          </p>
        )}
        <p>
          <Link href="/sign-in">Sign in</Link>
          {' · '}
          <Link href="/sign-up">Create account</Link>
        </p>
      </section>
    </main>
  );
}
