'use client';

import { useEffect } from 'react';
import { useUiStore } from '../lib/ui-store';

export function ServiceWorkerLifecycle() {
  const updateAvailable = useUiStore((state) => state.updateAvailable);
  const setUpdateAvailable = useUiStore((state) => state.setUpdateAvailable);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js').then((value) => {
      if (value.waiting) setUpdateAvailable(true);
      value.addEventListener('updatefound', () => {
        value.installing?.addEventListener('statechange', () => {
          if (value.waiting && navigator.serviceWorker.controller)
            setUpdateAvailable(true);
        });
      });
    });
    const reload = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', reload);
    return () =>
      navigator.serviceWorker.removeEventListener('controllerchange', reload);
  }, [setUpdateAvailable]);

  if (!updateAvailable) return null;
  return (
    <div className="update-banner" role="status">
      A FieldPilot update is ready.
      <button
        type="button"
        onClick={() =>
          navigator.serviceWorker
            .getRegistration()
            .then((registration) =>
              registration?.waiting?.postMessage('SKIP_WAITING'),
            )
        }
      >
        Update now
      </button>
    </div>
  );
}
