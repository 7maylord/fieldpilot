import type { LoggerService } from '@nestjs/common';

const sensitiveKey = /authorization|cookie|password|secret|token/i;

export class JsonLogger implements LoggerService {
  log(message: unknown, ...optional: unknown[]) {
    this.write('info', message, optional);
  }

  error(message: unknown, ...optional: unknown[]) {
    this.write('error', message, optional);
  }

  warn(message: unknown, ...optional: unknown[]) {
    this.write('warn', message, optional);
  }

  debug(message: unknown, ...optional: unknown[]) {
    this.write('debug', message, optional);
  }

  verbose(message: unknown, ...optional: unknown[]) {
    this.write('trace', message, optional);
  }

  private write(level: string, message: unknown, optional: unknown[]) {
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message: redact(message),
      details: redact(optional),
    });
    if (level === 'error') console.error(entry);
    else console.log(entry);
  }
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      sensitiveKey.test(key) ? '[REDACTED]' : redact(nested),
    ]),
  );
}
