import type { ReactNode } from 'react';
import { requireOrganizationAccess } from '../../../lib/server-auth';

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<unknown>;
}) {
  const { organizationSlug } = (await params) as { organizationSlug: string };
  await requireOrganizationAccess(organizationSlug);
  return children;
}
