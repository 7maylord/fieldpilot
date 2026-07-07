import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FieldPilotDatabase } from '../src/lib/offline/database';
import { captureMedia, hashBlob, uploadMedia } from '../src/lib/offline/media';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('../src/lib/api', () => ({ apiRequest }));

const database = new FieldPilotDatabase('fieldpilot-media-test');

afterEach(() => {
  apiRequest.mockReset();
  vi.unstubAllGlobals();
  return database.mediaRecords.clear();
});

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

  it('uploads the thumbnail before original evidence and persists the checkpoint', async () => {
    const record = await captureMedia(
      new Blob(['photo'], { type: 'image/png' }),
      {
        organizationId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
        entityType: 'inspection',
        entityId: crypto.randomUUID(),
        mediaType: 'photo',
      },
      database,
    );
    let sessions = 0;
    apiRequest.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/upload-sessions') && init?.method === 'POST') {
        sessions += 1;
        return sessions === 1
          ? {
              mediaId: record.id,
              sessionId: 'original',
              partSize: 10,
              partUrls: [{ partNumber: 1, url: 'https://store/original' }],
            }
          : {
              sessionId: 'thumbnail',
              partSize: 10,
              partUrls: [{ partNumber: 1, url: 'https://store/thumbnail' }],
            };
      }
      return {};
    });
    const uploads: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        uploads.push(url);
        return Promise.resolve(
          new Response(null, { status: 200, headers: { etag: 'etag' } }),
        );
      }),
    );

    await uploadMedia(record.id, database);

    expect(uploads).toEqual([
      'https://store/thumbnail',
      'https://store/original',
    ]);
    expect(
      (await database.mediaRecords.get(record.id))?.thumbnailUploaded,
    ).toBe(true);
  });
});
