import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FieldPilot',
    short_name: 'FieldPilot',
    description: 'Offline-first field operations',
    start_url: '/field/today',
    display: 'standalone',
    background_color: '#f8fbff',
    theme_color: '#087ff5',
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
