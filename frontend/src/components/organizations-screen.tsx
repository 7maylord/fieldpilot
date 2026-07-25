'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { apiRequest } from '../lib/api';

type Organization = { id: string; name: string; slug: string };
const schema = z.object({
  name: z.string().min(2, 'Company name is required'),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words and hyphens')
    .optional()
    .or(z.literal('')),
});
type Input = z.infer<typeof schema>;

export function OrganizationsScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const organizations = useQuery({
    queryKey: ['organizations'],
    queryFn: () => apiRequest<Organization[]>('/organizations'),
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Input>({ resolver: zodResolver(schema) });
  const create = useMutation({
    mutationFn: (input: Input) =>
      apiRequest<Organization>('/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          slug: input.slug || slugify(input.name),
        }),
      }),
    onSuccess: async (organization) => {
      await client.invalidateQueries({ queryKey: ['organizations'] });
      router.push(`/${organization.slug}/dashboard`);
    },
  });

  return (
    <main className="centered-state">
      <section className="auth-card organization-card">
        <h1>Choose an organization</h1>
        <p>Create your company workspace or open one you belong to.</p>
        {organizations.isError ? (
          <p className="field-error" role="alert">
            Sign in to load organizations.
          </p>
        ) : organizations.isLoading ? (
          <p>Loading organizations…</p>
        ) : organizations.data?.length ? (
          <ul className="project-list">
            {organizations.data.map((organization) => (
              <li key={organization.id}>
                <div>
                  <strong>{organization.name}</strong>
                  <span>{organization.slug}</span>
                </div>
                <Link
                  className="primary"
                  href={`/${organization.slug}/dashboard`}
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>No organizations yet. Create the first one below.</p>
        )}
        <form
          className="project-form"
          onSubmit={handleSubmit((input) => create.mutate(input))}
        >
          <label>
            Company name
            <input {...register('name')} placeholder="Kano Works Ltd" />
            {errors.name && (
              <span className="field-error">{errors.name.message}</span>
            )}
          </label>
          <label>
            Slug
            <input {...register('slug')} placeholder="kano-works" />
            {errors.slug && (
              <span className="field-error">{errors.slug.message}</span>
            )}
          </label>
          <button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create company'}
          </button>
          {create.isError && (
            <p className="field-error" role="alert">
              {create.error.message}
            </p>
          )}
        </form>
        <p>
          <Link href="/accept-invitation">Accept invitation</Link>
        </p>
      </section>
    </main>
  );
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'organization'
  );
}
