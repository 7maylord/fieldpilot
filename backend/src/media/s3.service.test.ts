import { describe, expect, it } from 'vitest';
import { S3Service } from './s3.service';

describe('S3Service', () => {
  it('creates short-lived signed private URLs without exposing credentials', () => {
    const url = new URL(
      new S3Service().presign(
        'PUT',
        'organizations/org/projects/project/media/id/original',
        { partNumber: '1', uploadId: 'upload' },
        900,
        new Date('2026-07-03T12:00:00Z'),
      ),
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(url.toString()).not.toContain('fieldpilot-secret');
  });
});
