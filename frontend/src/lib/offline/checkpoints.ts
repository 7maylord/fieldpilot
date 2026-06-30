import { db, type FieldPilotDatabase } from './database';

const key = (organizationId: string) => `checkpoint:${organizationId}`;

export async function getCheckpoint(
  organizationId: string,
  database: FieldPilotDatabase = db,
) {
  const checkpoint = await database.syncState.get(key(organizationId));
  return typeof checkpoint?.value === 'string' ? checkpoint.value : null;
}

export async function setCheckpoint(
  organizationId: string,
  checkpoint: string,
  database: FieldPilotDatabase = db,
) {
  await database.syncState.put({ key: key(organizationId), value: checkpoint });
}
