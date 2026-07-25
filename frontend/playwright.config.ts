import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:3100' },
  webServer: [
    {
      command:
        'pnpm --dir ../backend build && PORT=3011 FRONTEND_URL=http://localhost:3100 pnpm --dir ../backend start',
      url: 'http://localhost:3011/api/v1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command:
        'NEXT_PUBLIC_API_URL=http://localhost:3011/api/v1 pnpm build && cp -R public .next/standalone/public && cp -R .next/static .next/standalone/.next/static && PORT=3100 HOSTNAME=0.0.0.0 NEXT_PUBLIC_API_URL=http://localhost:3011/api/v1 node .next/standalone/server.js',
      url: 'http://localhost:3100',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
