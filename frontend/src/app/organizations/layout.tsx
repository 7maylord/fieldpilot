import type { ReactNode } from 'react';
import { requireSession } from '../../lib/server-auth';

export default async function OrganizationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSession();
  return children;
}
