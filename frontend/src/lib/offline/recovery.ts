import { db, type FieldPilotDatabase, type MediaRecord } from './database';

async function serializeMedia(record: MediaRecord) {
  if (!record.file) return record;
  const bytes = new Uint8Array(await record.file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { ...record, file: `data:${record.file.type};base64,${btoa(binary)}` };
}

export async function createRecoveryExport(
  organizationId: string,
  database: FieldPilotDatabase = db,
) {
  const pendingOperations = (
    await database.pendingOperations
      .where('organizationId')
      .equals(organizationId)
      .toArray()
  ).filter((operation) => operation.state !== 'applied');
  const media = await database.mediaRecords
    .where('organizationId')
    .equals(organizationId)
    .toArray();
  return new Blob(
    [
      JSON.stringify({
        version: 1,
        organizationId,
        exportedAt: new Date().toISOString(),
        pendingOperations,
        media: await Promise.all(media.map(serializeMedia)),
      }),
    ],
    { type: 'application/json' },
  );
}

export async function relieveStoragePressure(
  database: FieldPilotDatabase = db,
  ratio = 0.85,
) {
  if (!navigator.storage?.estimate) return false;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  if (!quota || usage / quota < ratio) return false;
  await database.transaction(
    'rw',
    database.cachedDocuments,
    database.referenceData,
    async () => {
      await database.cachedDocuments.clear();
      await database.referenceData.clear();
    },
  );
  return true;
}
