'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { apiRequest } from '../../../lib/api';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [message, setMessage] = useState('');

  async function submit() {
    setMessage('');
    try {
      await apiRequest('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      setMessage('Email verified. You can sign in now.');
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : 'Verification failed',
      );
    }
  }

  return (
    <main className="centered-state">
      <section className="auth-card">
        <h1>Verify email</h1>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label>
            Verification token
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <button type="submit">Verify email</button>
        </form>
        {message && <p role="status">{message}</p>}
        <p>
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
