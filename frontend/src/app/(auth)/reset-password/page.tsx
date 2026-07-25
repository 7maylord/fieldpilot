'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { apiRequest } from '../../../lib/api';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  async function requestReset() {
    setMessage('');
    await apiRequest('/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    setMessage('If the account exists, a reset link was sent.');
  }

  async function completeReset() {
    setMessage('');
    await apiRequest('/auth/password-reset/complete', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
    setMessage('Password reset. You can sign in now.');
  }

  return (
    <main className="centered-state">
      <section className="auth-card">
        <h1>Reset password</h1>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void (token ? completeReset() : requestReset()).catch((caught) =>
              setMessage(
                caught instanceof Error ? caught.message : 'Reset failed',
              ),
            );
          }}
        >
          {!token && (
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          )}
          {token && (
            <>
              <label>
                Reset token
                <input
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                />
              </label>
              <label>
                New password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
            </>
          )}
          <button type="submit">
            {token ? 'Set new password' : 'Send reset link'}
          </button>
        </form>
        {message && <p role="status">{message}</p>}
        <p>
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
