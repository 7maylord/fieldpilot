import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FieldPilot',
    short_name: 'FieldPilot',
    description: 'Offline-first field operations',
    start_url: '/field/today',
    display: 'standalone',
    background_color: '#e6e8e2',
    theme_color: '#15201c',
    icons: [
      {
        src: '/fieldpilot-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/fieldpilot-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
