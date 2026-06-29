import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonLogger } from './json-logger';

describe('JsonLogger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('redacts nested secrets', () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    new JsonLogger().log('configured', {
      database: { password: 'do-not-log' },
      token: 'also-secret',
    });
    const entry = output.mock.calls[0]?.[0] as string;
    expect(entry).not.toContain('do-not-log');
    expect(entry).not.toContain('also-secret');
    expect(entry).toContain('[REDACTED]');
  });
});
