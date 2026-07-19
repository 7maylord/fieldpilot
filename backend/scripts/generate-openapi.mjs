import 'reflect-metadata';
import { writeFile } from 'node:fs/promises';

const apiApp = await import('../dist/bootstrap/api-app.js');
const appConfig = await import('../dist/config/app.config.js');

const { createApiApp, createOpenApiDocument } = apiApp.default ?? apiApp;
const { loadConfig } = appConfig.default ?? appConfig;

const app = await createApiApp(loadConfig({ NODE_ENV: 'test' }));
await app.init();
await writeFile(
  'openapi.json',
  `${JSON.stringify(createOpenApiDocument(app), null, 2)}\n`,
);
await app.close();
