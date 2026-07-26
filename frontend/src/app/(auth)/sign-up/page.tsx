'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiRequest, errorMessage } from '../../../lib/api';

const schema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
});
type Input = z.infer<typeof schema>;

export default function SignUpPage() {
  const router = useRouter();
  const [registered, setRegistered] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Input>({ resolver: zodResolver(schema) });

  async function verify() {
    setError('');
    try {
      await apiRequest('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      toast.success('Email verified.');
      router.push('/sign-in');
    } catch (caught) {
      const message = errorMessage(caught, 'Verification failed');
      setError(message);
      toast.error(message);
    }
  }

  return (
    <main className="centered-state">
      <section className="auth-card">
        <h1>Create account</h1>
        <p>Start with your user account. Create the company after sign-in.</p>
        <form
          onSubmit={handleSubmit(async (input) => {
            setError('');
            try {
              await apiRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify(input),
              });
              setRegistered(input.email);
              toast.success('Verification email sent.');
            } catch (caught) {
              const message = errorMessage(caught, 'Signup failed');
              setError(message);
              toast.error(message);
            }
          })}
          noValidate
        >
          <label>
            Email
            <input type="email" autoComplete="email" {...register('email')} />
            {errors.email && (
              <span className="field-error">{errors.email.message}</span>
            )}
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="new-password"
              {...register('password')}
            />
            {errors.password && (
              <span className="field-error">{errors.password.message}</span>
            )}
          </label>
          <button type="submit" disabled={isSubmitting || Boolean(registered)}>
            {isSubmitting ? 'Creating…' : 'Create account'}
          </button>
        </form>
        {registered && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void verify();
            }}
          >
            <p role="status">
              Verification sent to {registered}. Open Mailpit or paste the token
              below.
            </p>
            <label>
              Verification token
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
            <button type="submit">Verify email</button>
          </form>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <p>
          <Link href="/sign-in">Already have an account?</Link>
        </p>
      </section>
    </main>
  );
}
