import { describe, expect, it } from 'vitest';
import { appName } from '../src/lib/app-name';

describe('appName', () => {
  it('keeps the product identity stable', () => {
    expect(appName).toBe('FieldPilot');
  });
});
