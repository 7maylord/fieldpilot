import { db, type FieldPilotDatabase } from './database';

const lockKey = 'sync-lock';

export async function acquireSyncLock(
  owner: string,
  database: FieldPilotDatabase = db,
  leaseMs = 30_000,
) {
  return database.transaction('rw', database.syncState, async () => {
    const now = Date.now();
    const lock = await database.syncState.get(lockKey);
    if (lock?.owner && (lock.expiresAt ?? 0) > now && lock.owner !== owner)
      return false;
    await database.syncState.put({
      key: lockKey,
      owner,
      expiresAt: now + leaseMs,
    });
    return true;
  });
}

export async function releaseSyncLock(
  owner: string,
  database: FieldPilotDatabase = db,
) {
  await database.transaction('rw', database.syncState, async () => {
    if ((await database.syncState.get(lockKey))?.owner === owner)
      await database.syncState.delete(lockKey);
  });
}
