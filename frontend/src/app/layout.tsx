import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProviders } from '../components/app-providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'FieldPilot',
  description: 'Offline-first field operations',
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
