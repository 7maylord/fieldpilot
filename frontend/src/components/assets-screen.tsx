'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { apiRequest } from '../lib/api';

export function AssetsScreen({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
  const client = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const organization = useQuery({
    queryKey: ['organization', organizationSlug],
    queryFn: async () => {
      const rows =
        await apiRequest<{ id: string; slug: string }[]>('/organizations');
      const match = rows.find(({ slug }) => slug === organizationSlug);
      if (!match) throw new Error('Organization not found');
      return match;
    },
  });
  const projects = useQuery({
    queryKey: ['projects', organization.data?.id],
    enabled: Boolean(organization.data),
    queryFn: () =>
      apiRequest<{ id: string; name: string }[]>(
        `/organizations/${organization.data!.id}/projects`,
      ),
  });
  useEffect(() => {
    if (!projectId && projects.data?.[0]) setProjectId(projects.data[0].id);
  }, [projectId, projects.data]);
  const types = useQuery({
    queryKey: ['asset-types', organization.data?.id],
    enabled: Boolean(organization.data),
    queryFn: () =>
      apiRequest<{ id: string; name: string }[]>(
        `/organizations/${organization.data!.id}/assets/types`,
      ),
  });
  const assets = useQuery({
    queryKey: ['assets', organization.data?.id, projectId],
    enabled: Boolean(projectId),
    queryFn: () =>
      apiRequest<
        {
          id: string;
          name: string;
          qrCode: string;
          status: string;
          assetType: { name: string };
        }[]
      >(
        `/organizations/${organization.data!.id}/assets?projectId=${projectId}`,
      ),
  });
  const create = useMutation({
    mutationFn: (body: object) =>
      apiRequest(`/organizations/${organization.data!.id}/assets`, {
        method: 'POST',
        body: JSON.stringify({ projectId, ...body }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['assets'] });
      toast.success('Asset created.');
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({
      name: data.get('name'),
      qrCode: data.get('qrCode'),
      assetTypeId: data.get('assetTypeId'),
    });
    event.currentTarget.reset();
  }
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Register and history</p>
          <h1>Assets</h1>
        </div>
      </section>
      <label className="inline-field">
        Project
        <select
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        >
          {projects.data?.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <div className="domain-grid">
        <section className="panel">
          <h2>Asset register</h2>
          <ul className="domain-list">
            {assets.data?.map((asset) => (
              <li key={asset.id}>
                <div>
                  <strong>{asset.name}</strong>
                  <span>
                    {asset.assetType.name} · {asset.qrCode} · {asset.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {!assets.data?.length && <p>No assets in this project.</p>}
        </section>
        <section className="panel">
          <h2>Register asset</h2>
          <form className="project-form" onSubmit={submit}>
            <label>
              Name
              <input name="name" required />
            </label>
            <label>
              QR code
              <input name="qrCode" required />
            </label>
            <label>
              Type
              <select name="assetTypeId" required>
                {types.data?.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              disabled={!projectId || !types.data?.length || create.isPending}
            >
              Create asset
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
