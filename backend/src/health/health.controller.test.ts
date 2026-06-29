import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports a healthy process', () => {
    expect(new HealthController({} as never, {} as never).check()).toEqual({
      status: 'ok',
    });
  });
});
