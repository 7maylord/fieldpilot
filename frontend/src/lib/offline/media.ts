import { db, type FieldPilotDatabase, type MediaRecord } from './database';

export async function captureMedia(
  file: Blob,
  scope: {
    organizationId: string;
    projectId: string;
    entityType: string;
    entityId: string;
    mediaType: MediaRecord['mediaType'];
  },
  database: FieldPilotDatabase = db,
) {
  if (!file.size) throw new Error('Media file is empty');
  const id = crypto.randomUUID();
  const [processed, thumbnail, sha256] = await Promise.all([
    scope.mediaType === 'photo' ? resizeImage(file, 2048, 0.82) : file,
    scope.mediaType === 'photo' ? resizeImage(file, 320, 0.72) : undefined,
    hashBlob(file),
  ]);
  const now = new Date().toISOString();
  const record: MediaRecord = {
    id,
    ...scope,
    originalFile: file,
    file: processed,
    thumbnail,
    sha256,
    uploadedParts: [],
    uploadState: 'local',
    organizationId: scope.organizationId,
    serverVersion: 0,
    localUpdatedAt: now,
    serverUpdatedAt: null,
    syncState: 'pending',
    tombstone: false,
  };
  await database.mediaRecords.add(record);
  return record;
}

export async function uploadMedia(
  mediaId: string,
  database: FieldPilotDatabase = db,
) {
  const record = await database.mediaRecords.get(mediaId);
  if (
    !record?.file ||
    !record.sha256 ||
    !record.projectId ||
    !record.entityType ||
    !record.entityId
  )
    throw new Error('Local media record is incomplete');
  const original = record.originalFile ?? record.file;
  let session: {
    mediaId: string;
    sessionId?: string;
    partSize?: number;
    partUrls: { partNumber: number; url: string }[];
  };
  if (record.uploadSessionId) {
    session = await api(
      `/organizations/${record.organizationId}/media/upload-sessions/${record.uploadSessionId}`,
    );
  } else {
    session = await api(
      `/organizations/${record.organizationId}/media/upload-sessions`,
      {
        method: 'POST',
        body: JSON.stringify({
          mediaId: record.id,
          projectId: record.projectId,
          mimeType: original.type,
          byteSize: original.size,
          sha256: record.sha256,
          entityType: record.entityType,
          entityId: record.entityId,
        }),
      },
    );
    record.uploadSessionId = session.sessionId!;
    await database.mediaRecords.update(mediaId, {
      uploadSessionId: record.uploadSessionId,
      uploadState: 'uploading',
    });
  }
  const completed = [...(record.uploadedParts ?? [])];
  const size = session.partSize ?? 5 * 1024 * 1024;
  for (const part of session.partUrls) {
    if (completed.some(({ partNumber }) => partNumber === part.partNumber))
      continue;
    const response = await fetch(part.url, {
      method: 'PUT',
      body: original.slice(
        (part.partNumber - 1) * size,
        part.partNumber * size,
      ),
    });
    if (!response.ok) throw new Error(`Media part ${part.partNumber} failed`);
    const etag = response.headers.get('etag');
    if (!etag) throw new Error('Object storage did not return an ETag');
    completed.push({ partNumber: part.partNumber, etag });
    await database.mediaRecords.update(mediaId, { uploadedParts: completed });
  }
  await api(
    `/organizations/${record.organizationId}/media/upload-sessions/${record.uploadSessionId}/complete`,
    { method: 'POST', body: JSON.stringify({ parts: completed }) },
  );
  if (record.file !== original)
    await uploadDerivative(record, record.file, 'compressed');
  if (record.thumbnail)
    await uploadDerivative(record, record.thumbnail, 'thumbnail');
  await database.mediaRecords.update(mediaId, {
    uploadState: 'uploaded',
    syncState: 'synced',
  });
}

async function uploadDerivative(
  record: MediaRecord,
  file: Blob,
  derivativeType: 'compressed' | 'thumbnail',
) {
  const session = await api<{
    sessionId: string;
    partSize: number;
    partUrls: { partNumber: number; url: string }[];
  }>(`/organizations/${record.organizationId}/media/upload-sessions`, {
    method: 'POST',
    body: JSON.stringify({
      projectId: record.projectId,
      mimeType: file.type,
      byteSize: file.size,
      sha256: await hashBlob(file),
      entityType: record.entityType,
      entityId: record.entityId,
      sourceMediaId: record.id,
      derivativeType,
    }),
  });
  const parts = [];
  for (const part of session.partUrls) {
    const response = await fetch(part.url, {
      method: 'PUT',
      body: file.slice(
        (part.partNumber - 1) * session.partSize,
        part.partNumber * session.partSize,
      ),
    });
    if (!response.ok)
      throw new Error(`${derivativeType} part ${part.partNumber} failed`);
    const etag = response.headers.get('etag');
    if (!etag) throw new Error('Object storage did not return an ETag');
    parts.push({ partNumber: part.partNumber, etag });
  }
  await api(
    `/organizations/${record.organizationId}/media/upload-sessions/${session.sessionId}/complete`,
    { method: 'POST', body: JSON.stringify({ parts }) },
  );
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiRequest } = await import('../api');
  return apiRequest<T>(path, init);
}

export async function hashBlob(blob: Blob) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await blob.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function resizeImage(file: Blob, maxDimension: number, quality: number) {
  if (
    typeof createImageBitmap === 'undefined' ||
    typeof document === 'undefined'
  )
    return file;
  const image = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Image processing failed')),
      'image/jpeg',
      quality,
    ),
  );
}
