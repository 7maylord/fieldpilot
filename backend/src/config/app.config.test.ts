import { describe, expect, it } from 'vitest';
import { configSummary, loadConfig } from './app.config';

const productionEnv = {
  NODE_ENV: 'production',
  FRONTEND_URL: 'https://app.fieldpilot.example',
  DATABASE_URL: 'postgresql://user:database-password@database:5432/fieldpilot',
  REDIS_URL: 'redis://redis:6379',
  SESSION_SECRET: 'session-secret-with-at-least-32-characters',
  ACCESS_TOKEN_SECRET: 'access-secret-with-at-least-32-characters',
  REFRESH_TOKEN_SECRET: 'refresh-secret-with-at-least-32-characters',
  S3_ENDPOINT: 'https://storage.fieldpilot.example',
  S3_BUCKET: 'fieldpilot',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'access-key',
  S3_SECRET_ACCESS_KEY: 'storage-secret',
  EMAIL_SMTP_URL: 'smtp://mail:1025',
  EMAIL_FROM: 'noreply@fieldpilot.example',
};

describe('loadConfig', () => {
  it('loads typed development defaults', () => {
    const config = loadConfig({ NODE_ENV: 'development' });
    expect(config.port).toBe(3001);
    expect(config.storage.bucket).toBe('fieldpilot');
  });

  it('fails startup when production configuration is missing', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(
      /FRONTEND_URL/,
    );
  });

  it('rejects invalid values without echoing them', () => {
    expect(() =>
      loadConfig({ ...productionEnv, DATABASE_URL: 'database-password' }),
    ).toThrow('DATABASE_URL must be a valid URL');
    expect(() => loadConfig({ ...productionEnv, PORT: '70000' })).toThrow(
      /PORT/,
    );
  });

  it('produces a log summary without secrets', () => {
    const config = loadConfig(productionEnv);
    const summary = JSON.stringify(configSummary(config));
    expect(summary).not.toContain('database-password');
    expect(summary).not.toContain('storage-secret');
    expect(summary).not.toContain('session-secret');
  });
});
