'use client';

import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster, toast } from 'sonner';
import { errorMessage } from '../lib/api';
import { ServiceWorkerLifecycle } from './service-worker-lifecycle';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: (error) => toast.error(errorMessage(error)),
        }),
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ServiceWorkerLifecycle />
      {children}
      <Toaster richColors closeButton position="top-right" />
    </QueryClientProvider>
  );
}
