'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiRequest, errorMessage } from '../../../lib/api';

const signInSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
});
type SignInInput = z.infer<typeof signInSchema>;

export default function SignInPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema) });
  return (
    <main className="centered-state auth-stage">
      <Link className="auth-home-link" href="/">
        ← Back to home
      </Link>
      <section className="auth-card sign-in-card">
        <h1>Welcome back</h1>
        <p>Sign in to your FieldPilot workspace.</p>
        <form
          onSubmit={handleSubmit(async (input) => {
            setError('');
            try {
              await apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify(input),
              });
              toast.success('Signed in.');
              router.push('/organizations');
              router.refresh();
            } catch (caught) {
              const message = errorMessage(caught, 'Sign in failed');
              setError(message);
              toast.error(message);
            }
          })}
          noValidate
        >
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
            />
            {errors.email && (
              <span className="field-error">{errors.email.message}</span>
            )}
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              {...register('password')}
            />
            {errors.password && (
              <span className="field-error">{errors.password.message}</span>
            )}
          </label>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </form>
        <p>
          <Link href="/reset-password">Forgot your password?</Link>
          {' · '}
          <Link href="/sign-up">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
