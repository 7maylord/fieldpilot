import type { ReactNode } from 'react';
import { requireSession } from '../../lib/server-auth';

export default async function FieldLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSession();
  return children;
}
