import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

type NodeEnvironment = 'development' | 'test' | 'production';

export interface AppConfig {
  nodeEnv: NodeEnvironment;
  port: number;
  frontendUrl: string;
  databaseUrl: string;
  redisUrl: string;
  sessionSecret: string;
  accessTokenSecret: string;
  refreshTokenSecret: string;
  offlinePackageTtlHours: number;
  storage: {
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  email: {
    smtpUrl: string;
    from: string;
  };
  otelEndpoint?: string;
  mapProviderToken?: string;
  clamavHost: string;
  clamavPort: number;
}

const developmentDefaults = {
  FRONTEND_URL: 'http://localhost:3000',
  DATABASE_URL:
    'postgresql://fieldpilot_runtime:fieldpilot_runtime@localhost:5433/fieldpilot',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRET: 'development-session-secret-00000000',
  ACCESS_TOKEN_SECRET: 'development-access-secret-000000000',
  REFRESH_TOKEN_SECRET: 'development-refresh-secret-0000000',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'fieldpilot',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'fieldpilot',
  S3_SECRET_ACCESS_KEY: 'fieldpilot-secret',
  EMAIL_SMTP_URL: 'smtp://localhost:1025',
  EMAIL_FROM: 'FieldPilot <noreply@fieldpilot.local>',
} as const;

export function loadLocalEnv(path = '.env') {
  if (existsSync(path)) loadEnvFile(path);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = parseNodeEnvironment(env.NODE_ENV);
  const required = nodeEnv === 'production';
  const value = (name: keyof typeof developmentDefaults) => {
    const configured = env[name]?.trim();
    if (configured) return configured;
    if (required)
      throw new Error(`Missing required environment variable: ${name}`);
    return developmentDefaults[name];
  };

  return {
    nodeEnv,
    port: parsePort(env.PORT),
    frontendUrl: parseOriginUrl('FRONTEND_URL', value('FRONTEND_URL')),
    databaseUrl: parseUrl('DATABASE_URL', value('DATABASE_URL')),
    redisUrl: parseUrl('REDIS_URL', value('REDIS_URL')),
    sessionSecret: parseSecret(
      'SESSION_SECRET',
      value('SESSION_SECRET'),
      required,
    ),
    accessTokenSecret: parseSecret(
      'ACCESS_TOKEN_SECRET',
      value('ACCESS_TOKEN_SECRET'),
      required,
    ),
    refreshTokenSecret: parseSecret(
      'REFRESH_TOKEN_SECRET',
      value('REFRESH_TOKEN_SECRET'),
      required,
    ),
    offlinePackageTtlHours: parsePositiveInteger(
      'OFFLINE_PACKAGE_TTL_HOURS',
      env.OFFLINE_PACKAGE_TTL_HOURS ?? '72',
    ),
    storage: {
      endpoint: parseUrl('S3_ENDPOINT', value('S3_ENDPOINT')),
      bucket: value('S3_BUCKET'),
      region: value('S3_REGION'),
      accessKeyId: value('S3_ACCESS_KEY_ID'),
      secretAccessKey: value('S3_SECRET_ACCESS_KEY'),
    },
    email: {
      smtpUrl: parseUrl('EMAIL_SMTP_URL', value('EMAIL_SMTP_URL')),
      from: value('EMAIL_FROM'),
    },
    otelEndpoint: optionalUrl(
      'OTEL_EXPORTER_OTLP_ENDPOINT',
      env.OTEL_EXPORTER_OTLP_ENDPOINT,
    ),
    mapProviderToken: env.MAP_PROVIDER_TOKEN?.trim() || undefined,
    clamavHost: env.CLAMAV_HOST?.trim() || 'localhost',
    clamavPort: parsePositiveInteger('CLAMAV_PORT', env.CLAMAV_PORT ?? '3310'),
  };
}

export function configSummary(config: AppConfig) {
  return {
    nodeEnv: config.nodeEnv,
    port: config.port,
    frontendUrl: config.frontendUrl,
    storageEndpoint: config.storage.endpoint,
    storageBucket: config.storage.bucket,
    telemetryEnabled: Boolean(config.otelEndpoint),
    mapProviderEnabled: Boolean(config.mapProviderToken),
  };
}

function parseNodeEnvironment(value: string | undefined): NodeEnvironment {
  const nodeEnv = value || 'development';
  if (
    nodeEnv === 'development' ||
    nodeEnv === 'test' ||
    nodeEnv === 'production'
  )
    return nodeEnv;
  throw new Error('NODE_ENV must be development, test, or production');
}

function parsePort(value: string | undefined) {
  const port = Number(value ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error('PORT must be an integer from 1 to 65535');
  return port;
}

function parseUrl(name: string, value: string) {
  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}

function parseOriginUrl(name: string, value: string) {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}

function optionalUrl(name: string, value: string | undefined) {
  const configured = value?.trim();
  return configured ? parseUrl(name, configured) : undefined;
}

function parseSecret(name: string, value: string, enforceLength: boolean) {
  if (enforceLength && value.length < 32)
    throw new Error(`${name} must contain at least 32 characters`);
  return value;
}

function parsePositiveInteger(name: string, value: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
}
