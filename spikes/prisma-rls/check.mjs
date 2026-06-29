import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const organizationA = 'a0000000-0000-0000-0000-000000000001';
const organizationB = 'b0000000-0000-0000-0000-000000000001';

async function inOrganization(organizationId, operation) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    return operation(tx);
  });
}

async function main() {
  assert.equal(
    await prisma.workOrder.count(),
    0,
    'queries without tenant context must fail closed',
  );

  const apiRows = await inOrganization(organizationA, (tx) =>
    tx.workOrder.findMany(),
  );
  assert.deepEqual(
    apiRows.map((row) => row.title),
    ['Organization A work'],
  );

  const rawRows = await inOrganization(
    organizationA,
    (tx) => tx.$queryRaw`SELECT title FROM work_orders ORDER BY title`,
  );
  assert.deepEqual(rawRows, [{ title: 'Organization A work' }]);

  await assert.rejects(
    inOrganization(organizationA, (tx) =>
      tx.workOrder.create({
        data: {
          id: '20000000-0000-0000-0000-000000000002',
          organizationId: organizationB,
          title: 'Cross-tenant insert',
        },
      }),
    ),
    'RLS must reject writes for another tenant',
  );

  const workerRows = await inOrganization(organizationB, (tx) =>
    tx.workOrder.findMany(),
  );
  assert.deepEqual(
    workerRows.map((row) => row.title),
    ['Organization B work'],
  );

  assert.equal(
    await prisma.workOrder.count(),
    0,
    'transaction-local context must not leak',
  );
  console.log('RLS/Prisma spike passed');
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
