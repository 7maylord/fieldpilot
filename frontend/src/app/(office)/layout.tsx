import type { ReactNode } from 'react';
import { requireSession } from '../../lib/server-auth';

export default async function OfficeLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSession();
  return children;
}
