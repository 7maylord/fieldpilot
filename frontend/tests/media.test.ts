import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { FieldPilotDatabase } from '../src/lib/offline/database';
import { captureMedia, hashBlob } from '../src/lib/offline/media';

const database = new FieldPilotDatabase('fieldpilot-media-test');

afterEach(() => database.mediaRecords.clear());

describe('offline media', () => {
  it('creates a stable SHA-256 integrity hash', async () => {
    expect(await hashBlob(new Blob(['fieldpilot']))).toBe(
      '5dbf779846834c37b1c60a16471c340b8faeb60193914a900cbb2fedd04c7030',
    );
  });

  it('preserves the immutable original bytes and their integrity hash', async () => {
    const original = new Blob(['original evidence'], { type: 'image/png' });
    const record = await captureMedia(
      original,
      {
        organizationId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
        entityType: 'inspection',
        entityId: crypto.randomUUID(),
        mediaType: 'photo',
      },
      database,
    );

    expect(await record.originalFile?.text()).toBe('original evidence');
    expect(record.sha256).toBe(await hashBlob(original));
    expect((await database.mediaRecords.get(record.id))?.sha256).toBe(
      record.sha256,
    );
  });
});
