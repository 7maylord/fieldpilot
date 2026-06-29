import { existsSync, readdirSync } from 'node:fs';

const schema = new URL('../prisma/schema.prisma', import.meta.url);
const migrations = new URL('../prisma/migrations', import.meta.url);

if (
  existsSync(schema) &&
  (!existsSync(migrations) || readdirSync(migrations).length === 0)
) {
  throw new Error('prisma/schema.prisma exists without a migration');
}

console.log('Migration layout check passed');
