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
        'NEXT_PUBLIC_API_URL=http://localhost:3011/api/v1 pnpm build && NEXT_PUBLIC_API_URL=http://localhost:3011/api/v1 pnpm start --port 3100',
      url: 'http://localhost:3100',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
