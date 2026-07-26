'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { apiBase, apiRequest } from '../lib/api';

type Notification = {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export function NotificationsScreen({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
  const client = useQueryClient();
  const organization = useQuery({
    queryKey: ['organization', organizationSlug],
    queryFn: async () => {
      const organizations =
        await apiRequest<{ id: string; slug: string }[]>('/organizations');
      const match = organizations.find(({ slug }) => slug === organizationSlug);
      if (!match) throw new Error('Organization not found');
      return match;
    },
  });
  const notifications = useQuery({
    queryKey: ['notifications', organization.data?.id],
    enabled: Boolean(organization.data),
    queryFn: () =>
      apiRequest<Notification[]>(
        `/organizations/${organization.data!.id}/notifications`,
      ),
    refetchInterval: 30_000,
  });
  useEffect(() => {
    if (!organization.data) return;
    const events = new EventSource(
      `${apiBase}/organizations/${organization.data.id}/notifications/stream`,
      { withCredentials: true },
    );
    events.addEventListener('notification', () => {
      void client.invalidateQueries({ queryKey: ['notifications'] });
    });
    return () => events.close();
  }, [client, organization.data]);
  const read = useMutation({
    mutationFn: (id: string) =>
      apiRequest(
        `/organizations/${organization.data!.id}/notifications/${id}/read`,
        {
          method: 'PATCH',
        },
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Notification marked read.');
    },
  });
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Updates</p>
          <h1>Notifications</h1>
        </div>
      </section>
      <section className="panel">
        {notifications.data?.length ? (
          <ul className="domain-list">
            {notifications.data.map((notification) => (
              <li key={notification.id}>
                <div>
                  <strong>{notification.title}</strong>
                  <span>{notification.body}</span>
                </div>
                {!notification.readAt && (
                  <button
                    type="button"
                    onClick={() => read.mutate(notification.id)}
                  >
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>No notifications yet.</p>
        )}
      </section>
    </>
  );
}
