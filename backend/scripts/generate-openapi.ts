import { writeFile } from 'node:fs/promises';
import { createApiApp, createOpenApiDocument } from '../src/bootstrap/api-app';
import { loadConfig } from '../src/config/app.config';

async function main() {
  const app = await createApiApp(loadConfig({ NODE_ENV: 'test' }));
  await app.init();
  await writeFile(
    'openapi.json',
    `${JSON.stringify(createOpenApiDocument(app), null, 2)}\n`,
  );
  await app.close();
}

void main();
